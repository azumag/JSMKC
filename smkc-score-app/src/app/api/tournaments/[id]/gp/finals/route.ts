/**
 * Grand Prix Finals API Route
 *
 * Thin wrapper using the finals-route factory with GP-specific configuration.
 * Uses 'paginated' GET style and maps score1/score2 to points1/points2 fields.
 */

import { withApiTiming } from '@/lib/perf/api-timing';
import { createFinalsHandlers } from '@/lib/api-factories/finals-route';
import { getGpFinalsTargetWins } from '@/lib/finals-target-wins';
import { CUPS, DRIVER_POINTS } from '@/lib/constants';

type GpCupResultInput = {
  cup?: unknown;
  points1?: unknown;
  points2?: unknown;
  races?: unknown;
};

const MAX_GP_CUP_RESULTS = 20;

function sumRacePoints(races: unknown, side: 1 | 2): number | null {
  if (!Array.isArray(races)) return null;
  let total = 0;
  for (const race of races) {
    if (!race || typeof race !== 'object') return null;
    const entry = race as Record<string, unknown>;
    const existing = entry[side === 1 ? 'points1' : 'points2'];
    if (Number.isInteger(existing) && Number(existing) >= 0) {
      total += Number(existing);
      continue;
    }
    const position = entry[side === 1 ? 'position1' : 'position2'];
    if (!Number.isInteger(position)) return null;
    total += DRIVER_POINTS[Number(position)] ?? 0;
  }
  return total;
}

function normalizeCupResults(input: unknown): { results?: Array<Record<string, unknown>>; error?: string } {
  if (!Array.isArray(input) || input.length === 0) {
    return { error: 'cupResults must be a non-empty array' };
  }
  if (input.length > MAX_GP_CUP_RESULTS) {
    return { error: `cupResults must not exceed ${MAX_GP_CUP_RESULTS} entries` };
  }

  const results: Array<Record<string, unknown>> = [];
  for (let index = 0; index < input.length; index++) {
    const raw = input[index] as GpCupResultInput;
    if (!raw || typeof raw !== 'object') {
      return { error: `cupResults[${index}] must be an object` };
    }

    const fallbackCup = CUPS[index % CUPS.length];
    const cup = typeof raw.cup === 'string' && raw.cup.length > 0 ? raw.cup : fallbackCup;
    const racePoints1 = sumRacePoints(raw.races, 1);
    const racePoints2 = sumRacePoints(raw.races, 2);
    const points1 = Number.isInteger(raw.points1) && Number(raw.points1) >= 0
      ? Number(raw.points1)
      : racePoints1;
    const points2 = Number.isInteger(raw.points2) && Number(raw.points2) >= 0
      ? Number(raw.points2)
      : racePoints2;

    if (points1 === null || points2 === null || !Number.isInteger(points1) || !Number.isInteger(points2) || points1 < 0 || points2 < 0) {
      return { error: `cupResults[${index}] requires non-negative integer points` };
    }
    const p1 = points1;
    const p2 = points2;

    results.push({
      cup,
      points1: p1,
      points2: p2,
      winner: p1 > p2 ? 1 : p2 > p1 ? 2 : null,
      ...(Array.isArray(raw.races) ? { races: raw.races } : {}),
    });
  }

  return { results };
}

const { GET: _GET, POST, PUT, PATCH } = createFinalsHandlers({
  eventTypeCode: 'gp',
  matchModel: 'gPMatch',
  qualificationModel: 'gPQualification',
  loggerName: 'gp-finals-api',
  // GP uses drivers points as primary ranking criterion (per requirements.md Section 4.1)
  /* `group: 'asc'` is first so that Top-24 → Top-16 Playoff (#454) can pick
   * per-group Top-N deterministically. Within-group order: points → score. */
  qualificationOrderBy: [{ group: 'asc' }, { points: 'desc' }, { score: 'desc' }],
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
    });

    if (body.cupResults !== undefined) {
      const normalized = normalizeCupResults(body.cupResults);
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
          winnerId: player1ReachedTarget ? match.player1Id as string : match.player2Id as string,
          loserId: player1ReachedTarget ? match.player2Id as string : match.player1Id as string,
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

    if (![score1, score2].every((score) => Number.isInteger(score) && score >= 0)) {
      return { error: 'Driver points must be non-negative integers', field: 'score' };
    }

    if (score1 !== score2) {
      const winnerIsP1 = score1 > score2;
      return {
        winnerId: winnerIsP1 ? match.player1Id as string : match.player2Id as string,
        loserId: winnerIsP1 ? match.player2Id as string : match.player1Id as string,
        updateData: {
          points1: winnerIsP1 ? targetWins : 0,
          points2: winnerIsP1 ? 0 : targetWins,
          cupResults: [{
            cup: typeof body.cup === 'string' ? body.cup : match.cup ?? CUPS[0],
            points1: score1,
            points2: score2,
            winner: winnerIsP1 ? 1 : 2,
            ...(Array.isArray(body.races) ? { races: body.races } : {}),
          }],
          suddenDeathWinnerId: null,
        },
      };
    }

    return {
      completed: false,
      updateData: {
        points1: 0,
        points2: 0,
        cupResults: [{
          cup: typeof body.cup === 'string' ? body.cup : match.cup ?? CUPS[0],
          points1: score1,
          points2: score2,
          winner: null,
          ...(Array.isArray(body.races) ? { races: body.races } : {}),
        }],
        suddenDeathWinnerId: null,
      },
    };
  },
});

export { POST, PUT, PATCH };
export const GET = (...args: Parameters<typeof _GET>): ReturnType<typeof _GET> =>
  withApiTiming('gp.finals.GET', () => _GET(...args));
