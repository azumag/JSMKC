/**
 * Battle Mode Finals API Route
 *
 * Thin wrapper using the finals-route factory with BM-specific configuration.
 * Uses 'grouped' GET style (winners/losers/grandFinal arrays) and
 * score1/score2 fields for match updates.
 */

import { createFinalsHandlers } from '@/lib/api-factories/finals-route';

const { GET, POST, PUT } = createFinalsHandlers({
  matchModel: 'bMMatch',
  qualificationModel: 'bMQualification',
  loggerName: 'bm-finals-api',
  qualificationOrderBy: [{ score: 'desc' }, { points: 'desc' }, { winRounds: 'desc' }],
  getStyle: 'grouped',
  putScoreFields: { dbField1: 'score1', dbField2: 'score2' },
  getErrorMessage: 'Failed to fetch finals data',
  postErrorMessage: 'Failed to create finals bracket',
});

export { GET, POST, PUT };
