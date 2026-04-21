/**
 * Standings Route Factory
 *
 * Generates GET handlers for standings API routes.
 * Takes a StandingsConfig and returns a GET handler that uses the
 * config's model names, pagination mode, and transform functions.
 *
 * Supports two fetch patterns:
 * - Paginated: Uses paginate() utility with page/limit query params (no H2H support)
 * - Direct (BM/MR/GP): Uses findMany with player include, H2H tiebreaker, and transform mapping
 *
 * All routes share identical auth, caching, and error handling logic.
 * This eliminates ~200 lines of duplicated code across BM, MR, and GP standings.
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { get, set, isExpired, generateETag } from '@/lib/standings-cache';
import { paginate } from '@/lib/pagination';
import { createLogger } from '@/lib/logger';
import { createErrorResponse, createSuccessResponse } from '@/lib/error-handling';
import { resolveTournamentId } from '@/lib/tournament-identifier';

/**
 * Configuration for a standings route handler.
 *
 * Captures the differences between BM, MR, and GP standings endpoints
 * so the factory can produce correct behavior for each event type.
 */
export interface StandingsConfig {
  /** Logger instance name (e.g., 'bm-standings-api') */
  loggerName: string;
  /** Error message for catch block (e.g., 'Failed to fetch BM standings') */
  errorMessage: string;
  /** Prisma model name for qualification records (e.g., 'bMQualification') */
  qualificationModel: string;
  /** If true, use paginate() for fetching (BM pattern). If false, use findMany with transform. */
  usePagination: boolean;
  /**
   * Order by for the findMany query (only used when usePagination=false).
   * Each element is a Prisma-style sort object with one field key; other keys are absent.
   * Using Partial allows single-key objects like { score: 'desc' } without type errors.
   */
  orderBy?: Array<Partial<Record<string, 'asc' | 'desc'>>>;
  /** Transform function for mapping qualification records to response shape (only used when usePagination=false) */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  transformQualification?: (q: any, index: number) => Record<string, unknown>;
  /**
   * Prisma model name for match records, used for H2H tiebreaking (requirements §4.1 step 3).
   * Only applies to the non-paginated path (usePagination=false).
   * When set, tied players are re-sorted by their direct match results within the tied group.
   */
  matchModel?: string;
  /**
   * Score field names on the match model used to determine H2H winner.
   * Defaults to { p1: 'score1', p2: 'score2' } (BM/MR convention).
   * Set to { p1: 'points1', p2: 'points2' } for GP.
   */
  matchScoreFields?: { p1: string; p2: string };
}

/**
 * Create standings route handlers from a standings configuration.
 *
 * @param config - Standings configuration for the event type
 * @returns Object with GET handler function
 */
export function createStandingsHandlers(config: StandingsConfig) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const qualModel = (p: any) => p[config.qualificationModel];

  /**
   * GET handler: Fetch qualification standings with ETag-based caching.
   *
   * Auth: Admin role required (403 for non-admin)
   * Caching: In-memory cache with 5-minute TTL, ETag support
   * Bypass: Send If-None-Match: * to force fresh data
   */
  async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
  ) {
    const logger = createLogger(config.loggerName);

    /* Admin-only access. Mirrors the explicit gate in the TA standings route
     * (src/app/api/tournaments/[id]/ta/standings/route.ts:49-53) — the
     * factory previously documented "Admin role required" without enforcing
     * it, leaving BM/MR/GP standings publicly readable. */
    const session = await auth();
    if (!session?.user || session.user.role !== 'admin') {
      return createErrorResponse('Forbidden', 403, 'FORBIDDEN');
    }

    const { id } = await params;
    const tournamentId = await resolveTournamentId(id);

    try {
      const ifNoneMatch = request.headers.get('if-none-match');

      /* Check cache for existing standings data */
      const cached = await get(tournamentId, 'qualification');

      if (cached && !isExpired(cached) && ifNoneMatch !== '*') {
        const response = createSuccessResponse({ ...cached.data, _cached: true });
        response.headers.set('ETag', cached.etag);
        response.headers.set('Cache-Control', 'public, max-age=300');
        return response;
      }

      if (config.usePagination) {
        /* Paginated path (BM): reads page/limit from query params */
        const { searchParams } = new URL(request.url);
        const page = Number(searchParams.get('page')) || 1;
        const limit = Number(searchParams.get('limit')) || 50;

        /*
         * Merge orderBy array into a single object for the paginate() signature.
         * Prisma accepts both { a: 'asc', b: 'desc' } and [{ a: 'asc' }, { b: 'desc' }].
         * Since paginate() expects Record<string, unknown>, we merge the array into one object.
         * Fields are distinct (group / score / points), so no key collision occurs.
         */
        const orderByForPaginate = (config.orderBy ?? []).reduce<Record<string, unknown>>(
          (acc, ob) => ({ ...acc, ...ob }),
          {}
        );

        const result = await paginate(
          {
            findMany: qualModel(prisma).findMany.bind(qualModel(prisma)),
            count: qualModel(prisma).count.bind(qualModel(prisma)),
          },
          { tournamentId },
          orderByForPaginate,
          { page, limit },
        );

        const etag = generateETag(result.data);
        const lastUpdated = new Date().toISOString();

        await set(tournamentId, 'qualification', result.data, etag);

        return createSuccessResponse({
          tournamentId,
          stage: 'qualification',
          lastUpdated,
          ...result.data,
        });
      } else {
        /* Direct path (MR/GP): findMany with player include and transform */
        const qualifications = await qualModel(prisma).findMany({
          where: { tournamentId },
          include: { player: true },
          orderBy: config.orderBy,
        });

        const etag = generateETag(qualifications);
        const lastUpdated = new Date().toISOString();

        await set(tournamentId, 'qualification', qualifications, etag);

        /*
         * Pre-compute tie-aware ranks (standard competition / 1224 ranking).
         * Two entries share a rank when all their orderBy field values are equal.
         * Inject the computed rank as `_rank` on each record before transforming so
         * that transform functions can use `q._rank` instead of (errorprone) `index + 1`.
         *
         * Uses an imperative loop (not Array.map) so that the previous entry's rank
         * is available when computing the current entry's rank.
         */
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const ranked: any[] = [];
        for (let i = 0; i < qualifications.length; i++) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const q = qualifications[i] as any;
          if (i === 0) {
            ranked.push({ ...q, _rank: 1 });
          } else {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const prev = qualifications[i - 1] as any;
            const isTied = (config.orderBy ?? []).every((ob) => {
              const field = Object.keys(ob)[0];
              return q[field] === prev[field];
            });
            ranked.push({ ...q, _rank: isTied ? ranked[i - 1]._rank : i + 1 });
          }
        }

        /*
         * H2H tiebreaker: re-sort tied groups by direct match results (requirements §4.1 step 3).
         * Only runs when matchModel is configured. Players tied after points + wins/losses
         * are re-sorted by how many H2H matches they won within the tied group.
         * Players from different groups (who never played each other) stay tied → admin resolves via sudden death.
         */
        if (config.matchModel) {
          const scoreFields = config.matchScoreFields ?? { p1: 'score1', p2: 'score2' };
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const mModel = (p: any) => p[config.matchModel!];

          /* Group entries by _rank to find tied sets */
          const rankGroups = new Map<number, typeof ranked>();
          for (const entry of ranked) {
            const g = rankGroups.get(entry._rank) ?? [];
            g.push(entry);
            rankGroups.set(entry._rank, g);
          }

          /*
           * Batch H2H query: fetch ALL completed qualification matches between
           * ALL tied players in a single query, then filter in-memory per group.
           * This eliminates the N+1 problem where each tied group issued its own
           * database query (10 groups = 10 round-trips × ~40ms = ~400ms overhead).
           */
          const tiedPlayerIds = Array.from(rankGroups.values())
            .filter((g) => g.length >= 2)
            .flat()
            .map((e: { playerId: string }) => e.playerId);

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          let allH2hMatches: any[] = [];
          if (tiedPlayerIds.length >= 2) {
            allH2hMatches = await mModel(prisma).findMany({
              where: {
                tournamentId,
                stage: 'qualification',
                completed: true,
                isBye: false, // Exclude BYE matches from H2H calculation
                player1Id: { in: tiedPlayerIds },
                player2Id: { in: tiedPlayerIds },
              },
              select: {
                player1Id: true,
                player2Id: true,
                [scoreFields.p1]: true,
                [scoreFields.p2]: true,
              },
            });
          }

          const resolved: typeof ranked = [];
          for (const [rank, group] of [...rankGroups.entries()].sort(([a], [b]) => a - b)) {
            if (group.length < 2) {
              resolved.push(...group);
              continue;
            }

            /*
             * Filter pre-fetched matches to only those between players in this tied group.
             * Cross-group players won't have matches against each other, so their H2H wins = 0
             * and they remain tied (requiring admin sudden-death to resolve per §4.1 step 4).
             */
            const playerIds = group.map((e: { playerId: string }) => e.playerId);
            const playerIdSet = new Set(playerIds);
            const h2hMatches = allH2hMatches.filter(
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (m: any) => playerIdSet.has(m.player1Id) && playerIdSet.has(m.player2Id),
            );

            /* Tally H2H wins; draws (s1 === s2) award no win to either player */
            const h2hWins = new Map<string, number>(playerIds.map((id) => [id, 0]));
            for (const m of h2hMatches) {
              const s1: number = m[scoreFields.p1];
              const s2: number = m[scoreFields.p2];
              if (s1 > s2) h2hWins.set(m.player1Id, (h2hWins.get(m.player1Id) ?? 0) + 1);
              else if (s2 > s1) h2hWins.set(m.player2Id, (h2hWins.get(m.player2Id) ?? 0) + 1);
            }

            /* Sort by H2H wins desc; preserve original order on equal wins (stable JS sort) */
            const sortedGroup = [...group].sort(
              (a, b) => (h2hWins.get(b.playerId) ?? 0) - (h2hWins.get(a.playerId) ?? 0),
            );

            /* Re-assign _rank within the group using 1224 competition ranking */
            let subRank = rank;
            for (let i = 0; i < sortedGroup.length; i++) {
              if (i > 0) {
                const prevWins = h2hWins.get(sortedGroup[i - 1].playerId) ?? 0;
                const curWins = h2hWins.get(sortedGroup[i].playerId) ?? 0;
                if (curWins !== prevWins) subRank = rank + i;
              }
              resolved.push({ ...sortedGroup[i], _rank: subRank });
            }
          }

          ranked.splice(0, ranked.length, ...resolved);
        }

        /*
         * Apply rankOverride: if a qualification entry has a manual rank set by an admin,
         * replace the computed _rank with the override value and mark _rankOverridden=true.
         * Override takes precedence over H2H tiebreaker (admins have final authority).
         * Re-sort by effective rank so the response is in display order.
         *
         * This is applied last (after H2H) so that manual overrides always win,
         * regardless of what the automatic tiebreaker would compute.
         */
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const withOverrides = ranked.map((entry: any) =>
          entry.rankOverride != null
            ? { ...entry, _rank: entry.rankOverride, _rankOverridden: true }
            : entry,
        );
        /*
         * Sort by effective rank ascending. When two entries have the same rank
         * (e.g. an overridden entry lands at the same rank as an auto-computed entry),
         * place overridden entries first to express admin authority.
         */
        withOverrides.sort((a: { _rank: number; _rankOverridden?: boolean }, b: { _rank: number; _rankOverridden?: boolean }) => {
          if (a._rank !== b._rank) return a._rank - b._rank;
          // Overridden entries win ties (true > false → bOverridden - aOverridden puts b first if b is overridden)
          return (b._rankOverridden ? 1 : 0) - (a._rankOverridden ? 1 : 0);
        });

        const transformed = config.transformQualification
          ? withOverrides.map(config.transformQualification)
          : withOverrides;

        return createSuccessResponse({
          tournamentId,
          stage: 'qualification',
          lastUpdated,
          qualifications: transformed,
        });
      }
    } catch (error) {
      logger.error(config.errorMessage, { error, tournamentId });
      return createErrorResponse(config.errorMessage, 500, 'INTERNAL_ERROR');
    }
  }

  return { GET };
}
