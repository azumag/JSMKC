/**
 * Grand Prix (GP) Event Type Configuration
 *
 * GP qualification uses cup-based races with driver points (1st=9, 2nd=6, 3rd=3, 4th=1).
 * Match outcome is determined by total driver points across 4 races.
 * Standings use accumulated total driver points as tiebreaker (not differential).
 * Unlike BM/MR, GP has no group-based ordering in qualifications.
 */

import { EventTypeConfig, MatchResult } from './types';
import { AUDIT_ACTIONS } from '@/lib/audit-log';
import { validateGPRacePosition } from '@/lib/score-validation';

/**
 * SMK driver points lookup table indexed by finishing position.
 * Index 0 is unused (positions are 1-based); positions beyond 4th earn 0 points.
 * Per requirements.md glossary: 1st=9, 2nd=6, 3rd=3, 4th=1.
 */
const DRIVER_POINTS = [0, 9, 6, 3, 1] as const;

/**
 * Calculate driver points from race finishing positions.
 * 1st=9, 2nd=6, 3rd=3, 4th=1, 5th+=0.
 */
function calculateDriverPoints(position1: number, position2: number) {
  const points1 = DRIVER_POINTS[position1] ?? 0;
  const points2 = DRIVER_POINTS[position2] ?? 0;
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
  eventTypeCode: 'gp',
  qualificationModel: 'gPQualification',
  matchModel: 'gPMatch',
  loggerName: 'gp-api',
  eventDisplayName: 'grand prix',
  // Per requirements.md §4.1: GP uses driver points as primary ranking criterion
  qualificationOrderBy: [{ points: 'desc' }, { score: 'desc' }],
  postRequiresAuth: true,
  putRequiresAuth: true,
  // Audit GP qualification setup for consistency with BM/MR (§10.6 traceability)
  auditAction: AUDIT_ACTIONS.CREATE_GP_MATCH,
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
    // Validate all race finishing positions are in the legal range [1, 4].
    // Positions outside this range (e.g. 0, 5) are rejected to prevent silent
    // data corruption — the driver points lookup returns 0 for unknown positions,
    // making invalid input indistinguishable from a last-place finish.
    for (let i = 0; i < races.length; i++) {
      const race = races[i];
      const p1Result = validateGPRacePosition(race.position1);
      if (!p1Result.isValid) {
        return { valid: false, error: `Race ${i + 1} position1: ${p1Result.error}` };
      }
      const p2Result = validateGPRacePosition(race.position2);
      if (!p2Result.isValid) {
        return { valid: false, error: `Race ${i + 1} position2: ${p2Result.error}` };
      }
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
