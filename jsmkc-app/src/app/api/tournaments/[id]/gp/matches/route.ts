/**
 * Grand Prix Matches Polling API Route
 *
 * Provides paginated match data for participant score entry pages.
 * Requires tournament token authentication (no OAuth needed).
 * Used by the participant page to poll for match updates.
 *
 * - GET: Fetch paginated matches with token validation
 */

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { paginate } from "@/lib/pagination";
import { createLogger } from "@/lib/logger";

/**
 * GET /api/tournaments/[id]/gp/matches
 *
 * Fetch paginated GP matches for participant polling.
 * Requires a valid tournament token passed as query parameter.
 * Returns matches ordered by match number for consistent display.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const logger = createLogger('gp-matches-api');
  const { id: tournamentId } = await params;
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token');
    const page = Number(searchParams.get('page')) || 1;
    const limit = Number(searchParams.get('limit')) || 50;

    /* Tournament token is required for participant access */
    if (!token) {
      return NextResponse.json(
        { error: "Token required" },
        { status: 401 }
      );
    }

    /* Validate token against tournament record and check expiry */
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

    /* Use pagination helper for consistent paginated responses */
    const result = await paginate(
      {
        findMany: prisma.gPMatch.findMany,
        count: prisma.gPMatch.count,
      },
      { tournamentId },
      { matchNumber: "asc" },
      { page, limit }
    );

    return NextResponse.json(result);
  } catch (error) {
    logger.error("Failed to fetch GP matches", { error, tournamentId });
    return NextResponse.json(
      { error: "Failed to fetch grand prix matches" },
      { status: 500 }
    );
  }
}
