import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { get, set, isExpired, generateETag } from "@/lib/standings-cache";

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

  try {
    const { id: tournamentId } = await params;
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

    const qualifications = await prisma.gPQualification.findMany({
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
    console.error("Failed to fetch GP standings:", error);
    return NextResponse.json(
      { error: "Failed to fetch GP standings" },
      { status: 500 }
    );
  }
}
