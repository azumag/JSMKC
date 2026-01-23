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
 * GET - Retrieve a single battle mode match
 * @param request - NextRequest object
 * @param params - Route parameters containing tournamentId and matchId
 * @returns Response with match data
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; matchId: string }> }
) {
  try {
    const { matchId } = await params;

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
 * PUT - Update battle mode match score with optimistic locking
 * Requires version parameter to prevent race conditions
 * @param request - NextRequest object containing score data and version
 * @param params - Route parameters containing tournamentId and matchId
 * @returns Response with updated match data
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; matchId: string }> }
) {
  try {
    const { matchId } = await params;
    const body = await request.json();
    
    const { score1, score2, completed, rounds, version } = body;

    if (score1 === undefined || score2 === undefined) {
      return handleValidationError("score1 and score2 are required", "scores");
    }

    if (typeof version !== 'number') {
      return handleValidationError("version is required and must be a number", "version");
    }

    const result = await updateBMMatchScore(
      prisma,
      matchId,
      version,
      score1,
      score2,
      completed,
      rounds
    );

    // 更新後のデータを返す
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
