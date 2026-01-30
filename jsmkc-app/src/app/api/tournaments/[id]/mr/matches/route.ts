/**
 * Match Race Matches Polling API Route
 *
 * Provides paginated access to MR matches for participant polling.
 * Uses tournament token authentication (not OAuth) so participants
 * can access match data without admin credentials.
 *
 * This endpoint is polled by the participant score entry page
 * to keep match states up-to-date in real time.
 */

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { paginate } from "@/lib/pagination";
import { createLogger } from "@/lib/logger";

/**
 * GET /api/tournaments/[id]/mr/matches
 *
 * Fetch paginated MR matches with tournament token validation.
 * Supports polling from participant pages.
 *
 * Query params:
 * - token: Tournament access token (required)
 * - page: Page number (default 1)
 * - limit: Items per page (default 50)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  /* Logger must be created inside the function for proper test mocking */
  const logger = createLogger('mr-matches-api');
  const { id: tournamentId } = await params;
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token');
    const page = Number(searchParams.get('page')) || 1;
    const limit = Number(searchParams.get('limit')) || 50;

    /* Token is required for participant access */
    if (!token) {
      return NextResponse.json(
        { error: "Token required" },
        { status: 401 }
      );
    }

    /* Validate the tournament token hasn't expired */
    const tokenValidation = await prisma.tournament.findFirst({
      where: {
        id: tournamentId,
        token,
        tokenExpiresAt: { gt: new Date() }
      }
    });

    if (!tokenValidation) {
      return NextResponse.json(
        { error: "Invalid or expired token" },
        { status: 401 }
      );
    }

    /* Return paginated match list ordered by match number */
    const result = await paginate(
      {
        findMany: prisma.mRMatch.findMany,
        count: prisma.mRMatch.count,
      },
      { tournamentId },
      { matchNumber: "asc" },
      { page, limit }
    );

    return NextResponse.json(result);
  } catch (error) {
    logger.error("Failed to fetch MR matches", { error, tournamentId });
    return NextResponse.json(
      { error: "Failed to fetch match race matches" },
      { status: 500 }
    );
  }
}
