/**
 * Match Race Finals Bracket Generation API Route
 *
 * Manages the bracket view and generation for MR double-elimination finals.
 * Provides GET (fetch bracket state) and POST (generate bracket from qualifiers).
 *
 * Uses the tournament-specific double elimination generator which creates
 * actual match nodes with player assignments based on qualification rankings.
 *
 * Authentication: Admin role required for POST (bracket generation)
 */

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { generateDoubleEliminationBracket, BracketPlayer } from "@/lib/tournament/double-elimination";
import { createAuditLog, AUDIT_ACTIONS } from "@/lib/audit-log";
import { createLogger } from "@/lib/logger";

/**
 * GET /api/tournaments/[id]/mr/finals/bracket
 *
 * Fetch the current bracket state including all finals matches and
 * qualified players with their rankings.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  /* Logger must be created inside the function for proper test mocking */
  const logger = createLogger('mr-bracket-api');
  const { id: tournamentId } = await params;
  try {
    /* Fetch all finals matches ordered by match number for bracket display */
    const matches = await prisma.mRMatch.findMany({
      where: { tournamentId, stage: "finals" },
      include: { player1: true, player2: true },
      orderBy: { matchNumber: "asc" },
    });

    /* Fetch qualification standings for player seedings */
    const qualifications = await prisma.mRQualification.findMany({
      where: { tournamentId },
      include: { player: true },
      orderBy: [{ score: "desc" }, { points: "desc" }],
    });

    /* Map to BracketPlayer interface for the bracket generator */
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
    logger.error("Failed to fetch bracket", { error, tournamentId });
    return NextResponse.json(
      { error: "Failed to fetch bracket" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/tournaments/[id]/mr/finals/bracket
 *
 * Generate a new double-elimination bracket from qualification results.
 * Requires admin authentication. Creates bracket structure with
 * winners bracket, losers bracket, and grand final positions.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const logger = createLogger('mr-bracket-api');
  const session = await auth();

  /* Admin authentication required for bracket generation */
  if (!session?.user || session.user.role !== "admin") {
    return NextResponse.json(
      { error: "Unauthorized: Admin access required" },
      { status: 401 }
    );
  }

  const { id: tournamentId } = await params;
  try {
    /* Fetch qualification standings for seeding */
    const qualifications = await prisma.mRQualification.findMany({
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

    /* Map to BracketPlayer format with qualifying rank */
    const players: BracketPlayer[] = qualifications.map((q, index) => ({
      playerId: q.playerId,
      playerName: q.player.name,
      playerNickname: q.player.nickname,
      qualifyingRank: index + 1,
      losses: 0,
      points: q.points,
    }));

    /* Generate the complete double-elimination bracket structure */
    const bracket = generateDoubleEliminationBracket(players, "MR");

    const bracketData = {
      winnerBracket: bracket.winnerBracket,
      loserBracket: bracket.loserBracket,
      grandFinal: bracket.grandFinal,
      totalPlayers: players.length,
    };

    /* Record audit log for bracket generation (security and accountability) */
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
      /* Audit log failure is non-critical but should be logged for security tracking */
      logger.warn('Failed to create audit log', { error: logError, tournamentId, action: 'CREATE_BRACKET' });
    }

    return NextResponse.json(bracketData);
  } catch (error) {
    logger.error("Failed to generate bracket", { error, tournamentId });
    return NextResponse.json(
      { error: "Failed to generate bracket" },
      { status: 500 }
    );
  }
}
