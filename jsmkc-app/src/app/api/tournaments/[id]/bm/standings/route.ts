/**
 * Battle Mode Standings API Route
 *
 * Provides a cached, paginated view of BM qualification standings for admin users.
 * Uses server-side caching with ETag support to minimize database queries
 * and improve response times for frequently polled standings data.
 *
 * Caching strategy:
 * - Results are cached in memory with a configurable TTL
 * - ETags are generated from the response data for cache validation
 * - Clients can send If-None-Match: * to force a fresh fetch
 * - Cache-Control header set to 5 minutes for CDN/browser caching
 *
 * Authentication: Admin role required (403 for non-admin users)
 * Pagination: page & limit query parameters
 */

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { get, set, isExpired, generateETag } from "@/lib/standings-cache";
import { paginate } from "@/lib/pagination";
import { createLogger } from "@/lib/logger";

/**
 * GET /api/tournaments/[id]/bm/standings
 *
 * Fetch paginated BM qualification standings with caching.
 *
 * Query parameters:
 * - page (optional):  Page number, defaults to 1
 * - limit (optional): Items per page, defaults to 50
 *
 * Headers:
 * - If-None-Match: Send "*" to bypass cache and force fresh data
 *
 * Response includes:
 * - tournamentId, stage, lastUpdated metadata
 * - Paginated qualification data
 * - _cached flag when serving from cache
 * - ETag and Cache-Control headers
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  /* Logger must be created inside the function for proper test mocking */
  const logger = createLogger('bm-standings-api');
  const session = await auth();

  /* Standings are restricted to admin users to prevent data exposure */
  if (!session?.user || session.user.role !== 'admin') {
    return NextResponse.json(
      { error: 'Unauthorized: Admin access required' },
      { status: 403 }
    );
  }

  const { id: tournamentId } = await params;

  try {
    const ifNoneMatch = request.headers.get('if-none-match');
    const { searchParams } = new URL(request.url);
    const page = Number(searchParams.get('page')) || 1;
    const limit = Number(searchParams.get('limit')) || 50;

    /*
     * Check for cached standings data.
     * If cache exists, is not expired, and client hasn't sent If-None-Match: *,
     * return the cached version for faster response.
     */
    const cached = await get(tournamentId, 'qualification');

    if (cached && !isExpired(cached) && ifNoneMatch !== '*') {
      return NextResponse.json(
        { ...cached.data, _cached: true },
        {
          headers: {
            'ETag': cached.etag,
            'Cache-Control': 'public, max-age=300',
          },
        }
      );
    }

    /*
     * Cache miss or forced refresh - fetch fresh data from database.
     * Uses the paginate utility for consistent pagination behavior.
     */
    const result = await paginate(
      {
        findMany: prisma.bMQualification.findMany,
        count: prisma.bMQualification.count,
      },
      { tournamentId },
      {},
      { page, limit }
    );

    /* Generate ETag from the result data for future cache validation */
    const etag = generateETag(result.data);
    const lastUpdated = new Date().toISOString();

    /* Store in cache for subsequent requests */
    await set(tournamentId, 'qualification', result.data, etag);

    const response = NextResponse.json({
      tournamentId,
      stage: 'qualification',
      lastUpdated,
      ...result.data,
    });

    return response;
  } catch (error) {
    logger.error("Failed to fetch BM standings", { error, tournamentId });
    return NextResponse.json(
      { error: "Failed to fetch BM standings" },
      { status: 500 }
    );
  }
}
