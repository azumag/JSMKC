/**
 * Grand Prix Finals API Route
 *
 * Thin wrapper using the finals-route factory with GP-specific configuration.
 * Uses 'paginated' GET style and maps score1/score2 to points1/points2 fields.
 */

import { createFinalsHandlers } from '@/lib/api-factories/finals-route';

const { GET, POST, PUT } = createFinalsHandlers({
  matchModel: 'gPMatch',
  qualificationModel: 'gPQualification',
  loggerName: 'gp-finals-api',
  qualificationOrderBy: [{ score: 'desc' }, { points: 'desc' }],
  getStyle: 'paginated',
  putScoreFields: { dbField1: 'points1', dbField2: 'points2' },
  getErrorMessage: 'Failed to fetch grand prix finals data',
  postErrorMessage: 'Failed to create grand prix finals bracket',
});

export { GET, POST, PUT };
