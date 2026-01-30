/**
 * Match Race Individual Match API Route
 *
 * Manages individual MR match data with optimistic locking support.
 * Uses version-based conflict detection to prevent concurrent update issues
 * when multiple users (admin + participants) update the same match.
 *
 * GET: Fetch single match details
 * PUT: Update match score with version check (409 on conflict)
 */

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { updateMRMatchScore, OptimisticLockError } from "@/lib/optimistic-locking";
import { sanitizeInput } from "@/lib/sanitize";
import { createLogger } from "@/lib/logger";

/**
 * GET /api/tournaments/[id]/mr/match/[matchId]
 *
 * Fetch a single MR match with both players' details.
 * Used by the match detail/share page for real-time polling.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; matchId: string }> }
) {
  /* Logger must be created inside the function for proper test mocking */
  const logger = createLogger('mr-match-api');
  const { matchId } = await params;
  try {
    const match = await prisma.mRMatch.findUnique({
      where: { id: matchId },
      include: { player1: true, player2: true },
    });

    if (!match) {
      return NextResponse.json(
        { error: "Match not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(match);
  } catch (error) {
    logger.error("Failed to fetch match", { error, matchId });
    return NextResponse.json(
      { error: "Failed to fetch match" },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/tournaments/[id]/mr/match/[matchId]
 *
 * Update match score with optimistic locking.
 * The version field must match the current database version.
 * If another user updated the match between fetch and submit,
 * a 409 Conflict response is returned with the current version.
 *
 * This prevents race conditions in concurrent score entry.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; matchId: string }> }
) {
  const logger = createLogger('mr-match-api');
  const { matchId } = await params;
  try {
    const body = sanitizeInput(await request.json());

    const { score1, score2, completed, rounds, version } = body;

    /* Both scores are required for any update */
    if (score1 === undefined || score2 === undefined) {
      return NextResponse.json(
        { success: false, error: "score1 and score2 are required" },
        { status: 400 }
      );
    }

    /* Version is required for optimistic locking */
    if (typeof version !== 'number') {
      return NextResponse.json(
        { success: false, error: "version is required and must be a number" },
        { status: 400 }
      );
    }

    /* Perform version-checked update via optimistic locking utility */
    const result = await updateMRMatchScore(
      prisma,
      matchId,
      version,
      score1,
      score2,
      completed,
      rounds
    );

    /* Fetch the updated match with player details for the response */
    const updatedMatch = await prisma.mRMatch.findUnique({
      where: { id: matchId },
      include: { player1: true, player2: true },
    });

    return NextResponse.json({
      success: true,
      data: updatedMatch,
      version: result.version
    });
  } catch (error) {
    logger.error("Failed to update match", { error, matchId });

    /* Return 409 Conflict if optimistic lock detected a version mismatch */
    if (error instanceof OptimisticLockError) {
      return NextResponse.json(
        {
          success: false,
          error: "Version conflict",
          message: "The match was modified by another user. Please refresh and try again.",
          currentVersion: error.currentVersion
        },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { success: false, error: "Failed to update match" },
      { status: 500 }
    );
  }
}
