import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { generateBracketStructure, roundNames } from "@/lib/double-elimination";
import { createLogger } from "@/lib/logger";

// GET finals tournament data
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const logger = createLogger('bm-finals-api');
  const { id: tournamentId } = await params;
  try {

    const matches = await prisma.bMMatch.findMany({
      where: { tournamentId, stage: "finals" },
      include: { player1: true, player2: true },
      orderBy: { matchNumber: "asc" },
    });

    // Group matches by bracket
    const winnersMatches = matches.filter(
      (m) => m.round?.startsWith("winners_") || false
    );
    const losersMatches = matches.filter(
      (m) => m.round?.startsWith("losers_") || false
    );
    const grandFinalMatches = matches.filter(
      (m) => m.round?.startsWith("grand_final") || false
    );

    // Get bracket structure for reference
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
    // Use structured logging for error tracking and debugging
    logger.error("Failed to fetch finals data", { error, tournamentId });
    return NextResponse.json(
      { error: "Failed to fetch finals data" },
      { status: 500 }
    );
  }
}

// POST create finals tournament from qualification results
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const logger = createLogger('bm-finals-api');
  const { id: tournamentId } = await params;
  try {
    const body = await request.json();
    const { topN = 8 } = body; // Number of players to advance

    if (topN !== 8) {
      return NextResponse.json(
        { error: "Currently only 8-player brackets are supported" },
        { status: 400 }
      );
    }

    // Get qualification standings (top N across all groups)
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

    // Delete existing finals matches
    await prisma.bMMatch.deleteMany({
      where: { tournamentId, stage: "finals" },
    });

    // Generate bracket structure
    const bracketStructure = generateBracketStructure(topN);

    // Create seeded player mapping
    const seededPlayers = qualifications.map((q, index) => ({
      seed: index + 1,
      playerId: q.playerId,
      player: q.player,
    }));

    // Create matches
    const createdMatches = [];
    for (const bracketMatch of bracketStructure) {
      const player1 = bracketMatch.player1Seed
        ? seededPlayers.find((p) => p.seed === bracketMatch.player1Seed)
        : null;
      const player2 = bracketMatch.player2Seed
        ? seededPlayers.find((p) => p.seed === bracketMatch.player2Seed)
        : null;

      // Only create match if at least one player is assigned (for initial rounds)
      // or if it's a later round match that will be filled in later
      const match = await prisma.bMMatch.create({
        data: {
          tournamentId,
          matchNumber: bracketMatch.matchNumber,
          stage: "finals",
          round: bracketMatch.round,
          player1Id: player1?.playerId || seededPlayers[0].playerId, // Placeholder
          player2Id: player2?.playerId || seededPlayers[1].playerId, // Placeholder
          completed: false,
        },
        include: { player1: true, player2: true },
      });

      // Mark matches without actual players as "TBD"
      // We'll update them as the tournament progresses
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
    // Use structured logging for error tracking and debugging
    logger.error("Failed to create finals", { error, tournamentId });
    return NextResponse.json(
      { error: "Failed to create finals bracket" },
      { status: 500 }
    );
  }
}

// PUT update match result and advance players
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

    // Get the match being updated
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

    // Determine winner and loser
    const winnerId = score1 >= 3 ? match.player1Id : score2 >= 3 ? match.player2Id : null;
    const loserId = score1 >= 3 ? match.player2Id : score2 >= 3 ? match.player1Id : null;

    if (!winnerId) {
      return NextResponse.json(
        { error: "Match must have a winner (best of 5: first to 3)" },
        { status: 400 }
      );
    }

    // Update the match
    const updatedMatch = await prisma.bMMatch.update({
      where: { id: matchId },
      data: {
        score1,
        score2,
        completed: true,
      },
      include: { player1: true, player2: true },
    });

    // Get bracket structure to determine next matches
    const bracketStructure = generateBracketStructure(8);
    const currentBracketMatch = bracketStructure.find(
      (b) => b.matchNumber === match.matchNumber
    );

    if (!currentBracketMatch) {
      return NextResponse.json({ match: updatedMatch });
    }

    // Advance winner to next match
    if (currentBracketMatch.winnerGoesTo) {
      const nextWinnerMatch = await prisma.bMMatch.findFirst({
        where: {
          tournamentId,
          stage: "finals",
          matchNumber: currentBracketMatch.winnerGoesTo,
        },
      });

      if (nextWinnerMatch) {
        const position = currentBracketMatch.position || 1;
        await prisma.bMMatch.update({
          where: { id: nextWinnerMatch.id },
          data:
            position === 1 ? { player1Id: winnerId } : { player2Id: winnerId },
        });
      }
    }

    // Move loser to losers bracket (if applicable)
    if (currentBracketMatch.loserGoesTo && loserId) {
      const nextLoserMatch = await prisma.bMMatch.findFirst({
        where: {
          tournamentId,
          stage: "finals",
          matchNumber: currentBracketMatch.loserGoesTo,
        },
      });

      if (nextLoserMatch) {
        // Determine position for loser
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

    // Special handling for Grand Final
    if (currentBracketMatch.round === "grand_final" && loserId) {
      // Check if the loser was from Winners bracket (needs reset)
      // The winner of Grand Final from Winners side loses to Losers side
      // This means a reset match is needed
      const winnerFromLosers = match.player2Id === winnerId; // Player 2 is from Losers

      if (winnerFromLosers) {
        // Enable the reset match
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

    // Check if tournament is complete
    let isComplete = false;
    let champion = null;

    if (currentBracketMatch.round === "grand_final") {
      // Winner from Winners bracket wins Grand Final = tournament complete
      const winnerWasFromWinners = match.player1Id === winnerId;
      if (winnerWasFromWinners) {
        isComplete = true;
        champion = winnerId;
      }
    } else if (currentBracketMatch.round === "grand_final_reset") {
      // Reset match played = tournament complete
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
    // Use structured logging for error tracking and debugging
    logger.error("Failed to update finals match", { error, tournamentId });
    return NextResponse.json(
      { error: "Failed to update match" },
      { status: 500 }
    );
  }
}
