/**
 * Battle Mode Single Match API Route
 *
 * Provides endpoints for fetching and updating individual BM match data.
 * Supports optimistic locking on updates to prevent concurrent modification issues
 * when multiple users (admin or players) attempt to update the same match.
 *
 * Endpoints:
 * - GET: Retrieve a single match with player details
 * - PUT: Update match score with optimistic locking (requires version)
 *
 * The optimistic locking mechanism uses a version field:
 * - Client sends current version with update request
 * - Server checks version matches before applying update
 * - Returns 409 Conflict if version mismatch (another user modified the match)
 */

import { NextRequest } from "next/server";

import {
  createErrorResponse,
  createSuccessResponse,
  handleValidationError,
  handleDatabaseError
} from "@/lib/error-handling";
import { updateBMMatchScore, OptimisticLockError } from "@/lib/optimistic-locking";

import prisma from "@/lib/prisma";

/**
 * GET /api/tournaments/[id]/bm/match/[matchId]
 *
 * Retrieve a single battle mode match by its ID.
 * Includes both player records for display purposes.
 *
 * @param request - NextRequest object
 * @param params - Route parameters containing tournamentId and matchId
 * @returns JSON response with match data including player details
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; matchId: string }> }
) {
  try {
    const { matchId } = await params;

    /* Fetch match with player details for the match display page */
    const match = await prisma.bMMatch.findUnique({
      where: { id: matchId },
      include: {
        player1: true,
        player2: true,
      },
    });

    if (!match) {
      return handleValidationError("Match not found", "matchId");
    }

    return createSuccessResponse(match);
  } catch (error) {
    return handleDatabaseError(error, "fetch match");
  }
}

/**
 * PUT /api/tournaments/[id]/bm/match/[matchId]
 *
 * Update battle mode match score with optimistic locking to prevent race conditions.
 * The client must include the current version number in the request body.
 * If the version doesn't match the database, a 409 Conflict is returned,
 * indicating another user has modified the match since it was loaded.
 *
 * Request body:
 * {
 *   score1: number;      - Rounds won by player 1
 *   score2: number;      - Rounds won by player 2
 *   completed?: boolean; - Whether the match is finished
 *   rounds?: object;     - Optional per-round detail data
 *   version: number;     - Current version for optimistic lock check
 * }
 *
 * @param request - NextRequest object containing score data and version
 * @param params - Route parameters containing tournamentId and matchId
 * @returns JSON response with updated match data and new version number
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; matchId: string }> }
) {
  try {
    const { matchId } = await params;
    const body = await request.json();

    const { score1, score2, completed, rounds, version } = body;

    /* Both scores are required for any match update */
    if (score1 === undefined || score2 === undefined) {
      return handleValidationError("score1 and score2 are required", "scores");
    }

    /* Version is mandatory to enable optimistic locking */
    if (typeof version !== 'number') {
      return handleValidationError("version is required and must be a number", "version");
    }

    /*
     * Use the optimistic locking utility to safely update the match.
     * This will throw OptimisticLockError if another user has modified
     * the match since the client loaded it.
     */
    const result = await updateBMMatchScore(
      prisma,
      matchId,
      version,
      score1,
      score2,
      completed,
      rounds
    );

    /* Fetch the fully updated match with player data for the response */
    const updatedMatch = await prisma.bMMatch.findUnique({
      where: { id: matchId },
      include: {
        player1: true,
        player2: true,
      },
    });

    return createSuccessResponse({
      match: updatedMatch,
      version: result.version
    });
  } catch (error) {
    /*
     * Handle optimistic lock conflicts with a specific 409 status.
     * The client should refresh the match data and retry the update.
     */
    if (error instanceof OptimisticLockError) {
      return createErrorResponse(
        "The match was modified by another user. Please refresh and try again.",
        409,
        "VERSION_CONFLICT",
        { currentVersion: error.currentVersion }
      );
    }

    return handleDatabaseError(error, "update match");
  }
}
