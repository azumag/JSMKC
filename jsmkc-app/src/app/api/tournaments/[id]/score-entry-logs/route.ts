import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { createLogger } from "@/lib/logger";

/**
 * GET - Retrieve score entry logs for a tournament (admin only)
 * @param request - NextRequest object
 * @param params - Route parameters containing tournamentId
 * @returns Response with score entry logs
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const logger = createLogger('score-entry-logs-api');
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();

  // Admin check
  if (!session?.user || session.user.role !== 'admin') {
    return NextResponse.json(
      { error: 'Unauthorized: Admin access required' },
      { status: 403 }
    );
  }

  const { id: tournamentId } = await params;
  try {

    // Get score entry logs for this tournament
    const logs = await prisma.scoreEntryLog.findMany({
      where: {
        tournamentId,
      },
      include: {
        player: {
          select: {
            id: true,
            name: true,
            nickname: true,
          },
        },
      },
      orderBy: {
        timestamp: 'desc',
      },
    });

    // Group logs by match for better display
    const logsByMatch = logs.reduce((acc, log) => {
      if (!acc[log.matchId]) {
        acc[log.matchId] = [];
      }
      acc[log.matchId].push(log);
      return acc;
    }, {} as Record<string, typeof logs>);

    return NextResponse.json({
      tournamentId,
      logsByMatch,
      totalCount: logs.length,
    });
  } catch (error) {
    // Use structured logging for error tracking and debugging
    logger.error("Failed to fetch score entry logs", { error, tournamentId });
    return NextResponse.json(
      { error: "Failed to fetch score entry logs" },
      { status: 500 }
    );
  }
}
