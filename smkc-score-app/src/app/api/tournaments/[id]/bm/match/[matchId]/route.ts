/**
 * Battle Mode Single Match API Route
 *
 * Thin wrapper around the match-detail-route factory.
 * Provides GET/PUT for individual BM match data with optimistic locking.
 * Uses structured response style (error-handling helpers).
 *
 * Score validation is applied on PUT to enforce BM rules (4 rounds total, no ties),
 * preventing silent data corruption where invalid scores (e.g. 5-0) would be stored
 * but then treated as a tie by calculateMatchResult (which requires score1+score2 = 4).
 */

import { createMatchDetailHandlers } from '@/lib/api-factories/match-detail-route';
import { updateBMMatchScore } from '@/lib/optimistic-locking';
import { validateBattleModeScores } from '@/lib/score-validation';

const { GET, PUT } = createMatchDetailHandlers({
  matchModel: 'bMMatch',
  loggerName: 'bm-match-api',
  scoreFields: { field1: 'score1', field2: 'score2' },
  detailField: 'rounds',
  updateMatchScore: (prisma, matchId, version, val1, val2, completed, detail) =>
    updateBMMatchScore(prisma, matchId, version, val1, val2, completed, detail),
  validateScores: validateBattleModeScores,
  responseStyle: 'structured',
  putRequiresAuth: true,
});

export { GET, PUT };
