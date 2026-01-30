/**
 * Grand Prix Standings API Route
 *
 * Provides cached qualification standings with ETag support.
 * Uses the standings cache system for efficient polling.
 * Admin-only access (returns 403 for non-admin users).
 *
 * - GET: Fetch standings with ETag caching
 */

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { get, set, isExpired, generateETag } from "@/lib/standings-cache";
import { createLogger } from "@/lib/logger";

/**
 * GET /api/tournaments/[id]/gp/standings
 *
 * Fetch GP qualification standings with ETag caching.
 * Returns cached data when available and not expired.
 * Standings are sorted by score (wins*2+ties) then driver points.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const logger = createLogger('gp-standings-api');
  const session = await auth();

  /* Admin-only access for standings API */
  if (!session?.user || session.user.role !== 'admin') {
    return NextResponse.json(
      { error: 'Unauthorized: Admin access required' },
      { status: 403 }
    );
  }

  const { id: tournamentId } = await params;
  try {
    const ifNoneMatch = request.headers.get('if-none-match');

    /* Check cache for existing standings data */
    const cached = await get(tournamentId, 'qualification');

    /* Return cached data if valid and client doesn't force refresh */
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

    /* Fetch fresh standings from database */
    const qualifications = await prisma.gPQualification.findMany({
      where: { tournamentId },
      include: { player: true },
      orderBy: [
        { score: 'desc' },
        { points: 'desc' },
      ],
    });

    /* Generate ETag from data for cache invalidation */
    const etag = generateETag(qualifications);
    const lastUpdated = new Date().toISOString();

    /* Store in cache for subsequent requests */
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
    logger.error("Failed to fetch GP standings", { error, tournamentId });
    return NextResponse.json(
      { error: "Failed to fetch GP standings" },
      { status: 500 }
    );
  }
}
