/**
 * TA Standings API Route
 *
 * Provides cached standings data for the Time Attack qualification stage.
 * This endpoint is admin-only and implements ETag-based caching to reduce
 * database load for frequently polled standings pages.
 *
 * Features:
 * - Admin-only access (requires authenticated session with admin role)
 * - In-memory cache with 5-minute TTL
 * - ETag support for conditional requests
 * - Formatted time display in response
 *
 * CRITICAL: Logger is created INSIDE the handler function (not at module level)
 * to ensure proper test mocking per the project's mock architecture pattern.
 */

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { get, set, isExpired, generateETag } from "@/lib/standings-cache";
import { createLogger } from "@/lib/logger";

/**
 * GET /api/tournaments/[id]/ta/standings
 *
 * Fetch cached TA standings for admin viewing.
 * Returns player rankings with formatted time strings.
 *
 * Cache behavior:
 * - Returns cached data if available and not expired
 * - Generates fresh data from database on cache miss
 * - Stores new ETag for future conditional requests
 *
 * Response includes:
 * - tournamentId, stage, lastUpdated timestamp
 * - Array of entries with rank, player info, formatted times, lives, elimination status
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Logger created inside function for proper test mocking
  const logger = createLogger('ta-standings-api');

  // Admin-only access check
  const session = await auth();
  if (!session?.user || session.user.role !== 'admin') {
    return NextResponse.json(
      { success: false, error: 'Unauthorized: Admin access required' },
      { status: 403 }
    );
  }

  const { id: tournamentId } = await params;
  try {
    // Check for conditional request header (ETag-based)
    const ifNoneMatch = request.headers.get('if-none-match');

    // Attempt to serve from cache for performance
    const cached = await get(tournamentId, 'qualification');

    if (cached && !isExpired(cached) && ifNoneMatch !== '*') {
      // Return cached data with cache indicator flag
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

    // Cache miss or expired: fetch fresh data from database
    const entries = await prisma.tTEntry.findMany({
      where: { tournamentId },
      include: { player: true },
      orderBy: { rank: 'asc' },
    });

    // Generate ETag from entry data for cache validation
    const etag = generateETag(entries);
    const lastUpdated = new Date().toISOString();

    // Store in cache for future requests
    await set(tournamentId, 'qualification', entries, etag);

    // Build response with formatted time strings for display
    const response = NextResponse.json({
      tournamentId,
      stage: 'qualification',
      lastUpdated,
      entries: entries.map((e) => ({
        rank: e.rank || '-',
        playerId: e.playerId,
        playerName: e.player.name,
        playerNickname: e.player.nickname,
        totalTime: e.totalTime,
        // Format total time as M:SS for display (simplified format without ms).
        // Use Math.floor (not toFixed/rounding) to avoid 59.999s displaying as "60" seconds.
        formattedTime: e.totalTime != null ? `${Math.floor(e.totalTime / 60000)}:${Math.floor((e.totalTime % 60000) / 1000).toString().padStart(2, '0')}` : '-',
        /** Total qualification points from per-course scoring system */
        qualificationPoints: e.qualificationPoints,
        lives: e.lives,
        eliminated: e.eliminated,
      })),
    });

    return response;
  } catch (error) {
    // Use structured logging for error tracking and debugging
    logger.error("Failed to fetch TA standings", { error, tournamentId });
    return NextResponse.json(
      { success: false, error: "Failed to fetch TA standings" },
      { status: 500 }
    );
  }
}
