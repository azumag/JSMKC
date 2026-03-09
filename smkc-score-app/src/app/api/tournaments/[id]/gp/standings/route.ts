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

import { createStandingsHandlers } from '@/lib/api-factories/standings-route';

const { GET } = createStandingsHandlers({
  loggerName: 'gp-standings-api',
  errorMessage: 'Failed to fetch GP standings',
  qualificationModel: 'gPQualification',
  usePagination: false,
  // GP ranking uses drivers points as primary criterion (per requirements.md Section 4.1),
  // with match score (Win=2, Tie=1, Loss=0) as tiebreaker
  orderBy: [{ points: 'desc' }, { score: 'desc' }],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  transformQualification: (q: any, index: number) => ({
    rank: index + 1,
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

export { GET };
