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
import prisma from "@/lib/prisma";
import { getClientIdentifier, getUserAgent } from "@/lib/rate-limit";
import { sanitizeInput } from "@/lib/sanitize";
import { auth } from "@/lib/auth";
import { z } from "zod";
import { createLogger } from "@/lib/logger";
import {
  promoteToPhase1,
  promoteToPhase2,
  promoteToPhase3,
  getPhaseStatus,
  startPhaseRound,
  submitRoundResults,
  cancelPhaseRound,
  type PhaseContext,
  type RoundResultInput,
} from "@/lib/ta/finals-phase-manager";
import { getAvailableCourses, getPlayedCourses } from "@/lib/ta/course-selection";
import { RETRY_PENALTY_MS } from "@/lib/constants";

/**
 * Admin authentication helper that returns the session.
 * Returns { error } if user is not authenticated or not admin.
 * Returns { session } if authentication succeeds.
 */
async function requireAdminAndGetSession(): Promise<{
  error?: NextResponse;
  session?: { user: { id: string; role: string } };
}> {
  const session = await auth();
  if (!session?.user || session.user.role !== "admin") {
    return {
      error: NextResponse.json(
        { success: false, error: "Forbidden" },
        { status: 403 }
      ),
    };
  }
  return { session: session as { user: { id: string; role: string } } };
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

  // Start a new round: selects a random course and creates a TTPhaseRound record
  z.object({
    action: z.literal("start_round"),
    phase: PhaseSchema,
  }),

  // Cancel an unsubmitted round: deletes the TTPhaseRound record to free the course
  z.object({
    action: z.literal("cancel_round"),
    phase: PhaseSchema,
    roundNumber: z.number().int().positive(),
  }),

  // Submit results for a round: triggers elimination processing
  z.object({
    action: z.literal("submit_results"),
    phase: PhaseSchema,
    roundNumber: z.number().int().positive(),
    results: z.array(
      z.object({
        playerId: z.string().cuid(),
        timeMs: z.number().min(0).max(RETRY_PENALTY_MS),
        isRetry: z.boolean().optional(),
      })
    ).min(1),
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
  const { id: tournamentId } = await params;

  try {
    // Validate tournament exists
    const tournament = await prisma.tournament.findUnique({
      where: { id: tournamentId },
    });
    if (!tournament) {
      return NextResponse.json(
        { success: false, error: "Tournament not found" },
        { status: 404 }
      );
    }

    // Parse optional phase filter from query params
    const { searchParams } = new URL(request.url);
    const phaseParam = searchParams.get("phase");
    const phase = phaseParam ? PhaseSchema.safeParse(phaseParam) : null;

    // Return 400 if a phase parameter was provided but is not a valid phase name.
    // Without this check, invalid values are silently ignored, which confuses API consumers.
    // Note: phaseParam is not reflected in the error message to avoid user input reflection.
    if (phaseParam && !phase?.success) {
      return NextResponse.json(
        { success: false, error: "Invalid phase parameter. Must be one of: phase1, phase2, phase3" },
        { status: 400 }
      );
    }

    // Fetch phase status summary (counts for all three phases)
    const phaseStatus = await getPhaseStatus(prisma, tournamentId);

    // Build response with optional phase-specific data
    const response: Record<string, unknown> = {
      success: true,
      phaseStatus,
    };

    if (phase?.success) {
      const phaseValue = phase.data;

      // Fetch entries for the specified phase, ordered by rank.
      // Player.password is globally omitted via PrismaClient config in lib/prisma.ts.
      const entries = await prisma.tTEntry.findMany({
        where: { tournamentId, stage: phaseValue },
        include: { player: true },
        orderBy: [
          { eliminated: "asc" }, // Active players first
          { lives: "desc" },     // Most lives first (relevant for phase3)
          { totalTime: "asc" },  // Fastest time first
        ],
      });

      // Fetch round history for the specified phase
      const rounds = await prisma.tTPhaseRound.findMany({
        where: { tournamentId, phase: phaseValue },
        orderBy: { roundNumber: "asc" },
      });

      // Calculate available courses for the next round
      const playedCourses = await getPlayedCourses(
        prisma,
        tournamentId,
        phaseValue
      );
      const availableCourses = getAvailableCourses(playedCourses);

      response.entries = entries;
      response.rounds = rounds;
      response.availableCourses = availableCourses;
      response.playedCourses = playedCourses;
    }

    return NextResponse.json(response);
  } catch (err) {
    logger.error("Failed to fetch phase data", {
      error: err instanceof Error ? err.message : err,
      stack: err instanceof Error ? err.stack : undefined,
      tournamentId,
    });
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
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
  const { id: tournamentId } = await params;

  // Require admin authentication
  const { error: authError, session } = await requireAdminAndGetSession();
  if (authError) return authError;

  try {
    // Parse and validate request body
    const body = await request.json();
    const sanitizedBody = sanitizeInput(body);
    const parsed = PostRequestSchema.safeParse(sanitizedBody);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Invalid request", details: parsed.error.issues },
        { status: 400 }
      );
    }

    // Validate tournament exists
    const tournament = await prisma.tournament.findUnique({
      where: { id: tournamentId },
    });
    if (!tournament) {
      return NextResponse.json(
        { success: false, error: "Tournament not found" },
        { status: 404 }
      );
    }

    // Build context for audit logging and phase operations
    const context: PhaseContext = {
      tournamentId,
      userId: session!.user.id,
      ipAddress: getClientIdentifier(request),
      userAgent: getUserAgent(request),
    };

    const action = parsed.data.action;

    // === Promotion Actions ===
    if (action === "promote_phase1") {
      const result = await promoteToPhase1(prisma, context);
      return NextResponse.json({
        success: true,
        ...result,
      });
    }

    if (action === "promote_phase2") {
      const result = await promoteToPhase2(prisma, context);
      return NextResponse.json({
        success: true,
        ...result,
      });
    }

    if (action === "promote_phase3") {
      const result = await promoteToPhase3(prisma, context);
      return NextResponse.json({
        success: true,
        ...result,
      });
    }

    // === Round Management Actions ===
    if (action === "start_round") {
      const { phase } = parsed.data;
      const result = await startPhaseRound(prisma, context, phase);
      return NextResponse.json({
        success: true,
        ...result,
      });
    }

    if (action === "cancel_round") {
      const { phase, roundNumber } = parsed.data;
      const result = await cancelPhaseRound(prisma, context, phase, roundNumber);
      return NextResponse.json({
        success: true,
        ...result,
      });
    }

    if (action === "submit_results") {
      const { phase, roundNumber, results } = parsed.data;
      const roundResults: RoundResultInput[] = results;
      const result = await submitRoundResults(
        prisma,
        context,
        phase,
        roundNumber,
        roundResults
      );
      return NextResponse.json({
        success: true,
        ...result,
      });
    }

    // Should not reach here due to discriminated union validation
    return NextResponse.json(
      { success: false, error: "Unknown action" },
      { status: 400 }
    );
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
        internalMessage.includes("already promoted") ||
        internalMessage.includes("Promote players first"));

    return NextResponse.json(
      {
        success: false,
        error: isBusinessError ? internalMessage : "Internal server error",
      },
      { status: isBusinessError ? 400 : 500 }
    );
  }
}
