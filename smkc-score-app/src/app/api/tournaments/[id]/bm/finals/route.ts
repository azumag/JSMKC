/**
 * Battle Mode Finals API Route
 *
 * Thin wrapper using the finals-route factory with BM-specific configuration.
 * Uses 'grouped' GET style (winners/losers/grandFinal arrays) and
 * score1/score2 fields for match updates.
 */

import { createFinalsHandlers } from '@/lib/api-factories/finals-route';
import { getBmFinalsTargetWins } from '@/lib/finals-target-wins';

const { GET, POST, PUT } = createFinalsHandlers({
  matchModel: 'bMMatch',
  qualificationModel: 'bMQualification',
  loggerName: 'bm-finals-api',
  /* `group: 'asc'` is first so that Top-24 → Top-16 Playoff (#454) can pick
   * per-group Top-N deterministically. Within-group order: score → points → winRounds. */
  qualificationOrderBy: [{ group: 'asc' }, { score: 'desc' }, { points: 'desc' }, { winRounds: 'desc' }],
  getStyle: 'grouped',
  putScoreFields: { dbField1: 'score1', dbField2: 'score2' },
  getTargetWins: getBmFinalsTargetWins,
  getErrorMessage: 'Failed to fetch finals data',
  postErrorMessage: 'Failed to create finals bracket',
  postRequiresAuth: true,
  putRequiresAuth: true,
});

export { GET, POST, PUT };
