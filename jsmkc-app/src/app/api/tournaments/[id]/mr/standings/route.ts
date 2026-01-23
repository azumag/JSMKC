import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { get, set, isExpired, generateETag } from "@/lib/standings-cache";
import { createLogger } from "@/lib/logger";

// Initialize logger for structured logging
const logger = createLogger('mr-standings-api');

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();

  if (!session?.user || session.user.role !== 'admin') {
    return NextResponse.json(
      { error: 'Unauthorized: Admin access required' },
      { status: 403 }
    );
  }

  const { id: tournamentId } = await params;
  try {
    const ifNoneMatch = request.headers.get('if-none-match');

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

    const qualifications = await prisma.mRQualification.findMany({
      where: { tournamentId },
      include: { player: true },
      orderBy: [
        { score: 'desc' },
        { points: 'desc' },
      ],
    });

    const etag = generateETag(qualifications);
    const lastUpdated = new Date().toISOString();

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
    // Use structured logging for error tracking and debugging
    logger.error("Failed to fetch MR standings", { error, tournamentId });
    return NextResponse.json(
      { error: "Failed to fetch MR standings" },
      { status: 500 }
    );
  }
}
