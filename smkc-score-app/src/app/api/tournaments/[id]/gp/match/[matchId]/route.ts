/**
 * Grand Prix Individual Match API Route
 *
 * Thin wrapper around the match-detail-route factory.
 * Provides GET/PUT for individual GP match data with optimistic locking.
 * Uses raw response style with points-based scoring.
 */

import { createMatchDetailHandlers } from '@/lib/api-factories/match-detail-route';
import { updateGPMatchScore } from '@/lib/optimistic-locking';

const { GET, PUT } = createMatchDetailHandlers({
  matchModel: 'gPMatch',
  loggerName: 'gp-match-api',
  scoreFields: { field1: 'points1', field2: 'points2' },
  detailField: 'races',
  updateMatchScore: (prisma, matchId, version, val1, val2, completed, detail) =>
    updateGPMatchScore(prisma, matchId, version, val1, val2, completed, detail),
  responseStyle: 'raw',
  getErrorMessage: 'Failed to fetch grand prix match',
  getLogMessage: 'Failed to fetch GP match',
  includeSuccessInGetErrors: true,
  putRequiresAuth: true,
});

export { GET, PUT };
