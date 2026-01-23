import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { get, set, isExpired, generateETag } from "@/lib/standings-cache";
import { createLogger } from "@/lib/logger";

// Initialize logger for structured logging
const logger = createLogger('ta-standings-api');

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

    const entries = await prisma.tTEntry.findMany({
      where: { tournamentId },
      include: { player: true },
      orderBy: { rank: 'asc' },
    });

    const etag = generateETag(entries);
    const lastUpdated = new Date().toISOString();

    await set(tournamentId, 'qualification', entries, etag);

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
        formattedTime: e.totalTime ? `${Math.floor(e.totalTime / 60000)}:${((e.totalTime % 60000) / 1000).toFixed(0).padStart(2, '0')}` : '-',
        lives: e.lives,
        eliminated: e.eliminated,
      })),
    });

    return response;
  } catch (error) {
    // Use structured logging for error tracking and debugging
    logger.error("Failed to fetch TA standings", { error, tournamentId });
    return NextResponse.json(
      { error: "Failed to fetch TA standings" },
      { status: 500 }
    );
  }
}
