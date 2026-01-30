/**
 * Match Race Standings API Route
 *
 * Provides MR qualification standings with ETag-based caching.
 * Uses the standings cache for efficient polling - clients can send
 * If-None-Match headers to avoid redundant data transfers.
 *
 * Authentication: Admin role required
 */

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { get, set, isExpired, generateETag } from "@/lib/standings-cache";
import { createLogger } from "@/lib/logger";

/**
 * GET /api/tournaments/[id]/mr/standings
 *
 * Fetch MR qualification standings with cache support.
 * Returns standings sorted by score, then point differential.
 *
 * Headers:
 * - ETag: Version identifier for cache validation
 * - Cache-Control: 5 minute public cache
 *
 * Client can send If-None-Match to check for updates.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  /* Logger must be created inside the function for proper test mocking */
  const logger = createLogger('mr-standings-api');
  const session = await auth();

  /* Admin authentication required for standings access */
  if (!session?.user || session.user.role !== 'admin') {
    return NextResponse.json(
      { error: 'Unauthorized: Admin access required' },
      { status: 403 }
    );
  }

  const { id: tournamentId } = await params;
  try {
    const ifNoneMatch = request.headers.get('if-none-match');

    /* Check cache first for efficient polling */
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

    /* Cache miss or expired: fetch fresh data from database */
    const qualifications = await prisma.mRQualification.findMany({
      where: { tournamentId },
      include: { player: true },
      orderBy: [
        { score: 'desc' },
        { points: 'desc' },
      ],
    });

    /* Generate ETag from the data for cache validation */
    const etag = generateETag(qualifications);
    const lastUpdated = new Date().toISOString();

    /* Store in cache for future requests */
    await set(tournamentId, 'qualification', qualifications, etag);

    const response = NextResponse.json({
      tournamentId,
      stage: 'qualification',
      lastUpdated,
      qualifications: qualifications.map((q, index) => ({
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
      })),
    });

    return response;
  } catch (error) {
    logger.error("Failed to fetch MR standings", { error, tournamentId });
    return NextResponse.json(
      { error: "Failed to fetch MR standings" },
      { status: 500 }
    );
  }
}
