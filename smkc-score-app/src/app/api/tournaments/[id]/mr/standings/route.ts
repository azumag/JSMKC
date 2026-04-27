/**
 * Match Race Standings API Route
 *
 * Thin wrapper around the standings-route factory.
 * Uses direct findMany with player transform for MR qualification standings.
 * Includes group field in response (unlike GP).
 *
 * GET /api/tournaments/[id]/mr/standings
 * - Admin only (403 for non-admin)
 * - Sorted by score desc, then points desc
 * - ETag caching with If-None-Match: * bypass
 */

import { withApiTiming } from '@/lib/perf/api-timing';
import { createStandingsHandlers } from '@/lib/api-factories/standings-route';

const { GET: _GET } = createStandingsHandlers({
  loggerName: 'mr-standings-api',
  errorMessage: 'Failed to fetch MR standings',
  qualificationModel: 'mRQualification',
  usePagination: false,
  orderBy: [{ score: 'desc' }, { points: 'desc' }],
  // H2H tiebreaker (requirements §4.1 step 3): resolve tied players by direct match results
  matchModel: 'mRMatch',
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  transformQualification: (q: any) => ({
    // q._rank is pre-computed by the factory using tie-aware (1224) ranking,
    // then overridden by rankOverride if set by an admin.
    rank: q._rank,
    rankOverridden: q._rankOverridden ?? false,
    playerId: q.playerId,
    playerName: q.player.name,
    playerNickname: q.player.nickname,
    group: q.group,
    matchesPlayed: q.mp,
    wins: q.wins,
    ties: q.ties,
    losses: q.losses,
    points: q.points,
    score: q.score,
  }),
});

export const GET = (...args: Parameters<typeof _GET>): ReturnType<typeof _GET> =>
  withApiTiming('mr.standings.GET', () => _GET(...args));
