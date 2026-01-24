import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { get, set, isExpired, generateETag } from "@/lib/standings-cache";
import { paginate } from "@/lib/pagination";
import { createLogger } from "@/lib/logger";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const logger = createLogger('bm-standings-api');
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

    const { searchParams } = new URL(request.url);
    const page = Number(searchParams.get('page')) || 1;
    const limit = Number(searchParams.get('limit')) || 50;

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

    const result = await paginate(
      {
        findMany: prisma.bMQualification.findMany,
        count: prisma.bMQualification.count,
      },
      { tournamentId },
      {},
      { page, limit }
    );

    const etag = generateETag(result.data);
    const lastUpdated = new Date().toISOString();

    await set(tournamentId, 'qualification', result.data, etag);

    const response = NextResponse.json({
      tournamentId,
      stage: 'qualification',
      lastUpdated,
      ...result.data,
    });

    return response;
  } catch (error) {
    // Use structured logging for error tracking and debugging
    logger.error("Failed to fetch BM standings", { error, tournamentId });
    return NextResponse.json(
      { error: "Failed to fetch BM standings" },
      { status: 500 }
    );
  }
}
