import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { updateGPMatchScore, OptimisticLockError } from "@/lib/optimistic-locking";
import { createLogger } from "@/lib/logger";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; matchId: string }> }
) {
  const logger = createLogger('gp-match-api');
  const { matchId } = await params;
  try {

    const match = await prisma.gPMatch.findUnique({
      where: { id: matchId },
      include: { player1: true, player2: true },
    });

    if (!match) {
      return NextResponse.json({ success: false, error: "Match not found" }, { status: 404 });
    }

    return NextResponse.json(match);
  } catch (error) {
    // Use structured logging for error tracking and debugging
    logger.error("Failed to fetch GP match", { error, matchId });
    return NextResponse.json(
      { success: false, error: "Failed to fetch grand prix match" },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; matchId: string }> }
) {
  const logger = createLogger('gp-match-api');
  const { matchId } = await params;
  try {
    const body = await request.json();
    
    const { points1, points2, completed, races, version } = body;

    if (points1 === undefined || points2 === undefined) {
      return NextResponse.json(
        { success: false, error: "points1 and points2 are required" },
        { status: 400 }
      );
    }

    if (typeof version !== 'number') {
      return NextResponse.json(
        { success: false, error: "version is required and must be a number" },
        { status: 400 }
      );
    }

    const result = await updateGPMatchScore(
      prisma,
      matchId,
      version,
      points1,
      points2,
      completed,
      races
    );

    const updatedMatch = await prisma.gPMatch.findUnique({
      where: { id: matchId },
      include: { player1: true, player2: true },
    });

    return NextResponse.json({
      success: true,
      data: updatedMatch,
      version: result.version
    });
  } catch (error) {
    // Use structured logging for error tracking and debugging
    logger.error("Failed to update match", { error, matchId });
    
    if (error instanceof OptimisticLockError) {
      return NextResponse.json(
        { 
          success: false, 
          error: "Version conflict",
          message: "The match was modified by another user. Please refresh and try again.",
          currentVersion: error.currentVersion
        },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { success: false, error: "Failed to update match" },
      { status: 500 }
    );
  }
}
