/**
 * Score Entry Logs API Route
 *
 * GET /api/tournaments/:id/score-entry-logs
 *
 * Retrieves the audit trail of all score entries for a specific tournament.
 * This endpoint provides administrators with a detailed log of who entered
 * scores, when they were entered, and for which matches.
 *
 * Logs are grouped by match ID for easier review, allowing admins to see
 * the full history of score changes for each individual match.
 *
 * Access: Admin only
 *
 * Response:
 *   {
 *     tournamentId: string,
 *     logsByMatch: Record<string, ScoreEntryLog[]>,
 *     totalCount: number
 *   }
 */
import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { createLogger } from "@/lib/logger";
import {
  createSuccessResponse,
  createErrorResponse,
  handleAuthzError,
} from "@/lib/error-handling";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Logger created inside function for proper test mocking support
  const logger = createLogger('score-entry-logs-api');

  // Admin authentication: score entry logs contain sensitive operational
  // data that should only be visible to tournament administrators
  const session = await auth();
  if (!session?.user || session.user.role !== 'admin') {
    return handleAuthzError('Unauthorized: Admin access required');
  }

  const { id: tournamentId } = await params;

  try {
    // Fetch all score entry logs for this tournament.
    // Include player details (id, name, nickname) for display purposes.
    // Ordered by timestamp descending so most recent entries appear first.
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

    // Group logs by matchId for hierarchical display.
    // This allows the admin UI to show all score changes for a specific
    // match together, making it easy to spot anomalies or disputes.
    const logsByMatch = logs.reduce((acc, log) => {
      if (!acc[log.matchId]) {
        acc[log.matchId] = [];
      }
      acc[log.matchId].push(log);
      return acc;
    }, {} as Record<string, typeof logs>);

    return createSuccessResponse({
      tournamentId,
      logsByMatch,
      totalCount: logs.length,
    });
  } catch (error) {
    // Log error with tournament ID for debugging
    logger.error("Failed to fetch score entry logs", { error, tournamentId });
    return createErrorResponse("Failed to fetch score entry logs", 500);
  }
}
