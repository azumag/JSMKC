import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { sanitizeInput } from "@/lib/sanitize";

function calculateDriverPoints(position1: number, position2: number) {
  const points1 = position1 === 1 ? 9 : position1 === 2 ? 6 : 0;
  const points2 = position2 === 1 ? 9 : position2 === 2 ? 6 : 0;
  return { points1, points2 };
}

function calculateMatchResult(points1: number, points2: number) {
  if (points1 > points2) {
    return { winner: 1, result1: "win" as const, result2: "loss" as const };
  } else if (points2 > points1) {
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

    const qualifications = await prisma.gPQualification.findMany({
      where: { tournamentId },
      include: { player: true },
      orderBy: [{ score: "desc" }, { points: "desc" }],
    });

    const matches = await prisma.gPMatch.findMany({
      where: { tournamentId, stage: "qualification" },
      include: { player1: true, player2: true },
      orderBy: { matchNumber: "asc" },
    });

    return NextResponse.json({ qualifications, matches });
  } catch (error) {
    console.error("Failed to fetch GP data:", error);
    return NextResponse.json(
      { error: "Failed to fetch grand prix data" },
      { status: 500 }
    );
  }
}

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

  try {
    const { id: tournamentId } = await params;
    const body = sanitizeInput(await request.json());
    const { players } = body;

    if (!players || !Array.isArray(players) || players.length === 0) {
      return NextResponse.json(
        { error: "Players array is required" },
        { status: 400 }
      );
    }

    await prisma.gPQualification.deleteMany({
      where: { tournamentId },
    });

    await prisma.gPMatch.deleteMany({
      where: { tournamentId, stage: "qualification" },
    });

    const qualifications = await Promise.all(
      players.map((p: { playerId: string; group: string; seeding?: number }) =>
        prisma.gPQualification.create({
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
          await prisma.gPMatch.create({
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
      { message: "Grand prix setup complete", qualifications },
      { status: 201 }
    );
  } catch (error) {
    console.error("Failed to setup GP:", error);
    return NextResponse.json(
      { error: "Failed to setup grand prix" },
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
    const { matchId, cup, races } = body;

    if (!matchId || !cup || !races || races.length !== 4) {
      return NextResponse.json(
        { error: "matchId, cup, and 4 races are required" },
        { status: 400 }
      );
    }

    let totalPoints1 = 0;
    let totalPoints2 = 0;

    const racesWithPoints = races.map((race: { course: string; position1: number; position2: number }) => {
      const { points1, points2 } = calculateDriverPoints(
        race.position1,
        race.position2
      );
      totalPoints1 += points1;
      totalPoints2 += points2;
      return {
        ...race,
        points1,
        points2,
      };
    });

    const match = await prisma.gPMatch.update({
      where: { id: matchId },
      data: {
        cup,
        points1: totalPoints1,
        points2: totalPoints2,
        races: racesWithPoints,
        completed: true,
      },
      include: { player1: true, player2: true },
    });

    const { result1, result2 } = calculateMatchResult(totalPoints1, totalPoints2);

    const player1Matches = await prisma.gPMatch.findMany({
      where: {
        tournamentId,
        stage: "qualification",
        completed: true,
        OR: [{ player1Id: match.player1Id }, { player2Id: match.player1Id }],
      },
    });

    const player2Matches = await prisma.gPMatch.findMany({
      where: {
        tournamentId,
        stage: "qualification",
        completed: true,
        OR: [{ player1Id: match.player2Id }, { player2Id: match.player2Id }],
      },
    });

    const p1Stats = { mp: 0, wins: 0, ties: 0, losses: 0, points: 0 };
    for (const m of player1Matches) {
      p1Stats.mp++;
      const isPlayer1 = m.player1Id === match.player1Id;
      const myPoints = isPlayer1 ? m.points1 : m.points2;
      p1Stats.points += myPoints;
      const { result1: r1 } = calculateMatchResult(
        isPlayer1 ? m.points1 : m.points2,
        isPlayer1 ? m.points2 : m.points1
      );
      if (r1 === "win") p1Stats.wins++;
      else if (r1 === "loss") p1Stats.losses++;
      else p1Stats.ties++;
    }

    const p2Stats = { mp: 0, wins: 0, ties: 0, losses: 0, points: 0 };
    for (const m of player2Matches) {
      p2Stats.mp++;
      const isPlayer1 = m.player1Id === match.player2Id;
      const myPoints = isPlayer1 ? m.points1 : m.points2;
      p2Stats.points += myPoints;
      const { result1: r1 } = calculateMatchResult(
        isPlayer1 ? m.points1 : m.points2,
        isPlayer1 ? m.points2 : m.points1
      );
      if (r1 === "win") p2Stats.wins++;
      else if (r1 === "loss") p2Stats.losses++;
      else p2Stats.ties++;
    }

    const p1Score = p1Stats.wins * 2 + p1Stats.ties;
    const p2Score = p2Stats.wins * 2 + p2Stats.ties;

    await prisma.gPQualification.updateMany({
      where: { tournamentId, playerId: match.player1Id },
      data: {
        ...p1Stats,
        score: p1Score,
      },
    });

    await prisma.gPQualification.updateMany({
      where: { tournamentId, playerId: match.player2Id },
      data: {
        ...p2Stats,
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
