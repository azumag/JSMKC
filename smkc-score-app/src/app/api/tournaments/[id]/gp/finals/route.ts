/**
 * Grand Prix Finals API Route
 *
 * Thin wrapper using the finals-route factory with GP-specific configuration.
 * Uses 'paginated' GET style and maps score1/score2 to points1/points2 fields.
 */

import { createFinalsHandlers } from '@/lib/api-factories/finals-route';
import { getGpFinalsTargetWins } from '@/lib/finals-target-wins';

const { GET, POST, PUT, PATCH } = createFinalsHandlers({
  matchModel: 'gPMatch',
  qualificationModel: 'gPQualification',
  loggerName: 'gp-finals-api',
  // GP uses drivers points as primary ranking criterion (per requirements.md Section 4.1)
  /* `group: 'asc'` is first so that Top-24 → Top-16 Playoff (#454) can pick
   * per-group Top-N deterministically. Within-group order: points → score. */
  qualificationOrderBy: [{ group: 'asc' }, { points: 'desc' }, { score: 'desc' }],
  getStyle: 'paginated',
  putScoreFields: { dbField1: 'points1', dbField2: 'points2' },
  putAdditionalFields: ['races', 'cup', 'tvNumber'],
  getTargetWins: getGpFinalsTargetWins,
  getErrorMessage: 'Failed to fetch grand prix finals data',
  postErrorMessage: 'Failed to create grand prix finals bracket',
  postRequiresAuth: true,
  putRequiresAuth: true,
  assignGpCupByRound: true,
  resolveMatchResult: (match, score1, score2, body) => {
    if (![score1, score2].every((score) => Number.isInteger(score) && score >= 0)) {
      return { error: 'Driver points must be non-negative integers', field: 'score' };
    }

    if (score1 !== score2) {
      return {
        winnerId: score1 > score2 ? match.player1Id as string : match.player2Id as string,
        loserId: score1 > score2 ? match.player2Id as string : match.player1Id as string,
        updateData: { suddenDeathWinnerId: null },
      };
    }

    const suddenDeathWinnerId = body.suddenDeathWinnerId;
    if (typeof suddenDeathWinnerId !== 'string' || suddenDeathWinnerId.length === 0) {
      return {
        error: 'Tied GP finals scores require a sudden-death winner',
        field: 'suddenDeathWinnerId',
      };
    }

    if (suddenDeathWinnerId !== match.player1Id && suddenDeathWinnerId !== match.player2Id) {
      return {
        error: 'Sudden-death winner must be one of the match players',
        field: 'suddenDeathWinnerId',
      };
    }

    return {
      winnerId: suddenDeathWinnerId,
      loserId: suddenDeathWinnerId === match.player1Id
        ? match.player2Id as string
        : match.player1Id as string,
      updateData: { suddenDeathWinnerId },
    };
  },
});

export { GET, POST, PUT, PATCH };
