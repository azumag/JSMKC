/**
 * Battle Mode Single Match API Route
 *
 * Thin wrapper around the match-detail-route factory.
 * Provides GET/PUT for individual BM match data with optimistic locking.
 *
 * Score validation is applied on PUT to enforce BM rules (4 rounds total, ties allowed per §4.1),
 * preventing silent data corruption where invalid scores (e.g. 5-0) would be stored
 * but then treated as a tie by calculateMatchResult (which requires score1+score2 = 4).
 */

import { createMatchDetailHandlers } from '@/lib/api-factories/match-detail-route';
import { updateBMMatchScore } from '@/lib/optimistic-locking';
import { validateBattleModeScores, validateBattleModeFinalScores } from '@/lib/score-validation';

/* recalcStatsConfig mirrors BM_RECALC_CONFIG in the dual-report route so
 * admin single-match PUT edits keep bMQualification wins/losses/round
 * differential in sync — same motivation as the GP route (see TC-402). */
const { GET, PUT } = createMatchDetailHandlers({
  matchModel: 'bMMatch',
  loggerName: 'bm-match-api',
  scoreFields: { field1: 'score1', field2: 'score2' },
  detailField: 'rounds',
  updateMatchScore: (prisma, matchId, version, val1, val2, completed, detail) =>
    updateBMMatchScore(prisma, matchId, version, val1, val2, completed, detail),
  validateScores: validateBattleModeScores,
  validateFinalsScores: validateBattleModeFinalScores,
  sanitizeBody: true,
  putRequiresAuth: true,
  getRequiresAuth: true,
  recalcStatsConfig: {
    matchModel: 'bMMatch',
    qualificationModel: 'bMQualification',
    scoreFields: { p1: 'score1', p2: 'score2' },
    determineResult: (myScore, oppScore) =>
      myScore > oppScore ? 'win' : myScore < oppScore ? 'loss' : 'tie',
    useRoundDifferential: true,
  },
});

export { GET, PUT };
