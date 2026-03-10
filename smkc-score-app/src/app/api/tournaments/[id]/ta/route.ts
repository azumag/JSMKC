/**
 * TA (Time Attack) Main API Route
 *
 * Handles CRUD operations for Time Attack entries within a tournament.
 * This is the primary endpoint for managing TA qualification entries.
 *
 * Endpoints:
 * - GET:    Fetch entries for a tournament stage (qualification, revival_1, revival_2)
 * - POST:   Add player(s) to qualification round
 * - PUT:    Update times, lives, or elimination status for an entry
 * - DELETE: Remove an entry from the tournament (admin only)
 *
 * Phase promotion (Phase 1/2/3) is handled by /api/tournaments/[id]/ta/phases.
 *
 * All mutation operations are audit-logged.
 * Promotion operations require admin authentication via NextAuth session.
 *
 * CRITICAL: Logger is created INSIDE each handler function (not at module level)
 * to ensure proper test mocking per the project's mock architecture pattern.
 */

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { createAuditLog, AUDIT_ACTIONS } from "@/lib/audit-log";
import { getClientIdentifier, getUserAgent } from "@/lib/rate-limit";
import { sanitizeInput } from "@/lib/sanitize";
import { auth } from "@/lib/auth";
import type { Session } from "next-auth";
import { z } from "zod";
import { COURSES, type CourseAbbr } from "@/lib/constants";
import { recalculateRanks } from "@/lib/ta/rank-calculation";
import { timeToMs, TimesObjectSchema } from "@/lib/ta/time-utils";
// Promotion functions moved to /api/tournaments/[id]/ta/phases endpoint
import { createLogger } from "@/lib/logger";
import { checkStageFrozen } from "@/lib/ta/freeze-check";
import { createErrorResponse } from "@/lib/error-handling";

/**
 * Admin authentication helper that returns the session.
 * Returns { error } if user is not authenticated or not admin.
 * Returns { session } if authentication succeeds.
 */
async function requireAdminAndGetSession(): Promise<{ error?: NextResponse; session?: Session | null }> {
  const session = await auth();
  if (!session?.user || session.user.role !== 'admin') {
    return { error: createErrorResponse('Forbidden', 403, 'FORBIDDEN') };
  }
  return { session };
}

/**
 * Admin or player session authentication helper.
 * Returns the session object for ownership verification by the caller.
 * Admins have full access; players must additionally verify ownership
 * of the specific resource they are modifying.
 *
 * Returns { error } if user is not authenticated as admin or player.
 * Returns { session } if authentication succeeds.
 */
async function requireAdminOrPlayerSession(): Promise<{ error?: NextResponse; session?: Session | null }> {
  const session = await auth();
  if (session?.user?.role === 'admin') return { session };
  if (session?.user?.userType === 'player') return { session };
  return { error: createErrorResponse('Forbidden', 403, 'FORBIDDEN') };
}

/**
 * Valid tournament stages for TA mode.
 * "qualification" is the initial stage; others are progression stages.
 */
/* "finals" stage removed: legacy promote-to-finals feature was superseded by
 * the Phase 1/2/3 system (via /api/tournaments/[id]/ta/phases).
 * Note: "finals" values may still exist in production DB but are no longer
 * queryable through this endpoint. */
const StageSchema = z.enum(["qualification", "revival_1", "revival_2"]);

/**
 * POST request body schema.
 * Only supports "add" action to add players to qualification.
 * Promotion actions have been moved to /api/tournaments/[id]/ta/phases endpoint.
 */
const PostRequestSchema = z.object({
  /* Prisma uses cuid() for all IDs, not uuid */
  playerId: z.string().cuid().optional(),
  players: z.array(z.string().cuid()).optional(),
  action: z.enum(["add"]).optional(),
}).refine(
  (data) => {
    if (!data.action || data.action === "add") {
      return data.playerId !== undefined || (data.players !== undefined && data.players.length > 0);
    }
    return true;
  },
  { message: "playerId or players array is required" }
);

/**
 * PUT request body schema.
 * Supports multiple update modes:
 * - "update_times": Update course times (requires times object or course+time pair)
 * - "update_lives": Change life count (requires livesDelta)
 * - "eliminate": Set elimination status (requires eliminated boolean)
 * - "reset_lives": Reset all active players' lives to initial value
 */
const PutRequestSchema = z.object({
  entryId: z.string().cuid(),
  course: z.string().optional(),
  time: z.string().optional(),
  times: TimesObjectSchema.optional(),
  livesDelta: z.number().optional(),
  eliminated: z.boolean().optional(),
  action: z.enum(["update_times", "update_lives", "eliminate", "reset_lives"]).optional(),
}).refine(
  (data) => data.action === "update_lives" ? data.livesDelta !== undefined :
            data.action === "eliminate" ? data.eliminated !== undefined :
            data.action === "reset_lives" ? true :
            data.times !== undefined || (data.course !== undefined && data.time !== undefined),
  { message: "Invalid request for action" }
);

/**
 * GET /api/tournaments/[id]/ta
 *
 * Fetch all TA entries for a tournament stage.
 * Returns entries sorted by rank/totalTime, along with course definitions
 * and counts for qualification and finals stages.
 *
 * Query parameters:
 * - stage: "qualification" | "revival_1" | "revival_2" (default: "qualification")
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Logger created inside function for proper test mocking
  const logger = createLogger('ta-api');
  const { id: tournamentId } = await params;
  try {

    // Validate tournament ID format to prevent injection
    /* Prisma generates CUID, not UUID — use .cuid() for ID validation */
    const cuidSchema = z.string().cuid();
    const parseResult = cuidSchema.safeParse(tournamentId);
    if (!parseResult.success) {
      return createErrorResponse("Invalid tournament ID format", 400, "VALIDATION_ERROR");
    }

    // Parse optional stage query parameter (defaults to "qualification")
    const { searchParams } = new URL(request.url);
    const stage = StageSchema.safeParse(searchParams.get("stage"));
    const stageToQuery = stage.success ? stage.data : "qualification";

    // Fetch entries and tournament frozenStages in parallel for efficiency
    const [entries, tournament, qualCount] = await Promise.all([
      prisma.tTEntry.findMany({
        where: { tournamentId, stage: stageToQuery },
        include: { player: true },
        orderBy: [{ rank: "asc" }, { totalTime: "asc" }],
      }),
      prisma.tournament.findUnique({
        where: { id: tournamentId },
        select: { frozenStages: true },
      }),
      prisma.tTEntry.count({
        where: { tournamentId, stage: "qualification" },
      }),
    ]);

    return NextResponse.json({
      entries,
      courses: COURSES,
      stage: stageToQuery,
      qualCount,
      // Return frozen stages so the UI can disable editing for frozen phases
      frozenStages: (tournament?.frozenStages as string[]) || [],
    });
  } catch (error) {
    // Use structured logging for error tracking and debugging
    logger.error("Failed to fetch TA data", { error, tournamentId });
    return createErrorResponse("Failed to fetch time attack data", 500, "INTERNAL_ERROR");
  }
}

/**
 * POST /api/tournaments/[id]/ta
 *
 * Add player(s) to TA qualification round.
 * For promotion to finals phases, use POST /api/tournaments/[id]/ta/phases.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Logger created inside function for proper test mocking
  const logger = createLogger('ta-api');
  const { id: tournamentId } = await params;
  try {

    // Validate tournament ID format
    /* Prisma generates CUID, not UUID — use .cuid() for ID validation */
    const cuidSchema = z.string().cuid();
    const tournamentIdResult = cuidSchema.safeParse(tournamentId);
    if (!tournamentIdResult.success) {
      return createErrorResponse("Invalid tournament ID format", 400, "VALIDATION_ERROR");
    }

    // Sanitize input to prevent XSS/injection attacks
    const body = sanitizeInput(await request.json());

    const parseResult = PostRequestSchema.safeParse(body);
    if (!parseResult.success) {
      return createErrorResponse(parseResult.error.issues[0]?.message || "Invalid request body", 400, "VALIDATION_ERROR");
    }

    const { playerId, players } = parseResult.data;

    // === Add Player to Qualification ===
    const authResult = await requireAdminOrPlayerSession();
    if (authResult.error) return authResult.error;

    // Support both single playerId and batch players array
    const playerIds = players || (playerId ? [playerId] : []);

    // Ownership check: players can only add themselves to qualification.
    // Admins can add any player. This prevents a player from registering
    // other players without admin privileges.
    if (authResult.session!.user.role !== 'admin') {
      const selfPlayerId = authResult.session!.user.playerId;
      const isAddingSelf = playerIds.length > 0 && playerIds.every(pid => pid === selfPlayerId);
      if (!isAddingSelf) {
        return createErrorResponse('Forbidden: Players can only add themselves', 403, 'FORBIDDEN');
      }
    }
    const ipAddress = getClientIdentifier(request);
    const userAgent = getUserAgent(request);

    const createdEntries = [];

    for (const pid of playerIds) {
      // Check for existing entry to prevent duplicates (idempotency)
      const existing = await prisma.tTEntry.findUnique({
        where: {
          tournamentId_playerId_stage: {
            tournamentId,
            playerId: pid,
            stage: "qualification",
          },
        },
      });

      if (!existing) {
        // Create qualification entry with empty times (to be filled in later)
        const entry = await prisma.tTEntry.create({
          data: {
            tournamentId,
            playerId: pid,
            stage: "qualification",
            times: {},
          },
          include: { player: true },
        });
        createdEntries.push(entry);

        // Audit log for accountability (non-critical, failure is logged)
        try {
          await createAuditLog({
            userId: authResult.session!.user.id!,
            ipAddress,
            userAgent,
            action: AUDIT_ACTIONS.CREATE_TA_ENTRY,
            targetId: entry.id,
            targetType: "TTEntry",
            details: {
              tournamentId,
              playerId: pid,
              playerNickname: entry.player.nickname,
            },
          });
        } catch (logError) {
          // Audit log failure is non-critical but should be logged for security tracking
          logger.warn("Failed to create audit log", { error: logError, tournamentId, entryId: entry?.id, action: 'CREATE_TA_ENTRY' });
        }
      }
    }

    return NextResponse.json(
      { message: "Player(s) added to time attack", entries: createdEntries },
      { status: 201 }
    );
  } catch (error) {
    // Use structured logging for error tracking and debugging
    logger.error("Failed to add player to TA", { error, tournamentId });
    return createErrorResponse((error as Error).message || "Failed to add player to time attack", 500, "INTERNAL_ERROR");
  }
}

/**
 * PUT /api/tournaments/[id]/ta
 *
 * Update a TA entry's times, lives, or elimination status.
 *
 * Actions:
 * - "eliminate": Set elimination status (auth required)
 * - "update_lives": Modify life count by delta
 * - "update_times" / default: Update course time(s)
 *
 * After any update, ranks are automatically recalculated for the affected stage.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Logger created inside function for proper test mocking
  const logger = createLogger('ta-api');
  const { id: tournamentId } = await params;
  try {

    // Validate tournament ID format
    /* Prisma generates CUID, not UUID — use .cuid() for ID validation */
    const cuidSchema = z.string().cuid();
    const tournamentIdResult = cuidSchema.safeParse(tournamentId);
    if (!tournamentIdResult.success) {
      return createErrorResponse("Invalid tournament ID format", 400, "VALIDATION_ERROR");
    }

    // Sanitize and validate request body
    const body = sanitizeInput(await request.json());

    const parseResult = PutRequestSchema.safeParse(body);
    if (!parseResult.success) {
      return createErrorResponse(parseResult.error.issues[0]?.message || "Invalid request body", 400, "VALIDATION_ERROR");
    }

    const { entryId, action, eliminated, livesDelta } = parseResult.data;

    // === Lives Actions ===
    // Manually update or reset player lives (admin only)
    if (action === "update_lives" || action === "reset_lives") {
      const authResult = await requireAdminAndGetSession();
      if (authResult.error) return authResult.error;

      const entry = await prisma.tTEntry.findUnique({
        where: { id: entryId },
        include: { player: true },
      });

      if (!entry) {
        return createErrorResponse('Entry not found', 404, 'NOT_FOUND');
      }

      // Reject lives changes if the entry's stage is frozen
      const livesFreeze = await checkStageFrozen(prisma, tournamentId, entry.stage);
      if (livesFreeze) return livesFreeze;

      const updatedEntry = await prisma.tTEntry.update({
        where: { id: entryId },
        data: action === "reset_lives" ? { lives: 3 } : { lives: { increment: livesDelta } },
        include: { player: true },
      });

      await recalculateRanks(tournamentId, entry.stage, prisma);

      const ipAddress = getClientIdentifier(request);
      const userAgent = getUserAgent(request);
      try {
        await createAuditLog({
          userId: authResult.session!.user.id!,
          ipAddress,
          userAgent,
          action: AUDIT_ACTIONS.UPDATE_TA_ENTRY,
          targetId: entryId,
          targetType: "TTEntry",
          details: {
            tournamentId,
            playerNickname: updatedEntry.player.nickname,
            action,
          },
        });
      } catch (logError) {
        logger.warn("Failed to create audit log", { error: logError, tournamentId, entryId, action: 'UPDATE_TA_ENTRY_LIVES' });
      }

      return NextResponse.json({ entry: updatedEntry });
    }

    // === Elimination Action ===
    // Manually eliminate or un-eliminate a player (admin only)
    if (action === "eliminate") {
      const authResult = await requireAdminAndGetSession();
      if (authResult.error) return authResult.error;

      if (eliminated === undefined) {
        return createErrorResponse("eliminated boolean is required", 400, "VALIDATION_ERROR");
      }

      const entry = await prisma.tTEntry.findUnique({
        where: { id: entryId },
        include: { player: true },
      });

      if (!entry) {
        return createErrorResponse('Entry not found', 404, 'NOT_FOUND');
      }

      // Reject elimination changes if the entry's stage is frozen
      const elimFreeze = await checkStageFrozen(prisma, tournamentId, entry.stage);
      if (elimFreeze) return elimFreeze;

      const updatedEntry = await prisma.tTEntry.update({
        where: { id: entryId },
        data: { eliminated },
        include: { player: true },
      });

      // Recalculate ranks after elimination status change
      await recalculateRanks(tournamentId, entry.stage, prisma);

      const ipAddress = getClientIdentifier(request);
      const userAgent = getUserAgent(request);
      try {
        await createAuditLog({
          userId: authResult.session!.user.id!,
          ipAddress,
          userAgent,
          action: AUDIT_ACTIONS.UPDATE_TA_ENTRY,
          targetId: entryId,
          targetType: "TTEntry",
          details: {
            tournamentId,
            playerNickname: updatedEntry.player.nickname,
            eliminated,
            manualUpdate: true,
          },
        });
      } catch (logError) {
        // Audit log failure is non-critical but should be logged for security tracking
        logger.warn("Failed to create audit log", { error: logError, tournamentId, entryId, action: 'UPDATE_TA_ENTRY_ELIMINATE' });
      }

      return NextResponse.json({ entry: updatedEntry });
    }

    // === Time Update Action ===
    // Update course times (single course or bulk)
    const { course, time, times: bulkTimes } = parseResult.data;

    const authResult = await requireAdminOrPlayerSession();
    if (authResult.error) return authResult.error;

    const entry = await prisma.tTEntry.findUnique({
      where: { id: entryId },
    });

    if (!entry) {
      return createErrorResponse('Entry not found', 404, 'NOT_FOUND');
    }

    // Reject time updates if the entry's stage is frozen by an admin
    const timeFreeze = await checkStageFrozen(prisma, tournamentId, entry.stage);
    if (timeFreeze) return timeFreeze;

    // Ownership check: players can only update their own entry's times.
    // Admins can update any entry. This prevents a player from modifying
    // another player's recorded times.
    if (authResult.session!.user.role !== 'admin') {
      if (authResult.session!.user.playerId !== entry.playerId) {
        return createErrorResponse('Forbidden: You can only update your own times', 403, 'FORBIDDEN');
      }
    }

    // Merge new times with existing times
    const currentTimes = (entry.times as Record<string, string>) || {};
    let updatedTimes: Record<string, string>;

    if (bulkTimes) {
      // Bulk update: merge all provided times with existing
      updatedTimes = { ...currentTimes, ...bulkTimes };
    } else if (course && time !== undefined) {
      // Single course update: validate course abbreviation
      if (!COURSES.includes(course as CourseAbbr)) {
        return createErrorResponse("Invalid course abbreviation", 400, "VALIDATION_ERROR");
      }
      updatedTimes = { ...currentTimes, [course]: time };
    } else {
      return createErrorResponse("Either (course and time) or times object is required", 400, "VALIDATION_ERROR");
    }

    // Validate all time formats before saving
    for (const [c, t] of Object.entries(updatedTimes)) {
      if (t && t !== "" && timeToMs(t) === null) {
        return createErrorResponse(`Invalid time format for ${c}: ${t}`, 400, "VALIDATION_ERROR");
      }
    }

    // Persist the updated times
    await prisma.tTEntry.update({
      where: { id: entryId },
      data: { times: updatedTimes },
    });

    // Recalculate ranks after time change to update standings
    await recalculateRanks(tournamentId, entry.stage, prisma);

    // Fetch the fully updated entry with player data for the response
    const finalEntry = await prisma.tTEntry.findUnique({
      where: { id: entryId },
      include: { player: true },
    });

    const ipAddress = getClientIdentifier(request);
    const userAgent = getUserAgent(request);
    try {
      await createAuditLog({
        userId: authResult.session!.user.id!,
        ipAddress,
        userAgent,
        action: AUDIT_ACTIONS.UPDATE_TA_ENTRY,
        targetId: entryId,
        targetType: "TTEntry",
        details: {
          tournamentId,
          updatedTimes: updatedTimes,
          playerNickname: finalEntry?.player.nickname,
        },
        });
    } catch (logError) {
      // Audit log failure is non-critical but should be logged for security tracking
      logger.warn("Failed to create audit log", { error: logError, tournamentId, entryId, action: 'UPDATE_TA_ENTRY_TIMES' });
    }

    return NextResponse.json({ entry: finalEntry });
  } catch (error) {
    // Use structured logging for error tracking and debugging
    logger.error("Failed to update times", { error, tournamentId });
    return createErrorResponse("Failed to update times", 500, "INTERNAL_ERROR");
  }
}

/**
 * DELETE /api/tournaments/[id]/ta
 *
 * Delete a TA entry from the tournament. Requires admin authentication.
 * After deletion, ranks are recalculated for the affected stage.
 *
 * Query parameters:
 * - entryId: UUID of the entry to delete (required)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Logger created inside function for proper test mocking
  const logger = createLogger('ta-api');
  const { id: tournamentId } = await params;
  try {

    const authResult = await requireAdminAndGetSession();
    if (authResult.error) return authResult.error;

    // Validate tournament ID format
    /* Prisma generates CUID, not UUID — use .cuid() for ID validation */
    const cuidSchema = z.string().cuid();
    const tournamentIdResult = cuidSchema.safeParse(tournamentId);
    if (!tournamentIdResult.success) {
      return createErrorResponse("Invalid tournament ID format", 400, "VALIDATION_ERROR");
    }

    // Get entry ID from query parameters
    const { searchParams } = new URL(request.url);
    const entryId = searchParams.get("entryId");

    if (!entryId) {
      return createErrorResponse("entryId is required", 400, "VALIDATION_ERROR");
    }

    // Validate entry ID format
    const entryIdResult = cuidSchema.safeParse(entryId);
    if (!entryIdResult.success) {
      return createErrorResponse("Invalid entry ID format", 400, "VALIDATION_ERROR");
    }

    // Fetch entry to confirm existence and get player data for audit log
    const entryToDelete = await prisma.tTEntry.findUnique({
      where: { id: entryId },
      include: { player: true },
    });

    if (!entryToDelete) {
      return createErrorResponse('Entry not found', 404, 'NOT_FOUND');
    }

    // Reject deletion if the entry's stage is frozen
    const deleteFreeze = await checkStageFrozen(prisma, tournamentId, entryToDelete.stage);
    if (deleteFreeze) return deleteFreeze;

    // Delete the entry from the database
    await prisma.tTEntry.delete({
      where: { id: entryId }
    });

    // Recalculate ranks for the affected stage after deletion
    await recalculateRanks(tournamentId, entryToDelete.stage, prisma);

    // Audit log for deletion accountability
    const ipAddress = getClientIdentifier(request);
    const userAgent = getUserAgent(request);
    try {
      await createAuditLog({
        userId: authResult.session!.user.id!,
        ipAddress,
        userAgent,
        action: AUDIT_ACTIONS.DELETE_TA_ENTRY,
        targetId: entryId,
        targetType: "TTEntry",
        details: {
          tournamentId,
          playerNickname: entryToDelete.player.nickname,
          deletedBy: authResult.session!.user.id,
        },
        });
    } catch (logError) {
      // Audit log failure is non-critical but should be logged for security tracking
      logger.warn("Failed to create audit log", { error: logError, tournamentId, entryId, action: 'DELETE_TA_ENTRY' });
    }

    return NextResponse.json({
      success: true,
      message: "Entry deleted successfully",
    });
  } catch (error) {
    // Use structured logging for error tracking and debugging
    logger.error("Failed to delete entry", { error, tournamentId });
    return createErrorResponse("Failed to delete entry", 500, "INTERNAL_ERROR");
  }
}
