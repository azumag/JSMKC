import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { paginate } from "@/lib/pagination";
import { createLogger } from "@/lib/logger";

// GET grand prix matches for polling
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

    if (!token) {
      return NextResponse.json(
        { error: "Token required" },
        { status: 401 }
      );
    }

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
    // Use structured logging for error tracking and debugging
    logger.error("Failed to fetch GP matches", { error, tournamentId });
    return NextResponse.json(
      { error: "Failed to fetch grand prix matches" },
      { status: 500 }
    );
  }
}