/**
 * Battle Mode Finals Individual Match Update API Route
 *
 * Provides an admin endpoint for updating the score of a specific finals match.
 * Uses Zod validation to ensure score data integrity.
 *
 * Match completion is determined by:
 * - Explicit completed flag in the request body
 * - Either player reaching the target win count (5 rounds for finals)
 *
 * Authentication: Admin role required
 * Validation: Zod schema for strict input validation
 * Audit: All updates are logged for accountability
 */

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { createAuditLog, AUDIT_ACTIONS } from "@/lib/audit-log";
import { z } from "zod";
import { createLogger } from "@/lib/logger";

/**
 * Zod schema for validating match update requests.
 * Score range is 0-5 for BM finals (best-of-9 format, first to 5).
 *
 * Fields:
 * - score1/score2: Round wins for each player (0-5)
 * - rounds: Optional array of per-round results with arena and winner
 * - completed: Optional explicit completion flag
 */
const UpdateMatchSchema = z.object({
  score1: z.number().int().min(0).max(5),
  score2: z.number().int().min(0).max(5),
  rounds: z.array(z.object({
    arena: z.string(),
    winner: z.number().int().min(1).max(2),
  })).optional(),
  completed: z.boolean().optional(),
});

/**
 * TypeScript interface for the match update data payload.
 * Used to type the Prisma update data object.
 */
interface BMMatchUpdateData {
  score1: number;
  score2: number;
  completed: boolean;
  rounds?: Array<{ arena: string; winner: number }>;
}

/**
 * PUT /api/tournaments/[id]/bm/finals/matches/[matchId]
 *
 * Update a specific finals match score. Admin-only endpoint.
 *
 * The match is marked complete when:
 * - The client explicitly sets completed: true
 * - Either player reaches 5 round wins (target for BM finals)
 *
 * Request body: See UpdateMatchSchema above for field definitions.
 *
 * @param request - NextRequest with score update data
 * @param params - Route params containing tournamentId and matchId
 * @returns Updated match data with player details
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; matchId: string }> }
) {
  /* Logger must be created inside the function for proper test mocking */
  const logger = createLogger('bm-finals-match-api');
  const session = await auth();

  /* Admin authentication is required for match score updates */
  if (!session?.user || session.user.role !== "admin") {
    return NextResponse.json(
      { error: "Forbidden: Admin access required" },
      { status: 403 }
    );
  }

  const { id: tournamentId, matchId } = await params;

  try {
    const body = await request.json();

    /* Validate request body with Zod schema for type safety */
    const parseResult = UpdateMatchSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: parseResult.error.issues[0]?.message || "Invalid request body" },
        { status: 400 }
      );
    }

    const data = parseResult.data;

    /* Verify the match exists before attempting update */
    const match = await prisma.bMMatch.findUnique({
      where: { id: matchId },
      include: { player1: true, player2: true },
    });

    if (!match) {
      return NextResponse.json(
        { error: "Match not found" },
        { status: 404 }
      );
    }

    /*
     * Determine if match is complete based on explicit flag or target score.
     * BM finals use best-of-9 format (first to 5 wins), so reaching
     * 5 round wins automatically completes the match.
     */
    const targetWins = 5;
    const isComplete = data.completed || data.score1 >= targetWins || data.score2 >= targetWins;

    /* Build the update payload */
    const updateData: BMMatchUpdateData = {
      score1: data.score1,
      score2: data.score2,
      completed: isComplete,
    };

    /* Include per-round detail data if provided */
    if (data.rounds) {
      updateData.rounds = data.rounds;
    }

    /* Apply the update to the database */
    const updatedMatch = await prisma.bMMatch.update({
      where: { id: matchId },
      data: updateData,
      include: { player1: true, player2: true },
    });

    /* Record audit log for the score update */
    try {
      await createAuditLog({
        userId: session.user.id,
        ipAddress: request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "unknown",
        userAgent: request.headers.get("user-agent") || "unknown",
        action: AUDIT_ACTIONS.UPDATE_BM_MATCH,
        targetId: matchId,
        targetType: "BMMatch",
        details: {
          tournamentId,
          player1Nickname: updatedMatch.player1.nickname,
          player2Nickname: updatedMatch.player2.nickname,
          score1: data.score1,
          score2: data.score2,
          completed: isComplete,
        },
      });
    } catch (logError) {
      /* Audit log failure is non-critical but should be logged for security tracking */
      logger.warn('Failed to create audit log', { error: logError, tournamentId, matchId, action: 'UPDATE_BM_MATCH' });
    }

    return NextResponse.json({
      message: "Match updated successfully",
      match: updatedMatch,
    });
  } catch (error) {
    logger.error("Failed to update match", { error, tournamentId, matchId });
    return NextResponse.json(
      { error: "Failed to update match" },
      { status: 500 }
    );
  }
}
