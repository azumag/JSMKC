/**
 * Grand Prix (GP) Event Type Configuration
 *
 * GP qualification uses cup-based races with driver points (1st=9, 2nd=6, 3rd=3, 4th=1).
 * Match outcome is determined by total driver points across 5 races (1 cup = 5 courses).
 * Standings use accumulated total driver points as tiebreaker (not differential).
 * Unlike BM/MR, GP has no group-based ordering in qualifications.
 */

import { EventTypeConfig, MatchResult } from './types';
import { AUDIT_ACTIONS } from '@/lib/audit-log';
import { validateGPRacePosition } from '@/lib/score-validation';
import { DRIVER_POINTS, CUPS, CUP_SUBSTITUTIONS, TOTAL_GP_RACES } from '@/lib/constants';

/**
 * Calculate driver points from race finishing positions.
 * Uses centralized DRIVER_POINTS table from constants.ts.
 */
function calculateDriverPoints(position1: number, position2: number) {
  const points1 = DRIVER_POINTS[position1] ?? 0;
  const points2 = DRIVER_POINTS[position2] ?? 0;
  return { points1, points2 };
}

/**
 * Error thrown when a submitted cup does not match the pre-assigned cup
 * and is not an allowed §7.1 substitution.
 * Caught by qualification-route.ts PUT handler to return a 400 response.
 */
export class CupMismatchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CupMismatchError';
  }
}

/**
 * Validate that a submitted cup is acceptable given the pre-assigned cup.
 * Returns true if the submitted cup matches the assigned cup, or is an
 * allowed substitution per §7.1 (Star→Mushroom, Special→Flower).
 * When no cup is pre-assigned, any cup is accepted.
 */
export function isValidCupChoice(assignedCup: string | null | undefined, submittedCup: string): boolean {
  if (!assignedCup) return true;
  if (submittedCup === assignedCup) return true;
  return CUP_SUBSTITUTIONS[assignedCup] === submittedCup;
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
  // §7.4: Pre-assign a cup to each qualification match at setup time.
  // Cups are shuffled and distributed cyclically (4 cups for N matches).
  assignCupRandomly: true,
  cupList: CUPS,
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
    if (!matchId || !cup || !races || races.length !== TOTAL_GP_RACES) {
      return { valid: false, error: `matchId, cup, and ${TOTAL_GP_RACES} races are required` };
    }
    // Validate all race finishing positions are in the legal range [0, 4].
    // Position 0 = game over (§7.2: player eliminated before this race, earns 0 points).
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
    // §7.4 + §7.1: Validate submitted cup against pre-assigned cup.
    // Fetch existing match to check if a cup was pre-assigned at setup time.
    const existing = await prisma.gPMatch.findUnique({
      where: { id: data.matchId },
      select: { cup: true },
    });
    if (existing?.cup && !isValidCupChoice(existing.cup, data.cup!)) {
      const allowed = CUP_SUBSTITUTIONS[existing.cup];
      const hint = allowed
        ? ` (allowed: "${existing.cup}" or "${allowed}")`
        : '';
      throw new CupMismatchError(
        `Cup mismatch: assigned "${existing.cup}", submitted "${data.cup}"${hint}`
      );
    }

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
