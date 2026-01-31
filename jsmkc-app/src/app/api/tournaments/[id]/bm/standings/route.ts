/**
 * Battle Mode Standings API Route
 *
 * Thin wrapper around the standings-route factory.
 * Uses paginated fetching for BM qualification standings.
 *
 * GET /api/tournaments/[id]/bm/standings
 * - Admin only (403 for non-admin)
 * - Paginated: ?page=1&limit=50
 * - ETag caching with If-None-Match: * bypass
 */

import { createStandingsHandlers } from '@/lib/api-factories/standings-route';

const { GET } = createStandingsHandlers({
  loggerName: 'bm-standings-api',
  errorMessage: 'Failed to fetch BM standings',
  qualificationModel: 'bMQualification',
  usePagination: true,
  orderBy: [],
});

export { GET };
