/**
 * Battle Mode Single Match API Route
 *
 * Thin wrapper around the match-detail-route factory.
 * Provides GET/PUT for individual BM match data with optimistic locking.
 * Uses structured response style (error-handling helpers).
 */

import { createMatchDetailHandlers } from '@/lib/api-factories/match-detail-route';
import { updateBMMatchScore } from '@/lib/optimistic-locking';

const { GET, PUT } = createMatchDetailHandlers({
  matchModel: 'bMMatch',
  loggerName: 'bm-match-api',
  scoreFields: { field1: 'score1', field2: 'score2' },
  detailField: 'rounds',
  updateMatchScore: (prisma, matchId, version, val1, val2, completed, detail) =>
    updateBMMatchScore(prisma, matchId, version, val1, val2, completed, detail),
  responseStyle: 'structured',
});

export { GET, PUT };
