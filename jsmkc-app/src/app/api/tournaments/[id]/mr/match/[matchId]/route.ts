/**
 * Match Race Individual Match API Route
 *
 * Thin wrapper around the match-detail-route factory.
 * Provides GET/PUT for individual MR match data with optimistic locking.
 * Uses raw response style with sanitized input.
 */

import { createMatchDetailHandlers } from '@/lib/api-factories/match-detail-route';
import { updateMRMatchScore } from '@/lib/optimistic-locking';

const { GET, PUT } = createMatchDetailHandlers({
  matchModel: 'mRMatch',
  loggerName: 'mr-match-api',
  scoreFields: { field1: 'score1', field2: 'score2' },
  detailField: 'rounds',
  updateMatchScore: (prisma, matchId, version, val1, val2, completed, detail) =>
    updateMRMatchScore(prisma, matchId, version, val1, val2, completed, detail),
  sanitizeBody: true,
  responseStyle: 'raw',
  putRequiresAuth: true,
});

export { GET, PUT };
