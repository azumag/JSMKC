/**
 * Grand Prix (GP) Event Type Configuration
 *
 * GP qualification uses cup-based races with driver points
 * (1st=9, 2nd=6, 3rd=3, 4th=1, 5th-8th=0).
 * Match outcome is determined by total driver points across 5 races (1 cup = 5 courses).
 * Standings use accumulated total driver points as tiebreaker (not differential).
 * At qualification setup, the full cup list is shuffled 5 separate times,
 * concatenated, then assigned 1 cup per round in sequence.
 * Unlike BM/MR, GP has no group-based ordering in qualifications.
 */

import { EventTypeConfig, MatchResult } from './types';
import { AUDIT_ACTIONS } from '@/lib/audit-log';
import { validateGPRacePosition } from '@/lib/score-validation';
import { DRIVER_POINTS, CUPS, CUP_SUBSTITUTIONS, TOTAL_GP_RACES } from '@/lib/constants';
import { updateWithRetry, OptimisticLockError } from '@/lib/optimistic-locking';

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
  matchScoreFields: { p1: 'points1', p2: 'points2' },
  loggerName: 'gp-api',
  eventDisplayName: 'grand prix',
  // Per requirements.md §4.1: GP uses driver points as primary ranking criterion
  qualificationOrderBy: [{ points: 'desc' }, { score: 'desc' }],
  // §7.4: Pre-assign a cup to each qualification round at setup time.
  // Cups are shuffled 5 times and assigned sequentially (1 cup per round).
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
    // Validate all race finishing positions are in the legal range [0, 8].
    // Position 0 is retained for legacy/manual game-over entry and earns 0 points.
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
      // Two human players cannot finish in the same position in SMK GP.
      // Exception: both at position 0 (both game over) is allowed per §7.2.
      if (race.position1 === race.position2 && race.position1 !== 0) {
        return { valid: false, error: `Race ${i + 1}: both players cannot finish in the same position (${race.position1})` };
      }
    }
    return { valid: true, data: { matchId, cup, races } };
  },

  updateMatch: async (prisma, data) => {
    // Use optimistic locking to prevent race conditions between read and update.
    // The read (cup check) and update must be atomic to avoid TOCTOU issues.
    const match = await updateWithRetry(prisma, async (tx) => {
      // §7.4 + §7.1: Validate submitted cup against pre-assigned cup.
      const existing = await tx.gPMatch.findUnique({
        where: { id: data.matchId, tournamentId: data.tournamentId },
        select: { cup: true, version: true },
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

      return tx.gPMatch.update({
        where: { id: data.matchId, tournamentId: data.tournamentId, version: existing!.version },
        data: {
          cup: data.cup,
          points1: totalPoints1,
          points2: totalPoints2,
          races: racesWithPoints,
          completed: true,
          version: { increment: 1 },
        },
        select: {
          id: true,
          tournamentId: true,
          player1Id: true,
          player2Id: true,
          cup: true,
          points1: true,
          points2: true,
          races: true,
          completed: true,
          isBye: true,
        },
      });
    });

    return { match, score1OrPoints1: match.points1, score2OrPoints2: match.points2 };
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
