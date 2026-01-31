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

import { createStandingsHandlers } from '@/lib/api-factories/standings-route';

const { GET } = createStandingsHandlers({
  loggerName: 'mr-standings-api',
  errorMessage: 'Failed to fetch MR standings',
  qualificationModel: 'mRQualification',
  usePagination: false,
  orderBy: [{ score: 'desc' }, { points: 'desc' }],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  transformQualification: (q: any, index: number) => ({
    rank: index + 1,
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

export { GET };
