/**
 * Battle Mode Matches Polling API Route
 *
 * Provides a token-authenticated endpoint for fetching BM match data.
 * This is used by the participant view for real-time polling of match status.
 * Unlike the main BM route, this uses tournament token authentication instead
 * of session-based auth, allowing non-authenticated players to view match data.
 *
 * The endpoint supports pagination to handle tournaments with many matches.
 *
 * Authentication: Tournament token (query parameter)
 * Pagination: page & limit query parameters
 */

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { paginate } from "@/lib/pagination";
import { createLogger } from "@/lib/logger";

/**
 * GET /api/tournaments/[id]/bm/matches
 *
 * Fetch paginated BM matches for a tournament, authenticated via tournament token.
 * Used by the participant-facing polling system to keep match data up-to-date.
 *
 * Query parameters:
 * - token (required): Tournament access token for authentication
 * - page (optional):  Page number, defaults to 1
 * - limit (optional): Items per page, defaults to 50
 *
 * Returns paginated match data including player information.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  /* Logger must be created inside the function for proper test mocking */
  const logger = createLogger('bm-matches-api');
  const { id: tournamentId } = await params;

  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token');
    const page = Number(searchParams.get('page')) || 1;
    const limit = Number(searchParams.get('limit')) || 50;

    /* Token is mandatory for this endpoint - it's the participant access mechanism */
    if (!token) {
      return NextResponse.json(
        { error: "Token required" },
        { status: 401 }
      );
    }

    /*
     * Validate the tournament token against the database.
     * The token must match the tournament AND must not have expired.
     * This provides time-limited access for tournament participants.
     */
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

    /*
     * Use the paginate utility to fetch matches with consistent pagination.
     * Matches are ordered by matchNumber ascending to maintain display order.
     */
    const result = await paginate(
      {
        findMany: prisma.bMMatch.findMany,
        count: prisma.bMMatch.count,
      },
      { tournamentId },
      { matchNumber: "asc" },
      { page, limit }
    );

    return NextResponse.json(result);
  } catch (error) {
    /* Structured logging captures error details for server-side debugging */
    logger.error("Failed to fetch BM matches", { error, tournamentId });
    return NextResponse.json(
      { error: "Failed to fetch battle mode matches" },
      { status: 500 }
    );
  }
}
