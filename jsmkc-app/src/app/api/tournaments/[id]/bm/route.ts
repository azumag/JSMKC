/**
 * Battle Mode (BM) Qualification API Route
 *
 * Manages the Battle Mode qualification phase for a tournament.
 * BM qualification uses a round-robin format where players are divided into groups
 * and each player in a group plays against every other player in the same group.
 *
 * Endpoints:
 * - GET:  Fetch all qualification data (qualifications + matches)
 * - POST: Setup groups and generate round-robin matches (admin only)
 * - PUT:  Update a match score and recalculate player standings
 *
 * Scoring Rules:
 * - Each match consists of 4 rounds total (e.g., 3-1 or 2-2)
 * - A player needs 3+ rounds to win the match
 * - Match points: Win = 2pts, Tie = 1pt, Loss = 0pts
 * - "points" field tracks round differential (winRounds - lossRounds)
 */

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { createAuditLog, AUDIT_ACTIONS } from "@/lib/audit-log";
import { getServerSideIdentifier } from "@/lib/rate-limit";
import { sanitizeInput } from "@/lib/sanitize";
import { createLogger } from "@/lib/logger";

/**
 * Calculate the match result from individual round scores.
 * In BM qualification, matches are played as best-of-4 rounds.
 * A player must win 3 or more rounds to win the match outright.
 * If total rounds played is not 4, the result is treated as a tie.
 *
 * @param score1 - Rounds won by player 1
 * @param score2 - Rounds won by player 2
 * @returns Object with winner indicator and result labels for each player
 */
function calculateMatchResult(score1: number, score2: number) {
  const totalRounds = score1 + score2;

  /* Only a completed 4-round set can produce a definitive win/loss */
  if (totalRounds !== 4) {
    return { winner: null, result1: "tie" as const, result2: "tie" as const };
  }

  if (score1 >= 3) {
    return { winner: 1, result1: "win" as const, result2: "loss" as const };
  } else if (score2 >= 3) {
    return { winner: 2, result1: "loss" as const, result2: "win" as const };
  } else {
    /* 2-2 split is technically a tie */
    return { winner: null, result1: "tie" as const, result2: "tie" as const };
  }
}

/**
 * GET /api/tournaments/[id]/bm
 *
 * Fetch all Battle Mode qualification data for a tournament.
 * Returns qualifications (player standings per group) and qualification-stage matches.
 * Results are ordered by group ascending, then score descending, then point differential.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  /* Logger must be created inside the function for proper test mocking */
  const logger = createLogger('bm-api');
  const { id: tournamentId } = await params;

  try {
    /* Fetch qualifications with player details, ordered for standings display */
    const qualifications = await prisma.bMQualification.findMany({
      where: { tournamentId },
      include: { player: true },
      orderBy: [{ group: "asc" }, { score: "desc" }, { points: "desc" }],
    });

    /* Fetch qualification-stage matches with player details, ordered by match number */
    const matches = await prisma.bMMatch.findMany({
      where: { tournamentId, stage: "qualification" },
      include: { player1: true, player2: true },
      orderBy: { matchNumber: "asc" },
    });

    return NextResponse.json({ qualifications, matches });
  } catch (error) {
    /* Structured logging captures error details for server-side debugging */
    logger.error("Failed to fetch BM data", { error, tournamentId });
    return NextResponse.json(
      { error: "Failed to fetch battle mode data" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/tournaments/[id]/bm
 *
 * Setup Battle Mode qualification by assigning players to groups and
 * generating all round-robin match pairings within each group.
 *
 * Requires authentication (admin only).
 *
 * Request body:
 * {
 *   players: Array<{ playerId: string; group: string; seeding?: number }>
 * }
 *
 * This endpoint:
 * 1. Deletes any existing qualifications and qualification matches
 * 2. Creates new qualification entries for each player in their assigned group
 * 3. Generates all round-robin match pairings (every player vs every other in same group)
 * 4. Creates an audit log entry for the action
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const logger = createLogger('bm-api');
  const session = await auth();

  /* Admin authentication is required for tournament setup operations */
  if (!session?.user) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 401 }
    );
  }

  const { id: tournamentId } = await params;

  try {
    /* Sanitize all input to prevent XSS and injection attacks */
    const body = sanitizeInput(await request.json());
    const { players } = body; // Array of { playerId, group, seeding }

    /* Validate that we have a non-empty players array */
    if (!players || !Array.isArray(players) || players.length === 0) {
      return NextResponse.json(
        { error: "Players array is required" },
        { status: 400 }
      );
    }

    /* Clear existing data to allow fresh setup (idempotent operation) */
    await prisma.bMQualification.deleteMany({
      where: { tournamentId },
    });

    await prisma.bMMatch.deleteMany({
      where: { tournamentId, stage: "qualification" },
    });

    /* Create qualification records for each player with their group assignment */
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

    /*
     * Generate round-robin matches for each group.
     * For N players in a group, this creates N*(N-1)/2 matches.
     * Each pair of players in the same group plays exactly once.
     */
    const groups = [...new Set(players.map((p: { group: string }) => p.group))];
    let matchNumber = 1;

    for (const group of groups) {
      const groupPlayers = players.filter(
        (p: { group: string }) => p.group === group
      );

      /* Generate all unique pairs for round-robin using nested loop */
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

    /* Record audit trail for security and accountability */
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
      /* Audit log failure is non-critical but should be logged for security tracking */
      logger.warn('Failed to create audit log', { error: logError, tournamentId, action: 'CREATE_BM_MATCH' });
    }

    return NextResponse.json(
      { message: "Battle mode setup complete", qualifications },
      { status: 201 }
    );
  } catch (error) {
    logger.error("Failed to setup BM", { error, tournamentId });
    return NextResponse.json(
      { error: "Failed to setup battle mode" },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/tournaments/[id]/bm
 *
 * Update a qualification match score and recalculate both players' standings.
 *
 * Request body:
 * {
 *   matchId: string;    - The match to update
 *   score1: number;     - Rounds won by player 1
 *   score2: number;     - Rounds won by player 2
 *   rounds?: object;    - Optional per-round detail data
 * }
 *
 * After updating the match, this endpoint:
 * 1. Fetches all completed matches for both players
 * 2. Recalculates each player's aggregate stats (wins, ties, losses, rounds)
 * 3. Updates qualification records with new standings data
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const logger = createLogger('bm-api');
  const { id: tournamentId } = await params;

  try {
    const body = await request.json();
    const { matchId, score1, score2, rounds } = body;

    /* Validate required fields */
    if (!matchId || score1 === undefined || score2 === undefined) {
      return NextResponse.json(
        { error: "matchId, score1, and score2 are required" },
        { status: 400 }
      );
    }

    /* Update the match record with the new scores */
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

    /* Determine the match result for this specific game */
    const { result1, result2 } = calculateMatchResult(score1, score2);

    /*
     * Recalculate aggregate statistics for player 1.
     * We fetch ALL completed qualification matches for this player
     * to ensure consistency (avoids incremental update bugs).
     */
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

    /* Calculate cumulative stats for player 1 across all their completed matches */
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

    /* Calculate cumulative stats for player 2 across all their completed matches */
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

    /*
     * Calculate match-level score for standings:
     * Win = 2 points, Tie = 1 point, Loss = 0 points
     * This determines group standings and qualification order.
     */
    const p1Score = p1Stats.wins * 2 + p1Stats.ties;
    const p2Score = p2Stats.wins * 2 + p2Stats.ties;

    /* Update player 1's qualification record with recalculated stats */
    await prisma.bMQualification.updateMany({
      where: { tournamentId, playerId: match.player1Id },
      data: {
        ...p1Stats,
        points: p1Stats.winRounds - p1Stats.lossRounds,
        score: p1Score,
      },
    });

    /* Update player 2's qualification record with recalculated stats */
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
    logger.error("Failed to update match", { error, tournamentId });
    return NextResponse.json(
      { error: "Failed to update match" },
      { status: 500 }
    );
  }
}
