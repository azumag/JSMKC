import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

// Helper function to calculate match result
function calculateMatchResult(score1: number, score2: number) {
  if (score1 >= 3) {
    return { winner: 1, result1: "win" as const, result2: "loss" as const };
  } else if (score2 >= 3) {
    return { winner: 2, result1: "loss" as const, result2: "win" as const };
  } else {
    return { winner: null, result1: "tie" as const, result2: "tie" as const };
  }
}

// POST report score from a player
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; matchId: string }> }
) {
  try {
    const { id: tournamentId, matchId } = await params;
    const body = await request.json();
    const { reportingPlayer, score1, score2 } = body;

    // Validate input
    if (reportingPlayer !== 1 && reportingPlayer !== 2) {
      return NextResponse.json(
        { error: "Invalid reporting player" },
        { status: 400 }
      );
    }

    if (score1 + score2 !== 4) {
      return NextResponse.json(
        { error: "Total rounds must equal 4" },
        { status: 400 }
      );
    }

    // Get current match
    const match = await prisma.bMMatch.findUnique({
      where: { id: matchId },
    });

    if (!match) {
      return NextResponse.json({ error: "Match not found" }, { status: 404 });
    }

    if (match.completed) {
      return NextResponse.json(
        { error: "Match already completed" },
        { status: 400 }
      );
    }

    // Update the reported scores
    const updateData =
      reportingPlayer === 1
        ? {
            player1ReportedScore1: score1,
            player1ReportedScore2: score2,
          }
        : {
            player2ReportedScore1: score1,
            player2ReportedScore2: score2,
          };

    const updatedMatch = await prisma.bMMatch.update({
      where: { id: matchId },
      data: updateData,
    });

    // Check if both players have reported and scores match
    const p1s1 = updatedMatch.player1ReportedScore1;
    const p1s2 = updatedMatch.player1ReportedScore2;
    const p2s1 = updatedMatch.player2ReportedScore1;
    const p2s2 = updatedMatch.player2ReportedScore2;

    if (
      p1s1 !== null &&
      p1s2 !== null &&
      p2s1 !== null &&
      p2s2 !== null &&
      p1s1 === p2s1 &&
      p1s2 === p2s2
    ) {
      // Scores match - auto-confirm and update qualifications
      const finalMatch = await prisma.bMMatch.update({
        where: { id: matchId },
        data: {
          score1: p1s1,
          score2: p1s2,
          completed: true,
        },
        include: { player1: true, player2: true },
      });

      // Recalculate qualifications for both players
      await recalculatePlayerStats(tournamentId, finalMatch.player1Id);
      await recalculatePlayerStats(tournamentId, finalMatch.player2Id);

      return NextResponse.json({
        message: "Scores confirmed and match completed",
        match: finalMatch,
        autoConfirmed: true,
      });
    }

    // If both reported but don't match, flag for admin review
    if (
      p1s1 !== null &&
      p1s2 !== null &&
      p2s1 !== null &&
      p2s2 !== null
    ) {
      return NextResponse.json({
        message: "Score reported but mismatch detected - awaiting admin review",
        match: updatedMatch,
        mismatch: true,
        player1Report: { score1: p1s1, score2: p1s2 },
        player2Report: { score1: p2s1, score2: p2s2 },
      });
    }

    return NextResponse.json({
      message: "Score reported successfully",
      match: updatedMatch,
      waitingFor: reportingPlayer === 1 ? "player2" : "player1",
    });
  } catch (error) {
    console.error("Failed to report score:", error);
    return NextResponse.json(
      { error: "Failed to report score" },
      { status: 500 }
    );
  }
}

// Helper to recalculate player stats
async function recalculatePlayerStats(tournamentId: string, playerId: string) {
  const matches = await prisma.bMMatch.findMany({
    where: {
      tournamentId,
      stage: "qualification",
      completed: true,
      OR: [{ player1Id: playerId }, { player2Id: playerId }],
    },
  });

  let stats = {
    mp: 0,
    wins: 0,
    ties: 0,
    losses: 0,
    winRounds: 0,
    lossRounds: 0,
  };

  for (const m of matches) {
    stats.mp++;
    const isPlayer1 = m.player1Id === playerId;
    const myScore = isPlayer1 ? m.score1 : m.score2;
    const oppScore = isPlayer1 ? m.score2 : m.score1;
    stats.winRounds += myScore;
    stats.lossRounds += oppScore;

    const { result1 } = calculateMatchResult(
      isPlayer1 ? m.score1 : m.score2,
      isPlayer1 ? m.score2 : m.score1
    );

    if (result1 === "win") stats.wins++;
    else if (result1 === "loss") stats.losses++;
    else stats.ties++;
  }

  const score = stats.wins * 2 + stats.ties;

  await prisma.bMQualification.updateMany({
    where: { tournamentId, playerId },
    data: {
      ...stats,
      points: stats.winRounds - stats.lossRounds,
      score,
    },
  });
}
