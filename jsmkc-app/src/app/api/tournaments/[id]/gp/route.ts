/**
 * Grand Prix (GP) Qualification API Route
 *
 * Manages the GP qualification round with cup-based races.
 * GP uses driver points (1st=9, 2nd=6) instead of win/loss scores.
 * Players compete in round-robin groups, and standings are calculated
 * by match score (wins×2 + ties×1) with driver points as tiebreaker.
 *
 * - GET: Fetch qualification standings and matches
 * - POST: Setup groups with round-robin match generation
 * - PUT: Update a match result with cup and race positions
 *
 * Authentication: POST requires admin session
 */

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { sanitizeInput } from "@/lib/sanitize";
import { createLogger } from "@/lib/logger";

/**
 * Calculate driver points from race finishing positions.
 * SMK GP uses simplified F1-style points: 1st gets 9pts, 2nd gets 6pts.
 * Since GP matches are 1v1, only positions 1 and 2 are valid.
 *
 * @param position1 - Player 1's finishing position (1 or 2)
 * @param position2 - Player 2's finishing position (1 or 2)
 * @returns Object with points for each player
 */
function calculateDriverPoints(position1: number, position2: number) {
  /* Map positions to driver points: 1st place = 9 points, 2nd place = 6 points */
  const points1 = position1 === 1 ? 9 : position1 === 2 ? 6 : 0;
  const points2 = position2 === 1 ? 9 : position2 === 2 ? 6 : 0;
  return { points1, points2 };
}

/**
 * Determine match outcome by comparing total driver points.
 * The player with more total points across all races wins the match.
 * Equal points results in a tie (draw).
 *
 * @param points1 - Player 1's total driver points across all races
 * @param points2 - Player 2's total driver points across all races
 * @returns Winner indicator and result labels for each player
 */
function calculateMatchResult(points1: number, points2: number) {
  if (points1 > points2) {
    return { winner: 1, result1: "win" as const, result2: "loss" as const };
  } else if (points2 > points1) {
    return { winner: 2, result1: "loss" as const, result2: "win" as const };
  } else {
    return { winner: null, result1: "tie" as const, result2: "tie" as const };
  }
}

/**
 * GET /api/tournaments/[id]/gp
 *
 * Fetch GP qualification standings and match list.
 * Standings are sorted by score (wins×2 + ties) descending,
 * then by total driver points as tiebreaker.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const logger = createLogger('gp-api');
  const { id: tournamentId } = await params;
  try {
    /* Fetch qualification standings ordered by score then driver points */
    const qualifications = await prisma.gPQualification.findMany({
      where: { tournamentId },
      include: { player: true },
      orderBy: [{ score: "desc" }, { points: "desc" }],
    });

    /* Fetch all qualification-stage matches in match number order */
    const matches = await prisma.gPMatch.findMany({
      where: { tournamentId, stage: "qualification" },
      include: { player1: true, player2: true },
      orderBy: { matchNumber: "asc" },
    });

    return NextResponse.json({ qualifications, matches });
  } catch (error) {
    logger.error("Failed to fetch GP data", { error, tournamentId });
    return NextResponse.json(
      { error: "Failed to fetch grand prix data" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/tournaments/[id]/gp
 *
 * Setup GP qualification groups and generate round-robin matches.
 * Requires admin authentication. Deletes existing qualification data
 * and recreates groups with all pairwise matches.
 *
 * Request body: { players: [{ playerId, group, seeding? }] }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const logger = createLogger('gp-api');
  const session = await auth();

  /* Admin authentication required for group setup */
  if (!session?.user) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 401 }
    );
  }

  const { id: tournamentId } = await params;
  try {
    const body = sanitizeInput(await request.json());
    const { players } = body;

    /* Validate players array is provided and non-empty */
    if (!players || !Array.isArray(players) || players.length === 0) {
      return NextResponse.json(
        { error: "Players array is required" },
        { status: 400 }
      );
    }

    /* Clear existing qualification and match data for fresh setup */
    await prisma.gPQualification.deleteMany({
      where: { tournamentId },
    });

    await prisma.gPMatch.deleteMany({
      where: { tournamentId, stage: "qualification" },
    });

    /* Create qualification entries for each player with their group assignment */
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

    /*
     * Generate round-robin matches within each group.
     * Every player plays every other player in their group exactly once.
     * Match numbers are sequential across all groups.
     */
    const groups = [...new Set(players.map((p: { group: string }) => p.group))];
    let matchNumber = 1;

    for (const group of groups) {
      const groupPlayers = players.filter(
        (p: { group: string }) => p.group === group
      );

      /* Nested loop generates all unique pairs within the group */
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
    logger.error("Failed to setup GP", { error, tournamentId });
    return NextResponse.json(
      { error: "Failed to setup grand prix" },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/tournaments/[id]/gp
 *
 * Update a GP qualification match result.
 * Accepts cup name and 4 race results with positions.
 * Calculates driver points per race and total, updates match,
 * then recalculates both players' qualification standings.
 *
 * Request body: { matchId, cup, races: [{ course, position1, position2 }] }
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const logger = createLogger('gp-api');
  const { id: tournamentId } = await params;
  try {
    const body = await request.json();
    const { matchId, cup, races } = body;

    /* GP requires exactly 4 races per cup match */
    if (!matchId || !cup || !races || races.length !== 4) {
      return NextResponse.json(
        { error: "matchId, cup, and 4 races are required" },
        { status: 400 }
      );
    }

    /*
     * Calculate driver points for each race based on finishing positions.
     * Each race awards 9 points for 1st place and 6 points for 2nd place.
     * Total match points are the sum across all 4 races.
     */
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

    /* Update the match with cup, calculated points, race details, and mark complete */
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

    /* Determine match result (win/loss/tie) based on total driver points */
    const { result1, result2 } = calculateMatchResult(totalPoints1, totalPoints2);

    /*
     * Recalculate qualification standings for both players.
     * This requires fetching ALL completed qualification matches for each player,
     * not just the current match, to ensure accurate cumulative stats.
     */
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

    /* Calculate player 1's cumulative stats across all completed matches */
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

    /* Calculate player 2's cumulative stats across all completed matches */
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

    /* Score formula: wins×2 + ties×1 (standard round-robin scoring) */
    const p1Score = p1Stats.wins * 2 + p1Stats.ties;
    const p2Score = p2Stats.wins * 2 + p2Stats.ties;

    /* Update qualification records with recalculated standings */
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
    logger.error("Failed to update match", { error, tournamentId });
    return NextResponse.json(
      { error: "Failed to update match" },
      { status: 500 }
    );
  }
}
