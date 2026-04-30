/**
 * TA Finals Phase API Route
 *
 * Manages the three-phase elimination finals for Time Attack:
 * - Phase 1: Qualification ranks 17-24, 8→4 players, single elimination per course
 * - Phase 2: Phase 1 survivors + ranks 13-16, 8→4 players, single elimination
 * - Phase 3: Phase 2 survivors + ranks 1-12, 16→1 player, life-based elimination
 *
 * Endpoints:
 * - GET:  Fetch phase status, entries, rounds, and available courses
 * - POST: Promote players to phases, start rounds, or submit round results
 *
 * All POST operations require admin authentication and are audit-logged.
 *
 * CRITICAL: Logger is created INSIDE each handler function (not at module level)
 * to ensure proper test mocking per the project's mock architecture pattern.
 */

import { NextRequest, NextResponse } from "next/server";
import { PLAYER_PUBLIC_SELECT } from '@/lib/prisma-selects';
import prisma from "@/lib/prisma";
import { getClientIdentifier, getUserAgent } from "@/lib/request-utils";
import { sanitizeInput } from "@/lib/sanitize";
import { auth } from "@/lib/auth";
import { z } from "zod";
import { createLogger } from "@/lib/logger";
import { retryDbRead } from "@/lib/db-read-retry";
import {
  createSuccessResponse,
  createErrorResponse,
  handleAuthzError,
  handleValidationError,
} from "@/lib/error-handling";
import {
  promoteToPhase1,
  promoteToPhase2,
  promoteToPhase3,
  getPhaseStatus,
  startPhaseRound,
  submitRoundResults,
  submitSuddenDeathResults,
  changeSuddenDeathCourse,
  cancelPhaseRound,
  undoLastPhaseRound,
  type PhaseContext,
  type RoundResultInput,
} from "@/lib/ta/finals-phase-manager";
import { getAvailableCourses, getPlayedCoursesWithSuddenDeath } from "@/lib/ta/course-selection";
import { checkStageFrozen } from "@/lib/ta/freeze-check";
import { RETRY_PENALTY_MS } from "@/lib/constants";
import { resolveTournamentId } from "@/lib/tournament-identifier";
import { resolveAuditUserId } from "@/lib/audit-log";
import type { Session } from "next-auth";

function normalizePhaseRound<T extends { results: unknown; eliminatedIds?: unknown }>(round: T) {
  return {
    ...round,
    results: Array.isArray(round.results) ? round.results : [],
    eliminatedIds: Array.isArray(round.eliminatedIds) ? round.eliminatedIds : [],
  };
}

/**
 * Admin authentication helper that returns the session.
 * Returns { error } if user is not authenticated or not admin.
 * Returns { session } if authentication succeeds.
 */
async function requireAdminAndGetSession(): Promise<{
  error?: NextResponse;
  session?: Session;
}> {
  const session = await auth();
  if (!session?.user || session.user.role !== "admin") {
    return {
      error: handleAuthzError(),
    };
  }
  return { session };
}

/** Valid phase names for URL query parameters and request bodies */
const PhaseSchema = z.enum(["phase1", "phase2", "phase3"]);

/**
 * POST request body schema.
 * Uses discriminated union on "action" field to validate action-specific fields.
 */
const PostRequestSchema = z.discriminatedUnion("action", [
  // Promote players to a phase (triggers the corresponding promoteToPhaseN function)
  z.object({ action: z.literal("promote_phase1") }),
  z.object({ action: z.literal("promote_phase2") }),
  z.object({ action: z.literal("promote_phase3") }),

  // Start a new round: selects a random course and creates a TTPhaseRound record.
  // Optional `course` allows admin to manually specify a course abbreviation (e.g. "MC1")
  // instead of using random selection. Must be a valid abbreviation in the current cycle.
  // Optional `tvNumber` (1-4) assigns a broadcast TV screen to the round.
  z.object({
    action: z.literal("start_round"),
    phase: PhaseSchema,
    course: z.string().optional(),
    tvNumber: z.number().int().min(1).max(4).nullable().optional(),
  }),

  // Cancel an unsubmitted round: deletes the TTPhaseRound record to free the course
  z.object({
    action: z.literal("cancel_round"),
    phase: PhaseSchema,
    roundNumber: z.number().int().positive(),
  }),

  // Undo the last submitted round: clears results and restores player state
  z.object({
    action: z.literal("undo_round"),
    phase: PhaseSchema,
  }),

  // Submit results for a round: triggers elimination processing.
  // Optional `tvNumber` per result records which TV screen the player used (for history display).
  z.object({
    action: z.literal("submit_results"),
    phase: PhaseSchema,
    roundNumber: z.number().int().positive(),
    results: z.array(
      z.object({
        playerId: z.string().cuid(),
        timeMs: z.number().min(0).max(RETRY_PENALTY_MS),
        isRetry: z.boolean().optional(),
        tvNumber: z.number().int().min(1).max(4).nullable().optional(),
      })
    ).min(1),
  }),

  z.object({
    action: z.literal("submit_sudden_death"),
    phase: PhaseSchema,
    suddenDeathRoundId: z.string().cuid(),
    results: z.array(
      z.object({
        playerId: z.string().cuid(),
        timeMs: z.number().min(0).max(RETRY_PENALTY_MS),
        isRetry: z.boolean().optional(),
      })
    ).min(2),
  }),

  z.object({
    action: z.literal("change_sudden_death_course"),
    phase: PhaseSchema,
    suddenDeathRoundId: z.string().cuid(),
    course: z.string(),
  }),
]);

/**
 * GET /api/tournaments/[id]/ta/phases
 *
 * Fetches the current state of all finals phases.
 * Optionally accepts a `phase` query parameter to filter entries and rounds.
 *
 * Response:
 * - phaseStatus: Status summary for all three phases
 * - entries: TTEntry records for the requested phase (with player info)
 * - rounds: TTPhaseRound records for the requested phase
 * - availableCourses: Courses not yet played in the current 20-course cycle
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const logger = createLogger("ta-phases-api");
  const { id } = await params;
  let tournamentId = id;

  try {
    tournamentId = await retryDbRead(
      () => resolveTournamentId(id),
      {
        onRetry: ({ attempt, error }) => logger.warn("Retrying TA phase tournament resolve", {
          attempt,
          id,
          error: error instanceof Error ? error.message : error,
        }),
      },
    );

    // Parse optional phase filter from query params early (no async needed)
    const { searchParams } = new URL(request.url);
    const phaseParam = searchParams.get("phase");
    const phase = phaseParam ? PhaseSchema.safeParse(phaseParam) : null;

    if (phaseParam && !phase?.success) {
      return handleValidationError("Invalid phase parameter. Must be one of: phase1, phase2, phase3");
    }

    const tournament = await retryDbRead(
      () => prisma.tournament.findUnique({ where: { id: tournamentId } }),
      {
        onRetry: ({ attempt, error }) => logger.warn("Retrying TA tournament read", {
          attempt,
          tournamentId,
          error: error instanceof Error ? error.message : error,
        }),
      },
    );

    if (!tournament) {
      return createErrorResponse("Tournament not found", 404);
    }

    const phaseStatus = await retryDbRead(
      () => getPhaseStatus(prisma, tournamentId),
      {
        onRetry: ({ attempt, error }) => logger.warn("Retrying TA phase status read", {
          attempt,
          tournamentId,
          error: error instanceof Error ? error.message : error,
        }),
      },
    );

    const response: Record<string, unknown> = { phaseStatus };

    if (phase?.success) {
      const phaseValue = phase.data;

      const entries = await retryDbRead(
        () => prisma.tTEntry.findMany({
          where: { tournamentId, stage: phaseValue },
          include: { player: { select: PLAYER_PUBLIC_SELECT } },
          orderBy: [
            { eliminated: "asc" },
            { lives: "desc" },
            { totalTime: "asc" },
          ],
        }),
        {
          onRetry: ({ attempt, error }) => logger.warn("Retrying TA phase entry read", {
            attempt,
            tournamentId,
            phase: phaseValue,
            error: error instanceof Error ? error.message : error,
          }),
        },
      );
      const rounds = await retryDbRead(
        () => prisma.tTPhaseRound.findMany({
          where: { tournamentId, phase: phaseValue },
          include: {
            suddenDeathRounds: {
              orderBy: { sequence: "asc" },
            },
          },
          orderBy: { roundNumber: "asc" },
        }),
        {
          onRetry: ({ attempt, error }) => logger.warn("Retrying TA phase round read", {
            attempt,
            tournamentId,
            phase: phaseValue,
            error: error instanceof Error ? error.message : error,
          }),
        },
      );
      const playedCourses = await retryDbRead(
        () => getPlayedCoursesWithSuddenDeath(prisma, tournamentId, phaseValue),
        {
          onRetry: ({ attempt, error }) => logger.warn("Retrying TA phase course read", {
            attempt,
            tournamentId,
            phase: phaseValue,
            error: error instanceof Error ? error.message : error,
          }),
        },
      );

      response.entries = entries;
      response.rounds = rounds.map(normalizePhaseRound);
      response.availableCourses = getAvailableCourses(playedCourses);
      response.playedCourses = playedCourses;
    }

    return createSuccessResponse(response);
  } catch (err) {
    logger.error("Failed to fetch phase data", {
      error: err instanceof Error ? err.message : err,
      stack: err instanceof Error ? err.stack : undefined,
      tournamentId,
    });
    return createErrorResponse("Internal server error", 500);
  }
}

/**
 * POST /api/tournaments/[id]/ta/phases
 *
 * Action-based mutation endpoint for finals phase management.
 * All actions require admin authentication.
 *
 * Actions:
 * - promote_phase1: Promote qualification ranks 17-24 to Phase 1
 * - promote_phase2: Promote Phase 1 survivors + ranks 13-16 to Phase 2
 * - promote_phase3: Promote Phase 2 survivors + ranks 1-12 to Phase 3
 * - start_round: Select random course and create a new round
 * - submit_results: Submit player times and trigger elimination
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const logger = createLogger("ta-phases-api");
  const { id } = await params;
  const tournamentId = await resolveTournamentId(id);

  // Require admin authentication
  const { error: authError, session } = await requireAdminAndGetSession();
  if (authError) return authError;

  try {
    // Parse and validate request body
    const body = await request.json();
    const sanitizedBody = sanitizeInput(body);
    const parsed = PostRequestSchema.safeParse(sanitizedBody);

    if (!parsed.success) {
      return handleValidationError("Invalid request");
    }

    // Validate tournament exists
    const tournament = await prisma.tournament.findUnique({
      where: { id: tournamentId },
    });
    if (!tournament) {
      return createErrorResponse("Tournament not found", 404);
    }

    // Build context for audit logging and phase operations
    const context: PhaseContext = {
      tournamentId,
      userId: resolveAuditUserId(session),
      ipAddress: getClientIdentifier(request),
      userAgent: getUserAgent(request),
    };

    const action = parsed.data.action;

    // === Promotion Actions ===
    if (action === "promote_phase1") {
      const result = await promoteToPhase1(prisma, context);
      return createSuccessResponse(result);
    }

    if (action === "promote_phase2") {
      const result = await promoteToPhase2(prisma, context);
      return createSuccessResponse(result);
    }

    if (action === "promote_phase3") {
      const result = await promoteToPhase3(prisma, context);
      return createSuccessResponse(result);
    }

    // === Round Management Actions ===
    if (action === "start_round") {
      const { phase, course, tvNumber } = parsed.data;
      // Prevent starting rounds in a frozen phase (admin locked after completion)
      const freezeError = await checkStageFrozen(prisma, tournamentId, phase);
      if (freezeError) return freezeError;
      // Pass optional manual course; undefined = random selection (default behaviour)
      const result = await startPhaseRound(prisma, context, phase, course, tvNumber ?? null);
      return createSuccessResponse(result);
    }

    if (action === "cancel_round") {
      const { phase, roundNumber } = parsed.data;
      // Prevent cancelling rounds in a frozen phase
      const freezeError = await checkStageFrozen(prisma, tournamentId, phase);
      if (freezeError) return freezeError;
      const result = await cancelPhaseRound(prisma, context, phase, roundNumber);
      return createSuccessResponse(result);
    }

    if (action === "undo_round") {
      const { phase } = parsed.data;
      // Prevent undoing rounds in a frozen phase
      const freezeError = await checkStageFrozen(prisma, tournamentId, phase);
      if (freezeError) return freezeError;
      const result = await undoLastPhaseRound(prisma, context, phase);
      return createSuccessResponse(result);
    }

    if (action === "submit_results") {
      const { phase, roundNumber, results } = parsed.data;
      // Prevent submitting results in a frozen phase
      const freezeError = await checkStageFrozen(prisma, tournamentId, phase);
      if (freezeError) return freezeError;

      const roundResults: RoundResultInput[] = results;
      const result = await submitRoundResults(
        prisma,
        context,
        phase,
        roundNumber,
        roundResults
      );
      return createSuccessResponse(result);
    }

    if (action === "submit_sudden_death") {
      const { phase, suddenDeathRoundId, results } = parsed.data;
      const freezeError = await checkStageFrozen(prisma, tournamentId, phase);
      if (freezeError) return freezeError;
      const result = await submitSuddenDeathResults(
        prisma,
        context,
        phase,
        suddenDeathRoundId,
        results
      );
      return createSuccessResponse(result);
    }

    if (action === "change_sudden_death_course") {
      const { phase, suddenDeathRoundId, course } = parsed.data;
      const freezeError = await checkStageFrozen(prisma, tournamentId, phase);
      if (freezeError) return freezeError;
      const result = await changeSuddenDeathCourse(
        prisma,
        context,
        phase,
        suddenDeathRoundId,
        course
      );
      return createSuccessResponse(result);
    }

    // Should not reach here due to discriminated union validation
    return handleValidationError("Unknown action");
  } catch (err) {
    const internalMessage = err instanceof Error ? err.message : "Unknown error";
    logger.error("Phase operation failed", {
      error: internalMessage,
      tournamentId,
    });

    // Expose known business logic errors (thrown by our code with descriptive messages)
    // but hide unexpected/system errors to prevent information leakage.
    // Business logic errors (e.g., "Round 3 not found", "No active players")
    // start with recognizable patterns; Prisma/system errors do not.
    const isBusinessError =
      err instanceof Error &&
      (internalMessage.startsWith("Round ") ||
        internalMessage.startsWith("No active") ||
        internalMessage.startsWith("Invalid player") ||
        internalMessage.startsWith("Missing results") ||
        internalMessage.startsWith("Duplicate player") ||
        internalMessage.includes("already been submitted") ||
        internalMessage.includes("cannot be cancelled") ||
        internalMessage.includes("No submitted rounds") ||
        internalMessage.includes("already promoted") ||
        internalMessage.includes("Promote players first") ||
        internalMessage.startsWith("Tie detected") ||
        internalMessage.includes("sudden-death") ||
        internalMessage.includes("Sudden-death") ||
        internalMessage.startsWith("Unresolved sudden-death") ||
        internalMessage.startsWith("Missing sudden-death") ||
        // Manual course override validation errors (start_round with course param)
        internalMessage.startsWith("Invalid course abbreviation") ||
        internalMessage.startsWith('Course "') ||
        internalMessage.startsWith("Course "));

    return createErrorResponse(
      isBusinessError ? internalMessage : "Internal server error",
      isBusinessError ? 400 : 500
    );
  }
}
