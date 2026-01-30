/**
 * Grand Prix Individual Match API Route
 *
 * Provides read and update operations for a single GP match.
 * PUT uses optimistic locking to prevent concurrent update conflicts.
 * GP matches use points1/points2 (driver points) instead of score1/score2.
 *
 * - GET: Fetch match details with player information
 * - PUT: Update match with optimistic locking via version field
 */

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { updateGPMatchScore, OptimisticLockError } from "@/lib/optimistic-locking";
import { createLogger } from "@/lib/logger";

/**
 * GET /api/tournaments/[id]/gp/match/[matchId]
 *
 * Fetch a single GP match with player details.
 * Used by the match detail/share page for display.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; matchId: string }> }
) {
  const logger = createLogger('gp-match-api');
  const { matchId } = await params;
  try {
    /* Fetch match with player relations for display */
    const match = await prisma.gPMatch.findUnique({
      where: { id: matchId },
      include: { player1: true, player2: true },
    });

    if (!match) {
      return NextResponse.json({ success: false, error: "Match not found" }, { status: 404 });
    }

    return NextResponse.json(match);
  } catch (error) {
    logger.error("Failed to fetch GP match", { error, matchId });
    return NextResponse.json(
      { success: false, error: "Failed to fetch grand prix match" },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/tournaments/[id]/gp/match/[matchId]
 *
 * Update a GP match score with optimistic locking.
 * Requires version number to detect concurrent modifications.
 * Returns 409 Conflict if the version doesn't match.
 *
 * Request body: { points1, points2, completed?, races?, version }
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; matchId: string }> }
) {
  const logger = createLogger('gp-match-api');
  const { matchId } = await params;
  try {
    const body = await request.json();

    const { points1, points2, completed, races, version } = body;

    /* GP uses points1/points2 (driver points) rather than score1/score2 */
    if (points1 === undefined || points2 === undefined) {
      return NextResponse.json(
        { success: false, error: "points1 and points2 are required" },
        { status: 400 }
      );
    }

    /* Version is required for optimistic locking conflict detection */
    if (typeof version !== 'number') {
      return NextResponse.json(
        { success: false, error: "version is required and must be a number" },
        { status: 400 }
      );
    }

    /* Use optimistic locking to safely update the match score */
    const result = await updateGPMatchScore(
      prisma,
      matchId,
      version,
      points1,
      points2,
      completed,
      races
    );

    /* Re-fetch with player relations for complete response */
    const updatedMatch = await prisma.gPMatch.findUnique({
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

    /* Return 409 Conflict when optimistic locking detects a version mismatch */
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
