/**
 * Battle Mode Finals API Route
 *
 * Thin wrapper using the finals-route factory with BM-specific configuration.
 * Uses 'grouped' GET style (winners/losers/grandFinal arrays) and
 * score1/score2 fields for match updates.
 */

import { createFinalsHandlers } from '@/lib/api-factories/finals-route';
import { getBmFinalsTargetWins } from '@/lib/finals-target-wins';

const { GET, POST, PUT, PATCH } = createFinalsHandlers({
  matchModel: 'bMMatch',
  qualificationModel: 'bMQualification',
  loggerName: 'bm-finals-api',
  /* `group: 'asc'` is first so that Top-24 → Top-16 Playoff (#454) can pick
   * per-group Top-N deterministically. Within-group order: score → points → winRounds. */
  qualificationOrderBy: [{ group: 'asc' }, { score: 'desc' }, { points: 'desc' }, { winRounds: 'desc' }],
  getStyle: 'grouped',
  putScoreFields: { dbField1: 'score1', dbField2: 'score2' },
  /* tvNumber: broadcast slot, startingCourseNumber: which Battle Course (1-4) starts the match.
   * The latter is randomised per-round at bracket creation (issue #671) and can be
   * overridden per-match by the admin via the score dialog. */
  putAdditionalFields: ['tvNumber', 'startingCourseNumber'],
  getTargetWins: getBmFinalsTargetWins,
  /* Assign a random starting Battle Course (1-4) to every match in each bracket round
   * at bracket-creation time.  All matches in the same round share one course. */
  assignBmStartingCourseByRound: true,
  getErrorMessage: 'Failed to fetch finals data',
  postErrorMessage: 'Failed to create finals bracket',
  postRequiresAuth: true,
  putRequiresAuth: true,
});

export { GET, POST, PUT, PATCH };
