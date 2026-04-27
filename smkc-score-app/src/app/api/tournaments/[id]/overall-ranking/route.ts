/**
 * Overall Ranking API Route
 *
 * Aggregates tournament points from all 4 competition modes (TA, BM, MR, GP)
 * to calculate and store a unified overall ranking for all players.
 *
 * Each mode contributes:
 * - Qualification: max 1000 points (based on match/time performance)
 * - Finals: max 2000 points (based on bracket finishing position)
 * - Total per mode: max 3000 points
 * - Grand total: max 12000 points (4 modes × 3000)
 *
 * - GET: Fetch current stored overall rankings
 * - POST: Recalculate rankings from current tournament data and save
 *
 * Authentication: GET is public (anyone can view); POST requires admin role
 */

import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { createLogger } from "@/lib/logger";
import {
  calculateOverallRankings,
  saveOverallRankings,
  getOverallRankings,
} from "@/lib/points/overall-ranking";
import {
  createSuccessResponse,
  createErrorResponse,
  handleAuthError,
  handleAuthzError,
} from "@/lib/error-handling";
import { resolveTournament } from "@/lib/tournament-identifier";

/**
 * GET /api/tournaments/[id]/overall-ranking
 *
 * Fetch current overall rankings from the TournamentPlayerScore table.
 * Returns empty array if rankings haven't been calculated yet
 * (use POST to trigger calculation).
 *
 * Public endpoint: no authentication required.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const logger = createLogger("overall-ranking-api");

  const { id } = await params;

  try {
    /* Single query: fold slug/id resolution + field fetch (#692) */
    const tournament = await resolveTournament(id, { id: true, name: true });

    if (!tournament) {
      return createErrorResponse("Tournament not found", 404);
    }
    const tournamentId = tournament.id;

    /* Fetch stored rankings (pre-calculated via POST) */
    const rankings = await getOverallRankings(prisma, tournamentId);

    /* Derive lastUpdated from the most recent DB record, fall back to now */
    const lastUpdated = rankings.length > 0
      ? new Date(Math.max(...rankings.map(r => new Date(r.updatedAt ?? new Date()).getTime()))).toISOString()
      : new Date().toISOString();

    logger.info("Fetched overall rankings", {
      tournamentId,
      playerCount: rankings.length,
    });

    return createSuccessResponse({
      tournamentId,
      tournamentName: tournament.name,
      lastUpdated,
      rankings,
    });
  } catch (error) {
    logger.error("Failed to fetch overall rankings", { error, tournamentId: id });
    return createErrorResponse("Failed to fetch overall rankings", 500);
  }
}

/**
 * POST /api/tournaments/[id]/overall-ranking
 *
 * Recalculate overall rankings from current tournament data across all modes.
 * This aggregates qualification and finals points from TA, BM, MR, and GP,
 * then saves the results to the TournamentPlayerScore table.
 *
 * The calculation process:
 * 1. Collect all unique player IDs across all 4 modes
 * 2. Calculate qualification points for each mode
 * 3. Calculate finals points based on bracket finishing positions
 * 4. Sum all points for each player
 * 5. Assign ranks with proper tie handling (equal points = equal rank)
 * 6. Save to database using upsert (create or update)
 *
 * Requires admin authentication (returns 401 for unauthenticated, 403 for non-admin users).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const logger = createLogger("overall-ranking-api");
  const session = await auth();

  /* Authentication check: return 401 if no session */
  if (!session?.user) {
    return handleAuthError("Authentication required");
  }

  /* Authorization check: return 403 if not admin */
  if (session.user.role !== "admin") {
    return handleAuthzError();
  }

  const { id } = await params;

  try {
    /* Single query: fold slug/id resolution + field fetch (#692) */
    const tournament = await resolveTournament(id, { id: true, name: true });

    if (!tournament) {
      return createErrorResponse("Tournament not found", 404);
    }
    const tournamentId = tournament.id;

    /* Calculate rankings from current data across all 4 modes */
    const rankings = await calculateOverallRankings(prisma, tournamentId);

    /* Persist rankings to TournamentPlayerScore table using transaction */
    await saveOverallRankings(prisma, tournamentId, rankings);

    logger.info("Recalculated overall rankings", {
      tournamentId,
      playerCount: rankings.length,
    });

    return createSuccessResponse({
      tournamentId,
      tournamentName: tournament.name,
      lastUpdated: new Date().toISOString(),
      rankings,
    });
  } catch (error) {
    logger.error("Failed to recalculate overall rankings", {
      error,
      tournamentId: id,
    });
    return createErrorResponse("Failed to recalculate overall rankings", 500);
  }
}
