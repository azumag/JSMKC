/**
 * Grand Prix Standings API Route
 *
 * Thin wrapper around the standings-route factory.
 * Uses direct findMany with player transform for GP qualification standings.
 * Does NOT include group field in response (unlike MR).
 *
 * GET /api/tournaments/[id]/gp/standings
 * - Admin only (403 for non-admin)
 * - Sorted by drivers points desc, then match score desc (per tournament rules)
 * - ETag caching with If-None-Match: * bypass
 */

import { withApiTiming } from '@/lib/perf/api-timing';
import { createStandingsHandlers } from '@/lib/api-factories/standings-route';

const { GET: _GET } = createStandingsHandlers({
  loggerName: 'gp-standings-api',
  errorMessage: 'Failed to fetch GP standings',
  qualificationModel: 'gPQualification',
  usePagination: false,
  // GP ranking uses drivers points as primary criterion (per requirements.md Section 4.1),
  // with match score (Win=2, Tie=1, Loss=0) as tiebreaker
  orderBy: [{ points: 'desc' }, { score: 'desc' }],
  // H2H tiebreaker (requirements §4.1 step 3): resolve tied players by direct match results
  // GP matches store driver points as points1/points2 (not score1/score2 like BM/MR)
  matchModel: 'gPMatch',
  matchScoreFields: { p1: 'points1', p2: 'points2' },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  transformQualification: (q: any) => ({
    // q._rank is pre-computed by the factory using tie-aware (1224) ranking,
    // then overridden by rankOverride if set by an admin.
    rank: q._rank,
    rankOverridden: q._rankOverridden ?? false,
    playerId: q.playerId,
    playerName: q.player.name,
    playerNickname: q.player.nickname,
    matchesPlayed: q.mp,
    wins: q.wins,
    ties: q.ties,
    losses: q.losses,
    points: q.points,
    score: q.score,
  }),
});

export const GET = (...args: Parameters<typeof _GET>): ReturnType<typeof _GET> =>
  withApiTiming('gp.standings.GET', () => _GET(...args));
