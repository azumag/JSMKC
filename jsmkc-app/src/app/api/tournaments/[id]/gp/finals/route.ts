/**
 * Grand Prix Finals (Double Elimination) API Route
 *
 * Manages the GP finals bracket using an 8-player double elimination format.
 * Structure: Winners bracket -> Losers bracket -> Grand Final -> Reset match.
 *
 * - GET: Fetch finals matches with bracket structure
 * - POST: Generate bracket from top 8 qualification players
 * - PUT: Update finals match score with automatic bracket progression
 *
 * The bracket progression automatically advances winners and losers
 * to their next matches, including the grand final reset logic
 * when the losers bracket champion wins the first grand final.
 */

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { generateBracketStructure, roundNames } from "@/lib/double-elimination";
import { paginate } from "@/lib/pagination";
import { createLogger } from "@/lib/logger";

/**
 * GET /api/tournaments/[id]/gp/finals
 *
 * Fetch finals matches with pagination and bracket structure.
 * Returns bracket layout for client-side rendering of the bracket view.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const logger = createLogger('gp-finals-api');
  const { id: tournamentId } = await params;
  try {
    const { searchParams } = new URL(request.url);
    const page = Number(searchParams.get('page')) || 1;
    const limit = Number(searchParams.get('limit')) || 50;

    /* Use pagination for consistent response format */
    const result = await paginate(
      {
        findMany: prisma.gPMatch.findMany,
        count: prisma.gPMatch.count,
      },
      { tournamentId, stage: "finals" },
      { matchNumber: "asc" },
      { page, limit }
    );

    /* Generate bracket structure only when matches exist */
    const bracketStructure = result.data.length > 0 ? generateBracketStructure(8) : [];

    return NextResponse.json({
      ...result,
      bracketStructure,
      roundNames,
    });
  } catch (error) {
    logger.error("Failed to fetch GP finals data", { error, tournamentId });
    return NextResponse.json(
      { error: "Failed to fetch grand prix finals data" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/tournaments/[id]/gp/finals
 *
 * Generate a new double elimination bracket from top 8 qualifiers.
 * Clears existing finals matches and creates the full bracket structure
 * with seeded player assignments.
 *
 * Request body: { topN?: 8 }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const logger = createLogger('gp-finals-api');
  const { id: tournamentId } = await params;
  try {
    const body = await request.json();
    const { topN = 8 } = body;

    /* Currently only 8-player brackets are supported */
    if (topN !== 8) {
      return NextResponse.json(
        { error: "Currently only 8-player brackets are supported" },
        { status: 400 }
      );
    }

    /* Fetch top N qualifiers sorted by score then driver points */
    const qualifications = await prisma.gPQualification.findMany({
      where: { tournamentId },
      include: { player: true },
      orderBy: [{ score: "desc" }, { points: "desc" }],
      take: topN,
    });

    if (qualifications.length < topN) {
      return NextResponse.json(
        {
          error: `Not enough players qualified. Need ${topN}, found ${qualifications.length}`,
        },
        { status: 400 }
      );
    }

    /* Clear any existing finals matches for a clean bracket */
    await prisma.gPMatch.deleteMany({
      where: { tournamentId, stage: "finals" },
    });

    /* Generate the abstract bracket structure (17 matches for 8 players) */
    const bracketStructure = generateBracketStructure(topN);

    /* Create seeded player list from qualification standings */
    const seededPlayers = qualifications.map((q, index) => ({
      seed: index + 1,
      playerId: q.playerId,
      player: q.player,
    }));

    /*
     * Create match records for each position in the bracket.
     * Initial round matches have seeded players assigned.
     * Later round matches have placeholder players that get updated
     * as the bracket progresses via PUT.
     */
    const createdMatches = [];
    for (const bracketMatch of bracketStructure) {
      const player1 = bracketMatch.player1Seed
        ? seededPlayers.find((p) => p.seed === bracketMatch.player1Seed)
        : null;
      const player2 = bracketMatch.player2Seed
        ? seededPlayers.find((p) => p.seed === bracketMatch.player2Seed)
        : null;

      const match = await prisma.gPMatch.create({
        data: {
          tournamentId,
          matchNumber: bracketMatch.matchNumber,
          stage: "finals",
          round: bracketMatch.round,
          /* Use placeholder players for unseeded positions */
          player1Id: player1?.playerId || seededPlayers[0].playerId,
          player2Id: player2?.playerId || seededPlayers[1].playerId,
          completed: false,
        },
        include: { player1: true, player2: true },
      });

      createdMatches.push({
        ...match,
        hasPlayer1: !!player1,
        hasPlayer2: !!player2,
        player1Seed: bracketMatch.player1Seed,
        player2Seed: bracketMatch.player2Seed,
      });
    }

    return NextResponse.json({
      message: "Finals bracket created",
      matches: createdMatches,
      seededPlayers,
      bracketStructure,
    });
  } catch (error) {
    logger.error("Failed to create GP finals", { error, tournamentId });
    return NextResponse.json(
      { error: "Failed to create grand prix finals bracket" },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/tournaments/[id]/gp/finals
 *
 * Update a finals match score and handle bracket progression.
 * After scoring, the winner/loser are automatically advanced to their
 * next bracket positions. Handles grand final and reset match logic.
 *
 * GP finals use best-of-5 format (first to 3 wins).
 * The points1/points2 fields are repurposed for game wins in finals.
 *
 * Request body: { matchId, score1, score2 }
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const logger = createLogger('gp-finals-api');
  const { id: tournamentId } = await params;
  try {
    const body = await request.json();
    const { matchId, score1, score2 } = body;

    if (!matchId || score1 === undefined || score2 === undefined) {
      return NextResponse.json(
        { error: "matchId, score1, and score2 are required" },
        { status: 400 }
      );
    }

    const match = await prisma.gPMatch.findUnique({
      where: { id: matchId },
      include: { player1: true, player2: true },
    });

    if (!match || match.stage !== "finals") {
      return NextResponse.json(
        { error: "Finals match not found" },
        { status: 404 }
      );
    }

    /* Determine winner: best of 5 = first to 3 wins */
    const winnerId = score1 >= 3 ? match.player1Id : score2 >= 3 ? match.player2Id : null;
    const loserId = score1 >= 3 ? match.player2Id : score2 >= 3 ? match.player1Id : null;

    if (!winnerId) {
      return NextResponse.json(
        { error: "Match must have a winner (best of 5: first to 3)" },
        { status: 400 }
      );
    }

    /* Update match with score and mark as completed */
    const updatedMatch = await prisma.gPMatch.update({
      where: { id: matchId },
      data: {
        points1: score1,
        points2: score2,
        completed: true,
      },
      include: { player1: true, player2: true },
    });

    /*
     * Handle bracket progression:
     * Look up the current match in the bracket structure to determine
     * where the winner and loser should advance to.
     */
    const bracketStructure = generateBracketStructure(8);
    const currentBracketMatch = bracketStructure.find(
      (b) => b.matchNumber === match.matchNumber
    );

    if (!currentBracketMatch) {
      return NextResponse.json({ match: updatedMatch });
    }

    /* Advance winner to their next match */
    if (currentBracketMatch.winnerGoesTo) {
      const nextWinnerMatch = await prisma.gPMatch.findFirst({
        where: {
          tournamentId,
          stage: "finals",
          matchNumber: currentBracketMatch.winnerGoesTo,
        },
      });

      if (nextWinnerMatch) {
        /* Position determines player1 or player2 slot in next match */
        const position = currentBracketMatch.position || 1;
        await prisma.gPMatch.update({
          where: { id: nextWinnerMatch.id },
          data:
            position === 1 ? { player1Id: winnerId } : { player2Id: winnerId },
        });
      }
    }

    /* Send loser to their losers bracket match */
    if (currentBracketMatch.loserGoesTo && loserId) {
      const nextLoserMatch = await prisma.gPMatch.findFirst({
        where: {
          tournamentId,
          stage: "finals",
          matchNumber: currentBracketMatch.loserGoesTo,
        },
      });

      if (nextLoserMatch) {
        /*
         * Loser positioning varies by bracket round:
         * - Winners QF: alternating positions based on match number
         * - Winners SF: always player 1 position
         * - Winners Final: always player 2 position (facing LB champion)
         */
        let loserPosition: 1 | 2 = 1;
        if (currentBracketMatch.round === "winners_qf") {
          loserPosition = (((match.matchNumber - 1) % 2) + 1) as 1 | 2;
        } else if (currentBracketMatch.round === "winners_sf") {
          loserPosition = 1;
        } else if (currentBracketMatch.round === "winners_final") {
          loserPosition = 2;
        }

        await prisma.gPMatch.update({
          where: { id: nextLoserMatch.id },
          data:
            loserPosition === 1
              ? { player1Id: loserId }
              : { player2Id: loserId },
        });
      }
    }

    /*
     * Grand Final reset logic:
     * If the losers bracket champion (player2) wins the grand final,
     * a reset match is triggered since the winners champion still has
     * one "life" remaining (hasn't lost in the bracket yet).
     */
    if (currentBracketMatch.round === "grand_final" && loserId) {
      const winnerFromLosers = match.player2Id === winnerId;

      if (winnerFromLosers) {
        const resetMatch = await prisma.gPMatch.findFirst({
          where: {
            tournamentId,
            stage: "finals",
            round: "grand_final_reset",
          },
        });

        if (resetMatch) {
          await prisma.gPMatch.update({
            where: { id: resetMatch.id },
            data: {
              player1Id: winnerId,
              player2Id: loserId,
            },
          });
        }
      }
    }

    /*
     * Determine if the tournament is complete.
     * Complete when: winners champion wins grand final, OR
     * either player wins the grand final reset match.
     */
    let isComplete = false;
    let champion = null;

    if (currentBracketMatch.round === "grand_final") {
      const winnerWasFromWinners = match.player1Id === winnerId;
      if (winnerWasFromWinners) {
        isComplete = true;
        champion = winnerId;
      }
    } else if (currentBracketMatch.round === "grand_final_reset") {
      isComplete = true;
      champion = winnerId;
    }

    return NextResponse.json({
      match: updatedMatch,
      winnerId,
      loserId,
      isComplete,
      champion,
    });
  } catch (error) {
    logger.error("Failed to update GP finals match", { error, tournamentId });
    return NextResponse.json(
      { error: "Failed to update match" },
      { status: 500 }
    );
  }
}
