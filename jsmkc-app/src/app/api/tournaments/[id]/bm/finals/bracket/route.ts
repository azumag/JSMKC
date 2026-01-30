/**
 * Battle Mode Finals Bracket Generation API Route
 *
 * Manages the bracket view and generation for BM double-elimination finals.
 * This route provides:
 * - GET: Fetch current bracket state (matches + qualified players)
 * - POST: Generate a new double-elimination bracket from qualification results
 *
 * The bracket is generated using the double-elimination library which creates
 * seeded matchups based on qualification ranking. Higher-seeded players are
 * placed to avoid meeting early in the bracket.
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
 * GET /api/tournaments/[id]/bm/finals/bracket
 *
 * Fetch the current bracket state including all finals matches and
 * qualified players with their rankings.
 *
 * Returns:
 * - matches: All finals-stage matches with player details
 * - players: Qualified players mapped to BracketPlayer format
 * - totalPlayers: Count of qualified players
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  /* Logger must be created inside the function for proper test mocking */
  const logger = createLogger('bm-bracket-api');
  const { id: tournamentId } = await params;

  try {
    /* Fetch all finals matches ordered by match number for bracket display */
    const matches = await prisma.bMMatch.findMany({
      where: { tournamentId, stage: "finals" },
      include: { player1: true, player2: true },
      orderBy: { matchNumber: "asc" },
    });

    /*
     * Fetch qualification standings to determine player seedings.
     * Sorted by score (match points) descending, then point differential.
     */
    const qualifications = await prisma.bMQualification.findMany({
      where: { tournamentId },
      include: { player: true },
      orderBy: [{ score: "desc" }, { points: "desc" }],
    });

    /* Map qualification data to the BracketPlayer interface for the bracket generator */
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
 * POST /api/tournaments/[id]/bm/finals/bracket
 *
 * Generate a new double-elimination bracket from qualification results.
 * Requires admin authentication. Creates the bracket structure including
 * winners bracket, losers bracket, and grand final positions.
 *
 * The seeding follows standard tournament seeding conventions where
 * the #1 seed faces the lowest seed, #2 faces the second-lowest, etc.
 *
 * An audit log entry is created for tracking bracket generation events.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const logger = createLogger('bm-bracket-api');
  const session = await auth();

  /* Admin authentication is required for bracket generation */
  if (!session?.user || session.user.role !== "admin") {
    return NextResponse.json(
      { error: "Unauthorized: Admin access required" },
      { status: 401 }
    );
  }

  const { id: tournamentId } = await params;

  try {
    /* Fetch qualification standings for seeding */
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

    /* Map to BracketPlayer format with qualifying rank based on standing position */
    const players: BracketPlayer[] = qualifications.map((q, index) => ({
      playerId: q.playerId,
      playerName: q.player.name,
      playerNickname: q.player.nickname,
      qualifyingRank: index + 1,
      losses: 0,
      points: q.points,
    }));

    /* Generate the complete double-elimination bracket structure */
    const bracket = generateDoubleEliminationBracket(players, "BM");

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
