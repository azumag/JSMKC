/**
 * Battle Mode Finals API Route
 *
 * Manages the BM double-elimination finals bracket for a tournament.
 * The finals follow qualification and feature the top N players (typically 8)
 * competing in a double-elimination bracket format.
 *
 * Double Elimination Structure:
 * - Winners Bracket: QF -> SF -> Final
 * - Losers Bracket: Multiple rounds for second chances
 * - Grand Final: Winners champion vs Losers champion
 * - Grand Final Reset: If losers champion wins grand final, a reset match is played
 *
 * Endpoints:
 * - GET:  Fetch all finals data (matches grouped by bracket + structure)
 * - POST: Create finals bracket from qualification results
 * - PUT:  Update a finals match result and advance players through the bracket
 */

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { generateBracketStructure, roundNames } from "@/lib/double-elimination";
import { createLogger } from "@/lib/logger";

/**
 * GET /api/tournaments/[id]/bm/finals
 *
 * Fetch all finals tournament data including matches grouped by bracket type.
 * Returns winners bracket, losers bracket, grand final matches, bracket structure,
 * and human-readable round names for display.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  /* Logger must be created inside the function for proper test mocking */
  const logger = createLogger('bm-finals-api');
  const { id: tournamentId } = await params;

  try {
    /* Fetch all finals-stage matches ordered by match number */
    const matches = await prisma.bMMatch.findMany({
      where: { tournamentId, stage: "finals" },
      include: { player1: true, player2: true },
      orderBy: { matchNumber: "asc" },
    });

    /*
     * Group matches by bracket type for structured display.
     * Round naming convention: "winners_*", "losers_*", "grand_final*"
     */
    const winnersMatches = matches.filter(
      (m) => m.round?.startsWith("winners_") || false
    );
    const losersMatches = matches.filter(
      (m) => m.round?.startsWith("losers_") || false
    );
    const grandFinalMatches = matches.filter(
      (m) => m.round?.startsWith("grand_final") || false
    );

    /* Generate bracket structure reference for 8-player double elimination */
    const bracketStructure = matches.length > 0 ? generateBracketStructure(8) : [];

    return NextResponse.json({
      matches,
      winnersMatches,
      losersMatches,
      grandFinalMatches,
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
 * POST /api/tournaments/[id]/bm/finals
 *
 * Create a finals double-elimination bracket from qualification standings.
 * Takes the top N players (default 8) sorted by qualification score and
 * seeds them into the bracket.
 *
 * Request body:
 * {
 *   topN?: number; - Number of players to advance (currently only 8 supported)
 * }
 *
 * Process:
 * 1. Fetch top N players from qualification standings
 * 2. Delete any existing finals matches (reset)
 * 3. Generate bracket structure with seeded matchups
 * 4. Create match records for each bracket position
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const logger = createLogger('bm-finals-api');
  const { id: tournamentId } = await params;

  try {
    const body = await request.json();
    const { topN = 8 } = body;

    /* Currently only 8-player brackets are implemented in the bracket generator */
    if (topN !== 8) {
      return NextResponse.json(
        { error: "Currently only 8-player brackets are supported" },
        { status: 400 }
      );
    }

    /*
     * Fetch qualification standings to determine seeding order.
     * Primary sort: match score (wins*2 + ties)
     * Secondary sort: point differential (round wins - round losses)
     * Tertiary sort: total rounds won (tiebreaker)
     */
    const qualifications = await prisma.bMQualification.findMany({
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

    /* Clear existing finals matches to allow bracket regeneration */
    await prisma.bMMatch.deleteMany({
      where: { tournamentId, stage: "finals" },
    });

    /* Generate the double-elimination bracket structure with match positions */
    const bracketStructure = generateBracketStructure(topN);

    /* Map qualification rank to seed number (1 = highest qualifier) */
    const seededPlayers = qualifications.map((q, index) => ({
      seed: index + 1,
      playerId: q.playerId,
      player: q.player,
    }));

    /*
     * Create match records for each position in the bracket.
     * First-round matches get their seeded players assigned directly.
     * Later rounds use placeholders that will be filled as winners/losers advance.
     */
    const createdMatches = [];
    for (const bracketMatch of bracketStructure) {
      const player1 = bracketMatch.player1Seed
        ? seededPlayers.find((p) => p.seed === bracketMatch.player1Seed)
        : null;
      const player2 = bracketMatch.player2Seed
        ? seededPlayers.find((p) => p.seed === bracketMatch.player2Seed)
        : null;

      /*
       * Create match with assigned players or placeholders.
       * Placeholder IDs are used for later-round matches that haven't
       * been determined yet - they'll be overwritten as players advance.
       */
      const match = await prisma.bMMatch.create({
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

      /* Track which matches have actual players vs placeholders */
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
 * PUT /api/tournaments/[id]/bm/finals
 *
 * Update a finals match result and advance the winner/loser to their next matches
 * in the double-elimination bracket.
 *
 * Request body:
 * {
 *   matchId: string;  - The match to update
 *   score1: number;   - Rounds won by player 1
 *   score2: number;   - Rounds won by player 2
 * }
 *
 * This endpoint handles:
 * 1. Updating the match score and marking it complete
 * 2. Advancing the winner to the next match in their bracket
 * 3. Moving the loser to the losers bracket (if from winners)
 * 4. Special grand final logic including reset match handling
 * 5. Detecting tournament completion and declaring a champion
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const logger = createLogger('bm-finals-api');
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

    /* Fetch the match being updated to verify it's a finals match */
    const match = await prisma.bMMatch.findUnique({
      where: { id: matchId },
      include: { player1: true, player2: true },
    });

    if (!match || match.stage !== "finals") {
      return NextResponse.json(
        { error: "Finals match not found" },
        { status: 404 }
      );
    }

    /*
     * Determine winner/loser based on best-of-5 format.
     * In BM finals, a player must win 3 rounds to win the match.
     */
    const winnerId = score1 >= 3 ? match.player1Id : score2 >= 3 ? match.player2Id : null;
    const loserId = score1 >= 3 ? match.player2Id : score2 >= 3 ? match.player1Id : null;

    if (!winnerId) {
      return NextResponse.json(
        { error: "Match must have a winner (best of 5: first to 3)" },
        { status: 400 }
      );
    }

    /* Update the match record with final scores */
    const updatedMatch = await prisma.bMMatch.update({
      where: { id: matchId },
      data: {
        score1,
        score2,
        completed: true,
      },
      include: { player1: true, player2: true },
    });

    /*
     * Look up the bracket structure to determine where the winner and loser
     * should be placed for their next matches.
     */
    const bracketStructure = generateBracketStructure(8);
    const currentBracketMatch = bracketStructure.find(
      (b) => b.matchNumber === match.matchNumber
    );

    if (!currentBracketMatch) {
      return NextResponse.json({ match: updatedMatch });
    }

    /* Advance winner to their next match in the bracket */
    if (currentBracketMatch.winnerGoesTo) {
      const nextWinnerMatch = await prisma.bMMatch.findFirst({
        where: {
          tournamentId,
          stage: "finals",
          matchNumber: currentBracketMatch.winnerGoesTo,
        },
      });

      if (nextWinnerMatch) {
        /*
         * The position field determines if the winner fills
         * the player1 or player2 slot in the next match.
         */
        const position = currentBracketMatch.position || 1;
        await prisma.bMMatch.update({
          where: { id: nextWinnerMatch.id },
          data:
            position === 1 ? { player1Id: winnerId } : { player2Id: winnerId },
        });
      }
    }

    /* Move loser to the losers bracket (if applicable) */
    if (currentBracketMatch.loserGoesTo && loserId) {
      const nextLoserMatch = await prisma.bMMatch.findFirst({
        where: {
          tournamentId,
          stage: "finals",
          matchNumber: currentBracketMatch.loserGoesTo,
        },
      });

      if (nextLoserMatch) {
        /*
         * Determine which slot the loser fills in the losers bracket.
         * The position depends on which round the loss occurred in:
         * - Winners QF: position based on match number within the round
         * - Winners SF: always position 1
         * - Winners Final: always position 2 (faces the losers bracket champion)
         */
        let loserPosition: 1 | 2 = 1;
        if (currentBracketMatch.round === "winners_qf") {
          loserPosition = (((match.matchNumber - 1) % 2) + 1) as 1 | 2;
        } else if (currentBracketMatch.round === "winners_sf") {
          loserPosition = 1;
        } else if (currentBracketMatch.round === "winners_final") {
          loserPosition = 2;
        }

        await prisma.bMMatch.update({
          where: { id: nextLoserMatch.id },
          data:
            loserPosition === 1
              ? { player1Id: loserId }
              : { player2Id: loserId },
        });
      }
    }

    /*
     * Special Grand Final handling for double elimination.
     * If the losers bracket champion wins the Grand Final, a reset match
     * is required because the winners bracket champion hasn't lost yet.
     */
    if (currentBracketMatch.round === "grand_final" && loserId) {
      const winnerFromLosers = match.player2Id === winnerId;

      if (winnerFromLosers) {
        /* Enable the reset match with both Grand Final players */
        const resetMatch = await prisma.bMMatch.findFirst({
          where: {
            tournamentId,
            stage: "finals",
            round: "grand_final_reset",
          },
        });

        if (resetMatch) {
          await prisma.bMMatch.update({
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
     * Check if the tournament is complete.
     * Tournament ends when:
     * 1. Grand Final is won by the Winners bracket champion (no reset needed)
     * 2. The Grand Final Reset match is completed
     */
    let isComplete = false;
    let champion = null;

    if (currentBracketMatch.round === "grand_final") {
      /* Winners bracket champion winning Grand Final = immediate tournament end */
      const winnerWasFromWinners = match.player1Id === winnerId;
      if (winnerWasFromWinners) {
        isComplete = true;
        champion = winnerId;
      }
    } else if (currentBracketMatch.round === "grand_final_reset") {
      /* Reset match completion always ends the tournament */
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
