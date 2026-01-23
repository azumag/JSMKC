import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { auth } from "@/lib/auth";

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
  const session = await auth();

  // Admin check
  if (!session?.user || session.user.role !== 'admin') {
    return NextResponse.json(
      { error: 'Unauthorized: Admin access required' },
      { status: 403 }
    );
  }

  try {
    const { id: tournamentId } = await params;

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
    console.error("Failed to fetch score entry logs:", error);
    return NextResponse.json(
      { error: "Failed to fetch score entry logs" },
      { status: 500 }
    );
  }
}
