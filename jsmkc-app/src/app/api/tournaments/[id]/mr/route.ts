import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

function calculateMatchResult(score1: number, score2: number) {
  const totalRounds = score1 + score2;
  if (totalRounds === 0) {
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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: tournamentId } = await params;

    const qualifications = await prisma.mRQualification.findMany({
      where: { tournamentId },
      include: { player: true },
      orderBy: [{ group: "asc" }, { score: "desc" }, { points: "desc" }],
    });

    const matches = await prisma.mRMatch.findMany({
      where: { tournamentId, stage: "qualification" },
      include: { player1: true, player2: true },
      orderBy: { matchNumber: "asc" },
    });

    return NextResponse.json({ qualifications, matches });
  } catch (error) {
    console.error("Failed to fetch MR data:", error);
    return NextResponse.json(
      { error: "Failed to fetch match race data" },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: tournamentId } = await params;
    const body = await request.json();
    const { players } = body;

    if (!players || !Array.isArray(players) || players.length === 0) {
      return NextResponse.json(
        { error: "Players array is required" },
        { status: 400 }
      );
    }

    await prisma.mRQualification.deleteMany({
      where: { tournamentId },
    });

    await prisma.mRMatch.deleteMany({
      where: { tournamentId, stage: "qualification" },
    });

    const qualifications = await Promise.all(
      players.map((p: { playerId: string; group: string; seeding?: number }) =>
        prisma.mRQualification.create({
          data: {
            tournamentId,
            playerId: p.playerId,
            group: p.group,
            seeding: p.seeding,
          },
        })
      )
    );

    const groups = [...new Set(players.map((p: { group: string }) => p.group))];
    let matchNumber = 1;

    for (const group of groups) {
      const groupPlayers = players.filter(
        (p: { group: string }) => p.group === group
      );

      for (let i = 0; i < groupPlayers.length; i++) {
        for (let j = i + 1; j < groupPlayers.length; j++) {
          await prisma.mRMatch.create({
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

    return NextResponse.json(
      { message: "Match race setup complete", qualifications },
      { status: 201 }
    );
  } catch (error) {
    console.error("Failed to setup MR:", error);
    return NextResponse.json(
      { error: "Failed to setup match race" },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: tournamentId } = await params;
    const body = await request.json();
    const { matchId, score1, score2, rounds } = body;

    if (!matchId || score1 === undefined || score2 === undefined) {
      return NextResponse.json(
        { error: "matchId, score1, and score2 are required" },
        { status: 400 }
      );
    }

    const match = await prisma.mRMatch.update({
      where: { id: matchId },
      data: {
        score1,
        score2,
        rounds: rounds || null,
        completed: true,
      },
      include: { player1: true, player2: true },
    });

    const { result1, result2 } = calculateMatchResult(score1, score2);

    const player1Matches = await prisma.mRMatch.findMany({
      where: {
        tournamentId,
        stage: "qualification",
        completed: true,
        OR: [{ player1Id: match.player1Id }, { player2Id: match.player1Id }],
      },
    });

    const player2Matches = await prisma.mRMatch.findMany({
      where: {
        tournamentId,
        stage: "qualification",
        completed: true,
        OR: [{ player1Id: match.player2Id }, { player2Id: match.player2Id }],
      },
    });

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

    const p1Score = p1Stats.wins * 2 + p1Stats.ties;
    const p2Score = p2Stats.wins * 2 + p2Stats.ties;

    await prisma.mRQualification.updateMany({
      where: { tournamentId, playerId: match.player1Id },
      data: {
        ...p1Stats,
        points: p1Stats.winRounds - p1Stats.lossRounds,
        score: p1Score,
      },
    });

    await prisma.mRQualification.updateMany({
      where: { tournamentId, playerId: match.player2Id },
      data: {
        ...p2Stats,
        points: p2Stats.winRounds - p2Stats.lossRounds,
        score: p2Score,
      },
    });

    return NextResponse.json({ match, result1, result2 });
  } catch (error) {
    console.error("Failed to update match:", error);
    return NextResponse.json(
      { error: "Failed to update match" },
      { status: 500 }
    );
  }
}
