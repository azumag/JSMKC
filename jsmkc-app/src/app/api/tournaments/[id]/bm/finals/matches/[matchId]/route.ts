import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { createAuditLog, AUDIT_ACTIONS } from "@/lib/audit-log";
import { z } from "zod";

const UpdateMatchSchema = z.object({
  score1: z.number().int().min(0).max(5),
  score2: z.number().int().min(0).max(5),
  rounds: z.array(z.object({
    arena: z.string(),
    winner: z.number().int().min(1).max(2),
  })).optional(),
  completed: z.boolean().optional(),
});

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

  try {
    const { id: tournamentId, matchId } = await params;
    const body = await request.json();

    const parseResult = UpdateMatchSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: parseResult.error.issues[0]?.message || "Invalid request body" },
        { status: 400 }
      );
    }

    const data = parseResult.data;

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

    const targetWins = 5;
    const isComplete = data.completed || data.score1 >= targetWins || data.score2 >= targetWins;

    const updatedMatch = await prisma.bMMatch.update({
      where: { id: matchId },
      data: {
        score1: data.score1,
        score2: data.score2,
        rounds: data.rounds || match.rounds,
        completed: isComplete,
      },
      include: { player1: true, player2: true },
    });

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
      console.error("Failed to create audit log:", logError);
    }

    return NextResponse.json({
      message: "Match updated successfully",
      match: updatedMatch,
    });
  } catch (error) {
    console.error("Failed to update match:", error);
    return NextResponse.json(
      { error: "Failed to update match" },
      { status: 500 }
    );
  }
}
