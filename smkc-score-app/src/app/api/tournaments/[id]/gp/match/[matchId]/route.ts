/**
 * Grand Prix Individual Match API Route
 *
 * Thin wrapper around the match-detail-route factory.
 * Provides GET/PUT for individual GP match data with optimistic locking.
 * Uses points-based scoring (driver points).
 */

import { createMatchDetailHandlers } from '@/lib/api-factories/match-detail-route';
import { updateGPMatchScore } from '@/lib/optimistic-locking';

/* Qualification recalculation config mirrors GP_RECALC_CONFIG in
 * src/app/api/tournaments/[id]/gp/match/[matchId]/report/route.ts — both
 * code paths (admin single-match PUT and player dual-report auto-confirm)
 * must maintain the same gPQualification win/loss/points aggregation so
 * standings and overall-ranking stay consistent. */
const { GET, PUT } = createMatchDetailHandlers({
  matchModel: 'gPMatch',
  loggerName: 'gp-match-api',
  scoreFields: { field1: 'points1', field2: 'points2' },
  detailField: 'races',
  updateMatchScore: (prisma, matchId, version, val1, val2, completed, detail) =>
    updateGPMatchScore(prisma, matchId, version, val1, val2, completed, detail),
  sanitizeBody: true,
  putRequiresAuth: true,
  getRequiresAuth: false,
  qualMode: 'gp',
  recalcStatsConfig: {
    matchModel: 'gPMatch',
    qualificationModel: 'gPQualification',
    scoreFields: { p1: 'points1', p2: 'points2' },
    determineResult: (myPoints, oppPoints) =>
      myPoints > oppPoints ? 'win' : myPoints < oppPoints ? 'loss' : 'tie',
    useRoundDifferential: false,
  },
});

export { GET, PUT };
