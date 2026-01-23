import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { createAuditLog, AUDIT_ACTIONS } from "@/lib/audit-log";
import { z } from "zod";
import { sanitizeInput } from "@/lib/sanitize";
import { createLogger } from "@/lib/logger";

// Initialize logger for structured logging
const logger = createLogger('mr-finals-match-api');

const UpdateMatchSchema = z.object({
  score1: z.number().int().min(0).max(7),
  score2: z.number().int().min(0).max(7),
  rounds: z.array(z.object({
    course: z.string(),
    winner: z.number().int().min(1).max(2),
  })).optional(),
  completed: z.boolean().optional(),
});

interface MRMatchUpdateData {
  score1: number;
  score2: number;
  completed: boolean;
  rounds?: Array<{ course: string; winner: number }>;
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; matchId: string }> }
) {
  const session = await auth();

  if (!session?.user || session.user.role !== "admin") {
    return NextResponse.json(
      { error: "Unauthorized: Admin access required" },
      { status: 401 }
    );
  }

  const { id: tournamentId, matchId } = await params;
  try {
    const body = sanitizeInput(await request.json());

    const parseResult = UpdateMatchSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: parseResult.error.issues[0]?.message || "Invalid request body" },
        { status: 400 }
      );
    }

    const data = parseResult.data;

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
      // Audit log failure is non-critical but should be logged for security tracking
      logger.warn('Failed to create audit log', { error: logError, tournamentId, matchId, action: 'UPDATE_MR_MATCH' });
    }

    return NextResponse.json({
      message: "Match updated successfully",
      match: updatedMatch,
    });
  } catch (error) {
    // Use structured logging for error tracking and debugging
    logger.error("Failed to update match", { error, tournamentId, matchId });
    return NextResponse.json(
      { error: "Failed to update match" },
      { status: 500 }
    );
  }
}
