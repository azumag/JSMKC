import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { generateDoubleEliminationBracket, BracketPlayer } from "@/lib/tournament/double-elimination";
import { createAuditLog, AUDIT_ACTIONS } from "@/lib/audit-log";
import { createLogger } from "@/lib/logger";

// Initialize logger for structured logging
const logger = createLogger('bm-bracket-api');

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: tournamentId } = await params;
  try {

    const matches = await prisma.bMMatch.findMany({
      where: { tournamentId, stage: "finals" },
      include: { player1: true, player2: true },
      orderBy: { matchNumber: "asc" },
    });

    const qualifications = await prisma.bMQualification.findMany({
      where: { tournamentId },
      include: { player: true },
      orderBy: [{ score: "desc" }, { points: "desc" }],
    });

    const players: BracketPlayer[] = qualifications.map((q, index) => ({
      playerId: q.playerId,
      playerName: q.player.name,
      playerNickname: q.player.nickname,
      qualifyingRank: index + 1,
      losses: 0,
      points: q.points,
    }));

    return NextResponse.json({
      matches,
      players,
      totalPlayers: players.length,
    });
  } catch (error) {
    // Use structured logging for error tracking and debugging
    logger.error("Failed to fetch bracket", { error, tournamentId });
    return NextResponse.json(
      { error: "Failed to fetch bracket" },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();

  if (!session?.user || session.user.role !== "admin") {
    return NextResponse.json(
      { error: "Unauthorized: Admin access required" },
      { status: 401 }
    );
  }

  const { id: tournamentId } = await params;
  try {
    const qualifications = await prisma.bMQualification.findMany({
      where: { tournamentId },
      include: { player: true },
      orderBy: [{ score: "desc" }, { points: "desc" }],
    });

    if (qualifications.length === 0) {
      return NextResponse.json(
        { error: "No qualification results found" },
        { status: 400 }
      );
    }

    const players: BracketPlayer[] = qualifications.map((q, index) => ({
      playerId: q.playerId,
      playerName: q.player.name,
      playerNickname: q.player.nickname,
      qualifyingRank: index + 1,
      losses: 0,
      points: q.points,
    }));

    const bracket = generateDoubleEliminationBracket(players, "BM");

    const bracketData = {
      winnerBracket: bracket.winnerBracket,
      loserBracket: bracket.loserBracket,
      grandFinal: bracket.grandFinal,
      totalPlayers: players.length,
    };

    const auditLogData = {
      tournamentId,
      bracketSize: players.length,
      winnerCount: bracket.winnerBracket.length,
      loserCount: bracket.loserBracket.length,
    };

    try {
      await createAuditLog({
        userId: session.user.id,
        ipAddress: request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "unknown",
        userAgent: request.headers.get("user-agent") || "unknown",
        action: AUDIT_ACTIONS.CREATE_BRACKET,
        targetId: tournamentId,
        targetType: "Tournament",
        details: auditLogData,
      });
    } catch (logError) {
      // Audit log failure is non-critical but should be logged for security tracking
      logger.warn('Failed to create audit log', { error: logError, tournamentId, action: 'CREATE_BRACKET' });
    }

    return NextResponse.json(bracketData);
  } catch (error) {
    // Use structured logging for error tracking and debugging
    logger.error("Failed to generate bracket", { error, tournamentId });
    return NextResponse.json(
      { error: "Failed to generate bracket" },
      { status: 500 }
    );
  }
}
