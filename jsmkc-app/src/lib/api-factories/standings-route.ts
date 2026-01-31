/**
 * Standings Route Factory
 *
 * Generates GET handlers for standings API routes.
 * Takes a StandingsConfig and returns a GET handler that uses the
 * config's model names, pagination mode, and transform functions.
 *
 * Supports two fetch patterns:
 * - Paginated (BM): Uses paginate() utility with page/limit query params
 * - Direct (MR/GP): Uses findMany with player include and transform mapping
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
  /** Order by for the findMany query (only used when usePagination=false) */
  orderBy?: Array<Record<string, 'asc' | 'desc'>>;
  /** Transform function for mapping qualification records to response shape (only used when usePagination=false) */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  transformQualification?: (q: any, index: number) => Record<string, unknown>;
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
    const session = await auth();

    if (!session?.user || session.user.role !== 'admin') {
      return NextResponse.json(
        { error: 'Unauthorized: Admin access required' },
        { status: 403 },
      );
    }

    const { id: tournamentId } = await params;

    try {
      const ifNoneMatch = request.headers.get('if-none-match');

      /* Check cache for existing standings data */
      const cached = await get(tournamentId, 'qualification');

      if (cached && !isExpired(cached) && ifNoneMatch !== '*') {
        return NextResponse.json(
          { ...cached.data, _cached: true },
          {
            headers: {
              'ETag': cached.etag,
              'Cache-Control': 'public, max-age=300',
            },
          },
        );
      }

      if (config.usePagination) {
        /* Paginated path (BM): reads page/limit from query params */
        const { searchParams } = new URL(request.url);
        const page = Number(searchParams.get('page')) || 1;
        const limit = Number(searchParams.get('limit')) || 50;

        const result = await paginate(
          {
            findMany: qualModel(prisma).findMany.bind(qualModel(prisma)),
            count: qualModel(prisma).count.bind(qualModel(prisma)),
          },
          { tournamentId },
          {},
          { page, limit },
        );

        const etag = generateETag(result.data);
        const lastUpdated = new Date().toISOString();

        await set(tournamentId, 'qualification', result.data, etag);

        return NextResponse.json({
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

        const transformed = config.transformQualification
          ? qualifications.map(config.transformQualification)
          : qualifications;

        return NextResponse.json({
          tournamentId,
          stage: 'qualification',
          lastUpdated,
          qualifications: transformed,
        });
      }
    } catch (error) {
      logger.error(config.errorMessage, { error, tournamentId });
      return NextResponse.json(
        { error: config.errorMessage },
        { status: 500 },
      );
    }
  }

  return { GET };
}
