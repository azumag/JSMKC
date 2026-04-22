/**
 * Grand Prix Finals API Route
 *
 * Thin wrapper using the finals-route factory with GP-specific configuration.
 * Uses 'paginated' GET style and maps score1/score2 to points1/points2 fields.
 */

import { createFinalsHandlers } from '@/lib/api-factories/finals-route';
import { getGpFinalsTargetWins } from '@/lib/finals-target-wins';

const { GET, POST, PUT } = createFinalsHandlers({
  matchModel: 'gPMatch',
  qualificationModel: 'gPQualification',
  loggerName: 'gp-finals-api',
  // GP uses drivers points as primary ranking criterion (per requirements.md Section 4.1)
  /* `group: 'asc'` is first so that Top-24 → Top-16 Playoff (#454) can pick
   * per-group Top-N deterministically. Within-group order: points → score. */
  qualificationOrderBy: [{ group: 'asc' }, { points: 'desc' }, { score: 'desc' }],
  getStyle: 'paginated',
  putScoreFields: { dbField1: 'points1', dbField2: 'points2' },
  getTargetWins: getGpFinalsTargetWins,
  getErrorMessage: 'Failed to fetch grand prix finals data',
  postErrorMessage: 'Failed to create grand prix finals bracket',
  postRequiresAuth: true,
  putRequiresAuth: true,
});

export { GET, POST, PUT };
