/**
 * Grand Prix (GP) Event Type Configuration
 *
 * GP qualification uses cup-based races with driver points (1st=9, 2nd=6).
 * Match outcome is determined by total driver points across 4 races.
 * Standings use accumulated total driver points as tiebreaker (not differential).
 * Unlike BM/MR, GP has no group-based ordering in qualifications.
 */

import { EventTypeConfig, MatchResult } from './types';

/**
 * Calculate driver points from race finishing positions.
 * 1st place = 9 points, 2nd place = 6 points, other = 0.
 */
function calculateDriverPoints(position1: number, position2: number) {
  const points1 = position1 === 1 ? 9 : position1 === 2 ? 6 : 0;
  const points2 = position2 === 1 ? 9 : position2 === 2 ? 6 : 0;
  return { points1, points2 };
}

/** Determine GP match outcome by comparing total driver points */
function calculateMatchResult(points1: number, points2: number): MatchResult {
  if (points1 > points2) {
    return { winner: 1, result1: 'win', result2: 'loss' };
  } else if (points2 > points1) {
    return { winner: 2, result1: 'loss', result2: 'win' };
  }
  return { winner: null, result1: 'tie', result2: 'tie' };
}

export const gpConfig: EventTypeConfig = {
  qualificationModel: 'gPQualification',
  matchModel: 'gPMatch',
  loggerName: 'gp-api',
  eventDisplayName: 'grand prix',
  qualificationOrderBy: [{ score: 'desc' }, { points: 'desc' }],
  postRequiresAuth: true,
  /* No audit logging for GP POST (matches original behavior) */
  setupCompleteMessage: 'Grand prix setup complete',

  parsePutBody: (body) => {
    const { matchId, cup, races } = body as {
      matchId?: string;
      cup?: string;
      races?: Array<{ course: string; position1: number; position2: number }>;
    };
    if (!matchId || !cup || !races || races.length !== 4) {
      return { valid: false, error: 'matchId, cup, and 4 races are required' };
    }
    return { valid: true, data: { matchId, cup, races } };
  },

  updateMatch: async (prisma, data) => {
    let totalPoints1 = 0;
    let totalPoints2 = 0;

    const racesWithPoints = data.races!.map((race) => {
      const { points1, points2 } = calculateDriverPoints(race.position1, race.position2);
      totalPoints1 += points1;
      totalPoints2 += points2;
      return { ...race, points1, points2 };
    });

    const match = await prisma.gPMatch.update({
      where: { id: data.matchId },
      data: {
        cup: data.cup,
        points1: totalPoints1,
        points2: totalPoints2,
        races: racesWithPoints,
        completed: true,
      },
      include: { player1: true, player2: true },
    });

    return { match, score1OrPoints1: totalPoints1, score2OrPoints2: totalPoints2 };
  },

  calculateMatchResult,

  aggregatePlayerStats: (matches, playerId, calcResult) => {
    const stats = { mp: 0, wins: 0, ties: 0, losses: 0, points: 0 };
    for (const m of matches) {
      stats.mp++;
      const isPlayer1 = m.player1Id === playerId;
      const myPoints = isPlayer1 ? m.points1 : m.points2;
      stats.points += myPoints;
      const { result1 } = calcResult(
        isPlayer1 ? m.points1 : m.points2,
        isPlayer1 ? m.points2 : m.points1,
      );
      if (result1 === 'win') stats.wins++;
      else if (result1 === 'loss') stats.losses++;
      else stats.ties++;
    }
    const score = stats.wins * 2 + stats.ties;
    return {
      stats,
      score,
      qualificationData: { ...stats, score },
    };
  },
};
