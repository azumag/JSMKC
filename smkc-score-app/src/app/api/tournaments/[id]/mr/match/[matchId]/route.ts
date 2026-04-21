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
import { updateMRMatchScore } from '@/lib/optimistic-locking';
import { validateMatchRaceScores } from '@/lib/score-validation';

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
  sanitizeBody: true,
  putRequiresAuth: true,
  getRequiresAuth: true,
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
