/**
 * Match Race Individual Match API Route
 *
 * Thin wrapper around the match-detail-route factory.
 * Provides GET/PUT for individual MR match data with optimistic locking.
 *
 * Score validation enforces MR rules: each score must be an integer in [0, 4].
 * BYE matches (score 4-0) are auto-completed at creation and never reach this PUT handler.
 */

import { createMatchDetailHandlers } from '@/lib/api-factories/match-detail-route';
import { getMrFinalsTargetWins } from '@/lib/finals-target-wins';
import { updateMRMatchScore } from '@/lib/optimistic-locking';
import { validateMatchRaceScores } from '@/lib/score-validation';

function validateRoundAwareMrFinalsScores(
  score1: number,
  score2: number,
  match: { stage?: string | null; round?: string | null },
) {
  const targetWins = getMrFinalsTargetWins({ stage: match.stage, round: match.round });

  if (!Number.isInteger(score1) || !Number.isInteger(score2)) {
    return { isValid: false, error: 'Match Race finals scores must be integers' };
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

/* recalcStatsConfig mirrors MR_RECALC_CONFIG in the dual-report route so
 * admin single-match PUT edits keep mRQualification wins/losses/round
 * differential in sync — same motivation as the GP route (see TC-402). */
const { GET, PUT } = createMatchDetailHandlers({
  matchModel: 'mRMatch',
  loggerName: 'mr-match-api',
  scoreFields: { field1: 'score1', field2: 'score2' },
  detailField: 'rounds',
  updateMatchScore: (prisma, matchId, version, val1, val2, completed, detail) =>
    updateMRMatchScore(prisma, matchId, version, val1, val2, completed, detail),
  validateScores: validateMatchRaceScores,
  validateFinalsScoresWithMatch: validateRoundAwareMrFinalsScores,
  sanitizeBody: true,
  putRequiresAuth: true,
  getRequiresAuth: false,
  recalcStatsConfig: {
    matchModel: 'mRMatch',
    qualificationModel: 'mRQualification',
    scoreFields: { p1: 'score1', p2: 'score2' },
    determineResult: (myScore, oppScore) =>
      myScore > oppScore ? 'win' : myScore < oppScore ? 'loss' : 'tie',
    useRoundDifferential: true,
  },
});

export { GET, PUT };
