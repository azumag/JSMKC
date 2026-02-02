/**
 * Match Race Finals Individual Match Update API Route
 *
 * Updates scores for a specific finals match in the MR bracket.
 * Validates scores using Zod schema and auto-detects match completion
 * based on the target win count (7 for MR finals).
 *
 * Authentication: Admin role required
 */

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { createAuditLog, AUDIT_ACTIONS } from "@/lib/audit-log";
import { z } from "zod";
import { sanitizeInput } from "@/lib/sanitize";
import { createLogger } from "@/lib/logger";

/**
 * Validation schema for updating a finals match.
 * Score range 0-7 allows for full match tracking.
 * Rounds track individual course results for MR format.
 */
const UpdateMatchSchema = z.object({
  score1: z.number().int().min(0).max(7),
  score2: z.number().int().min(0).max(7),
  /** Individual race results with course and winner */
  rounds: z.array(z.object({
    course: z.string(),
    winner: z.number().int().min(1).max(2),
  })).optional(),
  completed: z.boolean().optional(),
});

/**
 * Type definition for match update database payload.
 * Separates the Zod-validated input from the database write shape.
 */
interface MRMatchUpdateData {
  score1: number;
  score2: number;
  completed: boolean;
  rounds?: Array<{ course: string; winner: number }>;
}

/**
 * PUT /api/tournaments/[id]/mr/finals/matches/[matchId]
 *
 * Update a specific finals match's scores and completion status.
 * Auto-completes the match when either player reaches 7 wins.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; matchId: string }> }
) {
  /* Logger must be created inside the function for proper test mocking */
  const logger = createLogger('mr-finals-match-api');
  const session = await auth();

  /* Admin authentication required */
  if (!session?.user || session.user.role !== "admin") {
    return NextResponse.json(
      { error: "Unauthorized: Admin access required" },
      { status: 401 }
    );
  }

  const { id: tournamentId, matchId } = await params;
  try {
    const body = sanitizeInput(await request.json());

    /* Validate against schema */
    const parseResult = UpdateMatchSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: parseResult.error.issues[0]?.message || "Invalid request body" },
        { status: 400 }
      );
    }

    const data = parseResult.data;

    /* Verify match exists */
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

    /* Auto-complete when either player reaches the target win count (7) */
    const targetWins = 7;
    const isComplete = data.completed || data.score1 >= targetWins || data.score2 >= targetWins;

    const updateData: MRMatchUpdateData = {
      score1: data.score1,
      score2: data.score2,
      completed: isComplete,
    };

    if (data.rounds) {
      updateData.rounds = data.rounds;
    }

    const updatedMatch = await prisma.mRMatch.update({
      where: { id: matchId },
      data: updateData,
      include: { player1: true, player2: true },
    });

    /* Audit log for match update */
    try {
      await createAuditLog({
        userId: session.user.id,
        ipAddress: request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "unknown",
        userAgent: request.headers.get("user-agent") || "unknown",
        action: AUDIT_ACTIONS.UPDATE_MR_MATCH,
        targetId: matchId,
        targetType: "MRMatch",
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
      logger.warn('Failed to create audit log', { error: logError, tournamentId, matchId, action: 'UPDATE_MR_MATCH' });
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
