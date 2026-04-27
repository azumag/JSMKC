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
import { getBmFinalsTargetWins } from '@/lib/finals-target-wins';
import { updateBMMatchScore } from '@/lib/optimistic-locking';
import { validateBattleModeScores, validateBattleModeFinalScores } from '@/lib/score-validation';

function validateRoundAwareBmFinalsScores(
  score1: number,
  score2: number,
  match: { stage?: string | null; round?: string | null },
) {
  const targetWins = getBmFinalsTargetWins({ stage: match.stage, round: match.round });

  if (!Number.isInteger(score1) || !Number.isInteger(score2)) {
    return { isValid: false, error: "Battle Mode finals scores must be integers" };
  }

  if (score1 < 0 || score1 > targetWins || score2 < 0 || score2 > targetWins) {
    return { isValid: false, error: `Finals score must be between 0 and ${targetWins}` };
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
  validateFinalsScores: validateBattleModeFinalScores,
  validateFinalsScoresWithMatch: validateRoundAwareBmFinalsScores,
  sanitizeBody: true,
  putRequiresAuth: true,
  getRequiresAuth: false,
  qualMode: 'bm',
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
