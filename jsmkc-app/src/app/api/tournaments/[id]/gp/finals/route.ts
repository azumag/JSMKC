import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { generateBracketStructure, roundNames } from "@/lib/double-elimination";
import { paginate } from "@/lib/pagination";
import { createLogger } from "@/lib/logger";

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

    const result = await paginate(
      {
        findMany: prisma.gPMatch.findMany,
        count: prisma.gPMatch.count,
      },
      { tournamentId, stage: "finals" },
      { matchNumber: "asc" },
      { page, limit }
    );

    const bracketStructure = result.data.length > 0 ? generateBracketStructure(8) : [];

    return NextResponse.json({
      ...result,
      bracketStructure,
      roundNames,
    });
  } catch (error) {
    // Use structured logging for error tracking and debugging
    logger.error("Failed to fetch GP finals data", { error, tournamentId });
    return NextResponse.json(
      { error: "Failed to fetch grand prix finals data" },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const logger = createLogger('gp-finals-api');
  const { id: tournamentId } = await params;
  try {
    const body = await request.json();
    const { topN = 8 } = body;

    if (topN !== 8) {
      return NextResponse.json(
        { error: "Currently only 8-player brackets are supported" },
        { status: 400 }
      );
    }

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

    await prisma.gPMatch.deleteMany({
      where: { tournamentId, stage: "finals" },
    });

    const bracketStructure = generateBracketStructure(topN);

    const seededPlayers = qualifications.map((q, index) => ({
      seed: index + 1,
      playerId: q.playerId,
      player: q.player,
    }));

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
    // Use structured logging for error tracking and debugging
    logger.error("Failed to create GP finals", { error, tournamentId });
    return NextResponse.json(
      { error: "Failed to create grand prix finals bracket" },
      { status: 500 }
    );
  }
}

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

    const winnerId = score1 >= 3 ? match.player1Id : score2 >= 3 ? match.player2Id : null;
    const loserId = score1 >= 3 ? match.player2Id : score2 >= 3 ? match.player1Id : null;

    if (!winnerId) {
      return NextResponse.json(
        { error: "Match must have a winner (best of 5: first to 3)" },
        { status: 400 }
      );
    }

    const updatedMatch = await prisma.gPMatch.update({
      where: { id: matchId },
      data: {
        points1: score1,
        points2: score2,
        completed: true,
      },
      include: { player1: true, player2: true },
    });

    const bracketStructure = generateBracketStructure(8);
    const currentBracketMatch = bracketStructure.find(
      (b) => b.matchNumber === match.matchNumber
    );

    if (!currentBracketMatch) {
      return NextResponse.json({ match: updatedMatch });
    }

    if (currentBracketMatch.winnerGoesTo) {
      const nextWinnerMatch = await prisma.gPMatch.findFirst({
        where: {
          tournamentId,
          stage: "finals",
          matchNumber: currentBracketMatch.winnerGoesTo,
        },
      });

      if (nextWinnerMatch) {
        const position = currentBracketMatch.position || 1;
        await prisma.gPMatch.update({
          where: { id: nextWinnerMatch.id },
          data:
            position === 1 ? { player1Id: winnerId } : { player2Id: winnerId },
        });
      }
    }

    if (currentBracketMatch.loserGoesTo && loserId) {
      const nextLoserMatch = await prisma.gPMatch.findFirst({
        where: {
          tournamentId,
          stage: "finals",
          matchNumber: currentBracketMatch.loserGoesTo,
        },
      });

      if (nextLoserMatch) {
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
    // Use structured logging for error tracking and debugging
    logger.error("Failed to update GP finals match", { error, tournamentId });
    return NextResponse.json(
      { error: "Failed to update match" },
      { status: 500 }
    );
  }
}
