/**
 * TT (Time Trial) Single Entry API Route
 *
 * Handles read and update operations for individual Time Trial entries.
 * This endpoint supports optimistic locking via a version field to prevent
 * concurrent update conflicts when multiple users edit the same entry.
 *
 * Endpoints:
 * - GET: Fetch a single TT entry by ID with player and tournament data
 * - PUT: Update entry fields (times, totalTime, rank, eliminated, lives)
 *        with optimistic locking (version check)
 *
 * The optimistic locking pattern works as follows:
 * 1. Client reads entry with current version number
 * 2. Client submits update with the version number it read
 * 3. Server checks if the version matches; if not, returns 409 Conflict
 * 4. On match, server increments version and applies the update
 *
 * CRITICAL: Logger is created INSIDE each handler function (not at module level)
 * to ensure proper test mocking per the project's mock architecture pattern.
 */

import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { updateTTEntry, OptimisticLockError } from "@/lib/optimistic-locking";
import { createLogger } from "@/lib/logger";
import { checkStageFrozen } from "@/lib/ta/freeze-check";
import { timeToMs } from "@/lib/ta/time-utils";
import { sanitizeInput } from "@/lib/sanitize";
import { resolveTournamentId } from "@/lib/tournament-identifier";
import {
  createErrorResponse,
  createSuccessResponse,
  handleValidationError,
  handleAuthzError,
  handleDatabaseError,
} from "@/lib/error-handling";

function isTimeRecord(value: unknown): value is Record<string, string> {
  return typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.values(value).every((entry) => typeof entry === "string");
}

/**
 * GET /api/tournaments/[id]/tt/entries/[entryId]
 *
 * Fetch a single Time Trial entry by its ID.
 * Includes related player and tournament data for complete context.
 *
 * Returns 404 if the entry does not exist.
 */
// GET single Time Trial entry
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; entryId: string }> }
) {
  // Logger created inside function for proper test mocking
  const logger = createLogger('tt-entry-api');
  const { id, entryId } = await params;
  const tournamentId = await resolveTournamentId(id);
  try {

    // Fetch entry with related player and tournament data
    // Verify entry belongs to the specified tournament (IDOR prevention)
    const entry = await prisma.tTEntry.findUnique({
      where: { id: entryId, tournamentId },
      include: {
        player: true,
        tournament: true,
      },
    });

    if (!entry) {
      return createErrorResponse("Entry not found", 404);
    }

    return createSuccessResponse(entry);
  } catch (error) {
    // Use structured logging for error tracking and debugging
    logger.error("Failed to fetch entry", { error, entryId, tournamentId });
    return handleDatabaseError(error, "fetch time trial entry");
  }
}

/**
 * PUT /api/tournaments/[id]/tt/entries/[entryId]
 *
 * Update a Time Trial entry with optimistic locking.
 * The client must provide the current version number to prevent
 * concurrent modification conflicts.
 *
 * Request body:
 * - version: (required) Current version number of the entry
 * - times: Updated course times object
 * - totalTime: Updated total time in milliseconds
 * - rank: Updated rank number
 * - eliminated: Updated elimination status
 * - lives: Updated lives count
 *
 * Returns:
 * - 200: Success with updated entry data and new version number
 * - 400: Missing or invalid version number
 * - 409: Version conflict (entry was modified by another user)
 * - 500: Internal server error
 */
// PUT update Time Trial entry with optimistic locking
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; entryId: string }> }
) {
  // Logger created inside function for proper test mocking
  const logger = createLogger('tt-entry-api');

  // Authorization: admin has full access, players can update only their own entry.
  // This supports the self-service time entry workflow where players log in and
  // submit their own times, while admins retain the ability to edit any entry.
  const session = await auth();
  if (!session?.user) {
    return handleAuthzError();
  }

  const isAdmin = session.user.role === "admin";
  const isPlayer = session.user.userType === "player";

  if (!isAdmin && !isPlayer) {
    return handleAuthzError();
  }

  const { entryId } = await params;

  // For player users, verify they own the entry being updated.
  // Must fetch the entry first to compare playerId.
  // Admin users bypass this check entirely (no extra DB query).
  if (!isAdmin) {
    const entryForAuth = await prisma.tTEntry.findUnique({
      where: { id: entryId },
      select: { playerId: true, stage: true, tournamentId: true },
    });
    if (!entryForAuth || entryForAuth.playerId !== session.user.playerId) {
      return handleAuthzError();
    }
    // Reject updates if the entry's stage is frozen (applies to both players and admins)
    const freezeError = await checkStageFrozen(prisma, entryForAuth.tournamentId, entryForAuth.stage);
    if (freezeError) return freezeError;
  } else {
    // Admin path: fetch entry's stage to check freeze status
    const entryForFreeze = await prisma.tTEntry.findUnique({
      where: { id: entryId },
      select: { stage: true, tournamentId: true },
    });
    if (!entryForFreeze) {
      return createErrorResponse("Entry not found", 404);
    }
    // Admins are also blocked from editing frozen stages (intentional lock)
    const freezeError = await checkStageFrozen(prisma, entryForFreeze.tournamentId, entryForFreeze.stage);
    if (freezeError) return freezeError;
  }
  try {
    /* Defense-in-depth: sanitize all user input before processing */
    const body = sanitizeInput(await request.json());

    const { times, totalTime, rank, eliminated, lives, version } = body;

    // Version field is mandatory for optimistic locking
    if (typeof version !== 'number') {
      return handleValidationError("version is required and must be a number", "version");
    }

    // Validate time strings before update so malformed values such as "0:84:00"
    // are rejected instead of being persisted through this legacy endpoint.
    if (times !== undefined && isTimeRecord(times)) {
      for (const [course, time] of Object.entries(times)) {
        if (time !== "" && timeToMs(time) === null) {
          return handleValidationError(`Invalid time format for ${course}: ${time}`, "times");
        }
      }
    }

    // Attempt update with optimistic lock check
    // This will throw OptimisticLockError if the version has changed
    const result = await updateTTEntry(
      prisma,
      entryId,
      version,
      {
        times,
        totalTime,
        rank,
        eliminated,
        lives
      }
    );

    // Fetch the fully updated entry with relations for the response
    const updatedEntry = await prisma.tTEntry.findUnique({
      where: { id: entryId },
      include: {
        player: true,
        tournament: true,
      },
    });

    /* Guard against null if entry was deleted between update and re-fetch (#273) */
    if (!updatedEntry) {
      return createErrorResponse('Entry not found after update', 404, 'NOT_FOUND');
    }

    return createSuccessResponse({
      ...updatedEntry,
      version: result.version,
    });
  } catch (error) {
    // Use structured logging for error tracking and debugging
    logger.error("Failed to update entry", { error, entryId });

    // Handle optimistic lock conflicts with a specific 409 response
    // This tells the client to refresh their data and retry
    if (error instanceof OptimisticLockError) {
      return createErrorResponse(
        "The entry was modified by another user. Please refresh and try again.",
        409,
        "OPTIMISTIC_LOCK_ERROR",
        { currentVersion: error.currentVersion, requiresRefresh: true }
      );
    }

    return handleDatabaseError(error, "update time trial entry");
  }
}
