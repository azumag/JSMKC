/**
 * Battle Mode Standings API Route
 *
 * Thin wrapper around the standings-route factory.
 * Uses direct findMany with player transform and H2H tiebreaker for BM qualification standings.
 *
 * GET /api/tournaments/[id]/bm/standings
 * - Admin only (403 for non-admin)
 * - ETag caching with If-None-Match: * bypass
 *
 * Switched from paginated to non-paginated path to enable H2H tiebreaker (§4.1 step 3).
 * JSMKC tournaments have ~50 players max, so pagination is unnecessary.
 */

import { withApiTiming } from '@/lib/perf/api-timing';
import { createStandingsHandlers } from '@/lib/api-factories/standings-route';

const { GET: _GET } = createStandingsHandlers({
  loggerName: 'bm-standings-api',
  errorMessage: 'Failed to fetch BM standings',
  qualificationModel: 'bMQualification',
  usePagination: false,
  // Per requirements.md §4.1: sort by group (display), then match score desc, then round differential desc
  orderBy: [{ group: 'asc' }, { score: 'desc' }, { points: 'desc' }],
  // H2H tiebreaker (requirements §4.1 step 3): resolve tied players by direct match results.
  // BM uses score1/score2 (round win counts) to determine H2H winner.
  matchModel: 'bMMatch',
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  transformQualification: (q: any) => ({
    // q._rank is pre-computed by the factory using tie-aware (1224) ranking + H2H,
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
    winRounds: q.winRounds,
    lossRounds: q.lossRounds,
    points: q.points,
    score: q.score,
  }),
});

export const GET = (...args: Parameters<typeof _GET>): ReturnType<typeof _GET> =>
  withApiTiming('bm.standings.GET', () => _GET(...args));
