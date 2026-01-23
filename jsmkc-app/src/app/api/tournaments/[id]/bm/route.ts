import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { createAuditLog, AUDIT_ACTIONS } from "@/lib/audit-log";
import { getServerSideIdentifier } from "@/lib/rate-limit";
import { sanitizeInput } from "@/lib/sanitize";
import { createLogger } from "@/lib/logger";

// Initialize logger for structured logging
const logger = createLogger('bm-api');

// Helper function to calculate match result
function calculateMatchResult(score1: number, score2: number) {
  const totalRounds = score1 + score2;
  if (totalRounds !== 4) {
    return { winner: null, result1: "tie" as const, result2: "tie" as const };
  }

  if (score1 >= 3) {
    return { winner: 1, result1: "win" as const, result2: "loss" as const };
  } else if (score2 >= 3) {
    return { winner: 2, result1: "loss" as const, result2: "win" as const };
  } else {
    return { winner: null, result1: "tie" as const, result2: "tie" as const };
  }
}

// GET battle mode qualification data
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: tournamentId } = await params;
  try {

    const qualifications = await prisma.bMQualification.findMany({
      where: { tournamentId },
      include: { player: true },
      orderBy: [{ group: "asc" }, { score: "desc" }, { points: "desc" }],
    });

    const matches = await prisma.bMMatch.findMany({
      where: { tournamentId, stage: "qualification" },
      include: { player1: true, player2: true },
      orderBy: { matchNumber: "asc" },
    });

    return NextResponse.json({ qualifications, matches });
  } catch (error) {
    // Use structured logging for error tracking and debugging
    logger.error("Failed to fetch BM data", { error, tournamentId });
    return NextResponse.json(
      { error: "Failed to fetch battle mode data" },
      { status: 500 }
    );
  }
}

// POST setup battle mode qualification (assign players to groups) - requires authentication
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  
  if (!session?.user) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 401 }
    );
  }
  
  const { id: tournamentId } = await params;
  try {
    const body = sanitizeInput(await request.json());
    const { players } = body; // Array of { playerId, group, seeding }

    if (!players || !Array.isArray(players) || players.length === 0) {
      return NextResponse.json(
        { error: "Players array is required" },
        { status: 400 }
      );
    }

    // Delete existing qualifications for this tournament
    await prisma.bMQualification.deleteMany({
      where: { tournamentId },
    });

    // Delete existing qualification matches
    await prisma.bMMatch.deleteMany({
      where: { tournamentId, stage: "qualification" },
    });

    // Create qualifications
    const qualifications = await Promise.all(
      players.map((p: { playerId: string; group: string; seeding?: number }) =>
        prisma.bMQualification.create({
          data: {
            tournamentId,
            playerId: p.playerId,
            group: p.group,
            seeding: p.seeding,
          },
        })
      )
    );

    // Generate round-robin matches for each group
    const groups = [...new Set(players.map((p: { group: string }) => p.group))];
    let matchNumber = 1;

    for (const group of groups) {
      const groupPlayers = players.filter(
        (p: { group: string }) => p.group === group
      );

      // Generate all pairs for round-robin
      for (let i = 0; i < groupPlayers.length; i++) {
        for (let j = i + 1; j < groupPlayers.length; j++) {
          await prisma.bMMatch.create({
            data: {
              tournamentId,
              matchNumber,
              stage: "qualification",
              player1Id: groupPlayers[i].playerId,
              player2Id: groupPlayers[j].playerId,
            },
          });
          matchNumber++;
        }
      }
    }

    // Create audit log
    try {
      const ip = await getServerSideIdentifier();
      const userAgent = request.headers.get('user-agent') || 'unknown';
      await createAuditLog({
        userId: session.user.id,
        ipAddress: ip,
        userAgent,
        action: AUDIT_ACTIONS.CREATE_BM_MATCH,
        targetId: tournamentId,
        targetType: 'Tournament',
        details: {
          mode: 'qualification',
          playerCount: players.length,
        },
      });
    } catch (logError) {
      // Audit log failure is non-critical but should be logged for security tracking
      logger.warn('Failed to create audit log', { error: logError, tournamentId, action: 'CREATE_BM_MATCH' });
    }

    return NextResponse.json(
      { message: "Battle mode setup complete", qualifications },
      { status: 201 }
    );
  } catch (error) {
    // Use structured logging for error tracking and debugging
    logger.error("Failed to setup BM", { error, tournamentId });
    return NextResponse.json(
      { error: "Failed to setup battle mode" },
      { status: 500 }
    );
  }
}

// PUT update match score
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: tournamentId } = await params;
  try {
    const body = await request.json();
    const { matchId, score1, score2, rounds } = body;

    if (!matchId || score1 === undefined || score2 === undefined) {
      return NextResponse.json(
        { error: "matchId, score1, and score2 are required" },
        { status: 400 }
      );
    }

    // Update the match
    const match = await prisma.bMMatch.update({
      where: { id: matchId },
      data: {
        score1,
        score2,
        rounds: rounds || null,
        completed: true,
      },
      include: { player1: true, player2: true },
    });

    // Recalculate qualifications for both players
    const { result1, result2 } = calculateMatchResult(score1, score2);

    // Get all completed matches for each player
    const player1Matches = await prisma.bMMatch.findMany({
      where: {
        tournamentId,
        stage: "qualification",
        completed: true,
        OR: [{ player1Id: match.player1Id }, { player2Id: match.player1Id }],
      },
    });

    const player2Matches = await prisma.bMMatch.findMany({
      where: {
        tournamentId,
        stage: "qualification",
        completed: true,
        OR: [{ player1Id: match.player2Id }, { player2Id: match.player2Id }],
      },
    });

    // Calculate stats for player 1
    const p1Stats = { mp: 0, wins: 0, ties: 0, losses: 0, winRounds: 0, lossRounds: 0 };
    for (const m of player1Matches) {
      p1Stats.mp++;
      const isPlayer1 = m.player1Id === match.player1Id;
      const myScore = isPlayer1 ? m.score1 : m.score2;
      const oppScore = isPlayer1 ? m.score2 : m.score1;
      p1Stats.winRounds += myScore;
      p1Stats.lossRounds += oppScore;
      const { result1: r1 } = calculateMatchResult(
        isPlayer1 ? m.score1 : m.score2,
        isPlayer1 ? m.score2 : m.score1
      );
      if (r1 === "win") p1Stats.wins++;
      else if (r1 === "loss") p1Stats.losses++;
      else p1Stats.ties++;
    }

    // Calculate stats for player 2
    const p2Stats = { mp: 0, wins: 0, ties: 0, losses: 0, winRounds: 0, lossRounds: 0 };
    for (const m of player2Matches) {
      p2Stats.mp++;
      const isPlayer1 = m.player1Id === match.player2Id;
      const myScore = isPlayer1 ? m.score1 : m.score2;
      const oppScore = isPlayer1 ? m.score2 : m.score1;
      p2Stats.winRounds += myScore;
      p2Stats.lossRounds += oppScore;
      const { result1: r1 } = calculateMatchResult(
        isPlayer1 ? m.score1 : m.score2,
        isPlayer1 ? m.score2 : m.score1
      );
      if (r1 === "win") p2Stats.wins++;
      else if (r1 === "loss") p2Stats.losses++;
      else p2Stats.ties++;
    }

    // Calculate score based on wins/ties/losses (2 points for win, 1 for tie, 0 for loss)
    const p1Score = p1Stats.wins * 2 + p1Stats.ties;
    const p2Score = p2Stats.wins * 2 + p2Stats.ties;

    // Update qualifications
    await prisma.bMQualification.updateMany({
      where: { tournamentId, playerId: match.player1Id },
      data: {
        ...p1Stats,
        points: p1Stats.winRounds - p1Stats.lossRounds,
        score: p1Score,
      },
    });

    await prisma.bMQualification.updateMany({
      where: { tournamentId, playerId: match.player2Id },
      data: {
        ...p2Stats,
        points: p2Stats.winRounds - p2Stats.lossRounds,
        score: p2Score,
      },
    });

    return NextResponse.json({ match, result1, result2 });
  } catch (error) {
    // Use structured logging for error tracking and debugging
    logger.error("Failed to update match", { error, tournamentId });
    return NextResponse.json(
      { error: "Failed to update match" },
      { status: 500 }
    );
  }
}
