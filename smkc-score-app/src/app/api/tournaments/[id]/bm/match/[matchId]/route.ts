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
import { getBmFinalsTargetWins, type FinalsTargetContext } from '@/lib/finals-target-wins';

function validateBattleModeFinalScoresForContext(
  score1: number,
  score2: number,
  context?: FinalsTargetContext,
) {
  const targetWins = getBmFinalsTargetWins(context);

  if (![score1, score2].every((score) => Number.isInteger(score) && score >= 0)) {
    return { isValid: false, error: 'Scores must be non-negative integers' };
  }

  if (targetWins === 5) {
    return validateBattleModeFinalScores(score1, score2);
  }

  const player1Wins = score1 === targetWins && score2 < targetWins;
  const player2Wins = score2 === targetWins && score1 < targetWins;
  if (!player1Wins && !player2Wins) {
    return { isValid: false, error: `One player must reach exactly ${targetWins} wins` };
  }

  return { isValid: true };
}

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
  validateFinalsScores: validateBattleModeFinalScoresForContext,
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
