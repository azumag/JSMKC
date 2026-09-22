/**
 * Grand Prix Finals API Route
 *
 * Thin wrapper using the finals-route factory with GP-specific configuration.
 * Uses 'paginated' GET style and maps score1/score2 to points1/points2 fields.
 */

import { withApiTiming } from '@/lib/perf/api-timing';
import { createFinalsHandlers } from '@/lib/api-factories/finals-route';
import { normalizeGpFinalsCupResults } from '@/lib/gp-finals-cup-results';
import { getGpFinalsTargetWins } from '@/lib/finals-target-wins';
import { gpQualificationOrderBy } from '@/lib/gp-ranking';

const {
  GET: _GET,
  POST,
  PUT,
  PATCH,
} = createFinalsHandlers({
  eventTypeCode: 'gp',
  matchModel: 'gPMatch',
  qualificationModel: 'gPQualification',
  loggerName: 'gp-finals-api',
  // GP uses match points first, then driver points (per requirements.md Section 4.1)
  /* `group: 'asc'` is first so that Top-24 → Top-16 Playoff (#454) can pick
   * per-group Top-N deterministically. Within-group order: score → points. */
  qualificationOrderBy: gpQualificationOrderBy(),
  getStyle: 'paginated',
  putScoreFields: { dbField1: 'points1', dbField2: 'points2' },
  putAdditionalFields: ['races', 'cup', 'cupResults', 'tvNumber'],
  getTargetWins: getGpFinalsTargetWins,
  getErrorMessage: 'Failed to fetch grand prix finals data',
  postErrorMessage: 'Failed to create grand prix finals bracket',
  postRequiresAuth: true,
  putRequiresAuth: true,
  assignGpCupByRound: true,
  resolveMatchResult: (match, score1, score2, body) => {
    const targetWins = getGpFinalsTargetWins({
      round: match.round as string | null | undefined,
      stage: match.stage as string | null | undefined,
      targetWins: match.targetWins as number | null | undefined,
    });

    if (body.cupResults !== undefined) {
      const normalized = normalizeGpFinalsCupResults(body.cupResults);
      if (normalized.error || !normalized.results) {
        return { error: normalized.error ?? 'Invalid cupResults', field: 'cupResults' };
      }

      const cupWins1 = normalized.results.filter((cup) => cup.winner === 1).length;
      const cupWins2 = normalized.results.filter((cup) => cup.winner === 2).length;
      const player1ReachedTarget = cupWins1 >= targetWins && cupWins1 > cupWins2;
      const player2ReachedTarget = cupWins2 >= targetWins && cupWins2 > cupWins1;
      const firstCup = normalized.results[0];
      const latestCup = normalized.results[normalized.results.length - 1];

      if (player1ReachedTarget || player2ReachedTarget) {
        return {
          winnerId: player1ReachedTarget ? (match.player1Id as string) : (match.player2Id as string),
          loserId: player1ReachedTarget ? (match.player2Id as string) : (match.player1Id as string),
          completed: true,
          updateData: {
            points1: cupWins1,
            points2: cupWins2,
            cupResults: normalized.results,
            cup: typeof latestCup.cup === 'string' ? latestCup.cup : firstCup.cup,
            races: latestCup.races ?? firstCup.races ?? null,
            suddenDeathWinnerId: null,
          },
        };
      }

      return {
        completed: false,
        updateData: {
          points1: cupWins1,
          points2: cupWins2,
          cupResults: normalized.results,
          cup: typeof latestCup.cup === 'string' ? latestCup.cup : firstCup.cup,
          races: latestCup.races ?? firstCup.races ?? null,
          suddenDeathWinnerId: null,
        },
      };
    }

    if (![score1, score2].every((score) => Number.isInteger(score) && score >= 0 && score <= targetWins)) {
      return { error: `Cup wins must be integers from 0 to ${targetWins}`, field: 'score' };
    }

    const player1ReachedTarget = score1 === targetWins && score1 > score2;
    const player2ReachedTarget = score2 === targetWins && score2 > score1;

    if (player1ReachedTarget || player2ReachedTarget) {
      const winnerIsP1 = player1ReachedTarget;
      return {
        winnerId: winnerIsP1 ? (match.player1Id as string) : (match.player2Id as string),
        loserId: winnerIsP1 ? (match.player2Id as string) : (match.player1Id as string),
        completed: true,
        updateData: {
          points1: score1,
          points2: score2,
          cupResults: null,
          races: null,
          suddenDeathWinnerId: null,
        },
      };
    }

    return {
      completed: false,
      updateData: {
        points1: score1,
        points2: score2,
        cupResults: null,
        races: null,
        suddenDeathWinnerId: null,
      },
    };
  },
});

export { POST, PUT, PATCH };
export const GET = (...args: Parameters<typeof _GET>): ReturnType<typeof _GET> =>
  withApiTiming('gp.finals.GET', () => _GET(...args));
