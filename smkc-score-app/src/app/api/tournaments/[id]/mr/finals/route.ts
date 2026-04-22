/**
 * Match Race Finals API Route
 *
 * Thin wrapper using the finals-route factory with MR-specific configuration.
 * Uses 'simple' GET style and sanitizes both POST and PUT bodies.
 * Includes 'rounds' as an additional PUT field.
 */

import { createFinalsHandlers } from '@/lib/api-factories/finals-route';

const { GET, POST, PUT } = createFinalsHandlers({
  matchModel: 'mRMatch',
  qualificationModel: 'mRQualification',
  loggerName: 'mr-finals-api',
  /* `group: 'asc'` is first so that Top-24 → Top-16 Playoff (#454) can pick
   * per-group Top-N deterministically. Within-group order: score → points → winRounds. */
  qualificationOrderBy: [{ group: 'asc' }, { score: 'desc' }, { points: 'desc' }, { winRounds: 'desc' }],
  getStyle: 'simple',
  putScoreFields: { dbField1: 'score1', dbField2: 'score2' },
  putAdditionalFields: ['rounds'],
  getErrorMessage: 'Failed to fetch finals data',
  postErrorMessage: 'Failed to create finals bracket',
  postRequiresAuth: true,
  putRequiresAuth: true,
  assignMrCoursesByRound: true,
});

export { GET, POST, PUT };
