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
import { computeQualificationRanks } from '@/lib/server-ranking';

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
         * Compute server-side ranks (1224 + H2H + rankOverride) using the shared
         * helper so that both standings and qualification routes produce identical
         * _rank values.
         */
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let allH2hMatches: any[] = [];
        if (config.matchModel) {
          const scoreFields = config.matchScoreFields ?? { p1: 'score1', p2: 'score2' };
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const mModel = (p: any) => p[config.matchModel!];

          /* Quick preview to find tied players without full H2H processing */
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const preview: any[] = [];
          for (let i = 0; i < qualifications.length; i++) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const q = qualifications[i] as any;
            if (i === 0) preview.push({ ...q, _rank: 1 });
            else {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const prev = qualifications[i - 1] as any;
              const isTied = (config.orderBy ?? []).every((ob) => {
                const field = Object.keys(ob)[0];
                return q[field] === prev[field];
              });
              preview.push({ ...q, _rank: isTied ? preview[i - 1]._rank : i + 1 });
            }
          }

          const tiedPlayerIds = preview
            .filter((e, i, arr) => arr.some((other, j) => j !== i && other._rank === e._rank))
            .map((e: { playerId: string }) => e.playerId);

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
        }

        const withOverrides = computeQualificationRanks(
          qualifications,
          config.orderBy ?? [],
          allH2hMatches,
          { matchScoreFields: config.matchScoreFields },
        );

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
