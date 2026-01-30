/**
 * Match Race (MR) Qualification API Route
 *
 * Manages the qualification phase of Match Race tournaments.
 * MR is a 1v1 random course racing format where players compete in
 * best-of-5 race matches (first to 3 wins).
 *
 * This route provides:
 * - GET: Fetch qualification standings and matches
 * - POST: Set up groups and generate round-robin matches
 * - PUT: Update match scores and recalculate standings
 *
 * Qualification uses group round-robin format where players in each group
 * play against every other player. Standings are ranked by:
 * 1. Score (wins×2 + ties×1)
 * 2. Points (win rounds - loss rounds differential)
 *
 * Authentication: Admin role required for POST/PUT operations
 */

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { sanitizeInput } from "@/lib/sanitize";
import { createLogger } from "@/lib/logger";

/**
 * Calculate the result of a match based on individual race scores.
 * A match is won when a player reaches 3 race wins (best of 5).
 *
 * @param score1 - Number of races won by player 1
 * @param score2 - Number of races won by player 2
 * @returns Object containing winner indicator and result strings for both players
 */
function calculateMatchResult(score1: number, score2: number) {
  /* No races played yet means the match hasn't started */
  const totalRounds = score1 + score2;
  if (totalRounds === 0) {
    return { winner: null, result1: "tie" as const, result2: "tie" as const };
  }

  /* First to 3 wins takes the match */
  if (score1 >= 3) {
    return { winner: 1, result1: "win" as const, result2: "loss" as const };
  } else if (score2 >= 3) {
    return { winner: 2, result1: "loss" as const, result2: "win" as const };
  } else {
    /* Match in progress or incomplete - treat as tie */
    return { winner: null, result1: "tie" as const, result2: "tie" as const };
  }
}

/**
 * GET /api/tournaments/[id]/mr
 *
 * Fetch MR qualification data including standings and all qualification matches.
 * Standings are sorted by group, then score, then point differential.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  /* Logger must be created inside the function for proper test mocking */
  const logger = createLogger('mr-api');
  const { id: tournamentId } = await params;
  try {
    /* Fetch qualification standings ordered by group and performance metrics */
    const qualifications = await prisma.mRQualification.findMany({
      where: { tournamentId },
      include: { player: true },
      orderBy: [{ group: "asc" }, { score: "desc" }, { points: "desc" }],
    });

    /* Fetch all qualification-stage matches in match order */
    const matches = await prisma.mRMatch.findMany({
      where: { tournamentId, stage: "qualification" },
      include: { player1: true, player2: true },
      orderBy: { matchNumber: "asc" },
    });

    return NextResponse.json({ qualifications, matches });
  } catch (error) {
    logger.error("Failed to fetch MR data", { error, tournamentId });
    return NextResponse.json(
      { error: "Failed to fetch match race data" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/tournaments/[id]/mr
 *
 * Set up MR qualification groups and generate round-robin matches.
 * Accepts an array of players with group assignments.
 * Deletes any existing qualification data before creating new setup.
 *
 * Round-robin: Every player in a group plays every other player once.
 * For n players in a group, this creates n*(n-1)/2 matches.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const logger = createLogger('mr-api');
  const { id: tournamentId } = await params;
  try {
    /* Sanitize request body to prevent injection attacks */
    const body = sanitizeInput(await request.json());
    const { players } = body;

    /* Validate that players array is provided and non-empty */
    if (!players || !Array.isArray(players) || players.length === 0) {
      return NextResponse.json(
        { error: "Players array is required" },
        { status: 400 }
      );
    }

    /* Clear existing qualification data for a fresh setup */
    await prisma.mRQualification.deleteMany({
      where: { tournamentId },
    });

    await prisma.mRMatch.deleteMany({
      where: { tournamentId, stage: "qualification" },
    });

    /* Create qualification records for each player with group assignment */
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

    /*
     * Generate round-robin matches for each group.
     * For each group, create a match between every pair of players.
     * Match numbers are sequential across all groups.
     */
    const groups = [...new Set(players.map((p: { group: string }) => p.group))];
    let matchNumber = 1;

    for (const group of groups) {
      const groupPlayers = players.filter(
        (p: { group: string }) => p.group === group
      );

      /* Generate all unique pairings within the group */
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
    logger.error("Failed to setup MR", { error, tournamentId });
    return NextResponse.json(
      { error: "Failed to setup match race" },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/tournaments/[id]/mr
 *
 * Update a qualification match score and recalculate both players' standings.
 * After updating the match, this endpoint:
 * 1. Fetches all completed matches for both players
 * 2. Recalculates W/L/T records and round differentials
 * 3. Updates qualification standings with new statistics
 *
 * Score formula: wins×2 + ties×1
 * Points formula: winRounds - lossRounds (round differential)
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const logger = createLogger('mr-api');
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

    /* Update the match with new scores */
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

    /* Determine match result for standings recalculation */
    const { result1, result2 } = calculateMatchResult(score1, score2);

    /*
     * Recalculate player 1's complete standings.
     * Must check all completed matches where this player participated
     * (could be as player1 or player2 in any match).
     */
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

    /* Aggregate player 1 statistics across all their completed matches */
    const p1Stats = { mp: 0, wins: 0, ties: 0, losses: 0, winRounds: 0, lossRounds: 0 };
    for (const m of player1Matches) {
      p1Stats.mp++;
      const isPlayer1 = m.player1Id === match.player1Id;
      p1Stats.winRounds += isPlayer1 ? m.score1 : m.score2;
      p1Stats.lossRounds += isPlayer1 ? m.score2 : m.score1;
      const { result1: r1 } = calculateMatchResult(
        isPlayer1 ? m.score1 : m.score2,
        isPlayer1 ? m.score2 : m.score1
      );
      if (r1 === "win") p1Stats.wins++;
      else if (r1 === "loss") p1Stats.losses++;
      else p1Stats.ties++;
    }

    /* Aggregate player 2 statistics across all their completed matches */
    const p2Stats = { mp: 0, wins: 0, ties: 0, losses: 0, winRounds: 0, lossRounds: 0 };
    for (const m of player2Matches) {
      p2Stats.mp++;
      const isPlayer1 = m.player1Id === match.player2Id;
      p2Stats.winRounds += isPlayer1 ? m.score1 : m.score2;
      p2Stats.lossRounds += isPlayer1 ? m.score2 : m.score1;
      const { result1: r1 } = calculateMatchResult(
        isPlayer1 ? m.score1 : m.score2,
        isPlayer1 ? m.score2 : m.score1
      );
      if (r1 === "win") p2Stats.wins++;
      else if (r1 === "loss") p2Stats.losses++;
      else p2Stats.ties++;
    }

    /* Calculate composite score: 2 points per win, 1 point per tie */
    const p1Score = p1Stats.wins * 2 + p1Stats.ties;
    const p2Score = p2Stats.wins * 2 + p2Stats.ties;

    /* Update both players' qualification standings in the database */
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
    logger.error("Failed to update match", { error, tournamentId });
    return NextResponse.json(
      { error: "Failed to update match" },
      { status: 500 }
    );
  }
}
