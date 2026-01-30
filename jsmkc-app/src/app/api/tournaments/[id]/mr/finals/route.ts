/**
 * Match Race Finals API Route
 *
 * Manages the double elimination finals phase for MR tournaments.
 * Provides bracket generation, match fetching, and score updates
 * with automatic winner/loser bracket progression.
 *
 * GET: Fetch finals bracket state
 * POST: Generate bracket from top 8 qualifiers
 * PUT: Update finals match and auto-advance players
 *
 * Bracket structure (8 players):
 * - Winners QF (4 matches) → Winners SF (2) → Winners Final (1)
 * - Losers R1 (2) → Losers R2 (2) → Losers SF (1) → Losers Final (1)
 * - Grand Final + optional Grand Final Reset
 */

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { generateBracketStructure, roundNames } from "@/lib/double-elimination";
import { sanitizeInput } from "@/lib/sanitize";
import { createLogger } from "@/lib/logger";

/**
 * GET /api/tournaments/[id]/mr/finals
 *
 * Fetch the current finals bracket including all matches,
 * the bracket structure, and round display names.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  /* Logger must be created inside the function for proper test mocking */
  const logger = createLogger('mr-finals-api');
  const { id: tournamentId } = await params;
  try {
    /* Fetch all finals-stage matches with player details */
    const matches = await prisma.mRMatch.findMany({
      where: { tournamentId, stage: "finals" },
      include: { player1: true, player2: true },
      orderBy: { matchNumber: "asc" },
    });

    /* Generate bracket structure only if matches exist */
    const bracketStructure = matches.length > 0 ? generateBracketStructure(8) : [];

    return NextResponse.json({
      matches,
      bracketStructure,
      roundNames,
    });
  } catch (error) {
    logger.error("Failed to fetch finals data", { error, tournamentId });
    return NextResponse.json(
      { error: "Failed to fetch finals data" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/tournaments/[id]/mr/finals
 *
 * Generate the double elimination bracket from qualification results.
 * Takes the top 8 players by qualification score and creates all
 * 17 bracket matches with proper seeding assignments.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const logger = createLogger('mr-finals-api');
  const { id: tournamentId } = await params;
  try {
    const body = sanitizeInput(await request.json());
    const { topN = 8 } = body;

    /* Currently only 8-player brackets are supported */
    if (topN !== 8) {
      return NextResponse.json(
        { error: "Currently only 8-player brackets are supported" },
        { status: 400 }
      );
    }

    /* Fetch top N qualifiers by score, then point differential, then round wins */
    const qualifications = await prisma.mRQualification.findMany({
      where: { tournamentId },
      include: { player: true },
      orderBy: [{ score: "desc" }, { points: "desc" }, { winRounds: "desc" }],
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

    /* Clear any existing finals matches for a fresh bracket */
    await prisma.mRMatch.deleteMany({
      where: { tournamentId, stage: "finals" },
    });

    /* Generate the abstract bracket structure (17 matches for 8 players) */
    const bracketStructure = generateBracketStructure(topN);

    /* Map qualification positions to seed numbers */
    const seededPlayers = qualifications.map((q, index) => ({
      seed: index + 1,
      playerId: q.playerId,
      player: q.player,
    }));

    /* Create actual match records from the bracket structure with player assignments */
    const createdMatches = [];
    for (const bracketMatch of bracketStructure) {
      const player1 = bracketMatch.player1Seed
        ? seededPlayers.find((p) => p.seed === bracketMatch.player1Seed)
        : null;
      const player2 = bracketMatch.player2Seed
        ? seededPlayers.find((p) => p.seed === bracketMatch.player2Seed)
        : null;

      const match = await prisma.mRMatch.create({
        data: {
          tournamentId,
          matchNumber: bracketMatch.matchNumber,
          stage: "finals",
          round: bracketMatch.round,
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
    logger.error("Failed to create finals", { error, tournamentId });
    return NextResponse.json(
      { error: "Failed to create finals bracket" },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/tournaments/[id]/mr/finals
 *
 * Update a finals match score and auto-advance players through the bracket.
 * Winner advances to the next winners/losers bracket position.
 * Loser moves to the losers bracket (or is eliminated if already there).
 *
 * Special handling for grand final: if the losers bracket champion wins,
 * a grand final reset match is populated.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const logger = createLogger('mr-finals-api');
  const { id: tournamentId } = await params;
  try {
    const body = sanitizeInput(await request.json());
    const { matchId, score1, score2, rounds } = body;

    if (!matchId || score1 === undefined || score2 === undefined) {
      return NextResponse.json(
        { error: "matchId, score1, and score2 are required" },
        { status: 400 }
      );
    }

    const match = await prisma.mRMatch.findUnique({
      where: { id: matchId },
      include: { player1: true, player2: true },
    });

    if (!match || match.stage !== "finals") {
      return NextResponse.json(
        { error: "Finals match not found" },
        { status: 404 }
      );
    }

    /* Determine winner and loser: first to 3 race wins (best of 5) */
    const winnerId = score1 >= 3 ? match.player1Id : score2 >= 3 ? match.player2Id : null;
    const loserId = score1 >= 3 ? match.player2Id : score2 >= 3 ? match.player1Id : null;

    if (!winnerId) {
      return NextResponse.json(
        { error: "Match must have a winner (best of 5: first to 3)" },
        { status: 400 }
      );
    }

    /* Update the match record with final scores */
    const updatedMatch = await prisma.mRMatch.update({
      where: { id: matchId },
      data: {
        score1,
        score2,
        rounds: rounds || null,
        completed: true,
      },
      include: { player1: true, player2: true },
    });

    /*
     * Auto-advance: Move winner and loser to their next bracket positions.
     * The bracket structure defines where each player goes after their match.
     */
    const bracketStructure = generateBracketStructure(8);
    const currentBracketMatch = bracketStructure.find(
      (b) => b.matchNumber === match.matchNumber
    );

    if (!currentBracketMatch) {
      return NextResponse.json({ match: updatedMatch });
    }

    /* Advance winner to the next winners bracket match */
    if (currentBracketMatch.winnerGoesTo) {
      const nextWinnerMatch = await prisma.mRMatch.findFirst({
        where: {
          tournamentId,
          stage: "finals",
          matchNumber: currentBracketMatch.winnerGoesTo,
        },
      });

      if (nextWinnerMatch) {
        const position = currentBracketMatch.position || 1;
        await prisma.mRMatch.update({
          where: { id: nextWinnerMatch.id },
          data:
            position === 1 ? { player1Id: winnerId } : { player2Id: winnerId },
        });
      }
    }

    /* Send loser to the losers bracket */
    if (currentBracketMatch.loserGoesTo && loserId) {
      const nextLoserMatch = await prisma.mRMatch.findFirst({
        where: {
          tournamentId,
          stage: "finals",
          matchNumber: currentBracketMatch.loserGoesTo,
        },
      });

      if (nextLoserMatch) {
        /*
         * Determine which position (player 1 or 2) in the losers bracket
         * the loser should be placed in, based on the current round.
         */
        let loserPosition: 1 | 2 = 1;
        if (currentBracketMatch.round === "winners_qf") {
          loserPosition = (((match.matchNumber - 1) % 2) + 1) as 1 | 2;
        } else if (currentBracketMatch.round === "winners_sf") {
          loserPosition = 1;
        } else if (currentBracketMatch.round === "winners_final") {
          loserPosition = 2;
        }

        await prisma.mRMatch.update({
          where: { id: nextLoserMatch.id },
          data:
            loserPosition === 1
              ? { player1Id: loserId }
              : { player2Id: loserId },
        });
      }
    }

    /*
     * Grand Final special handling:
     * If the losers bracket champion wins the grand final,
     * populate a reset match (since WB champion gets a second chance).
     */
    if (currentBracketMatch.round === "grand_final" && loserId) {
      const winnerFromLosers = match.player2Id === winnerId;

      if (winnerFromLosers) {
        const resetMatch = await prisma.mRMatch.findFirst({
          where: {
            tournamentId,
            stage: "finals",
            round: "grand_final_reset",
          },
        });

        if (resetMatch) {
          await prisma.mRMatch.update({
            where: { id: resetMatch.id },
            data: {
              player1Id: winnerId,
              player2Id: loserId,
            },
          });
        }
      }
    }

    /* Determine if the tournament is complete */
    let isComplete = false;
    let champion = null;

    if (currentBracketMatch.round === "grand_final") {
      /* WB champion wins grand final = tournament over */
      const winnerWasFromWinners = match.player1Id === winnerId;
      if (winnerWasFromWinners) {
        isComplete = true;
        champion = winnerId;
      }
    } else if (currentBracketMatch.round === "grand_final_reset") {
      /* Reset match always determines the champion */
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
    logger.error("Failed to update finals match", { error, tournamentId });
    return NextResponse.json(
      { error: "Failed to update match" },
      { status: 500 }
    );
  }
}
