import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { updateMRMatchScore, OptimisticLockError } from "@/lib/optimistic-locking";
import { sanitizeInput } from "@/lib/sanitize";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; matchId: string }> }
) {
  try {
    const { matchId } = await params;

    const match = await prisma.mRMatch.findUnique({
      where: { id: matchId },
      include: { player1: true, player2: true },
    });

    if (!match) {
      return NextResponse.json(
        { error: "Match not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(match);
  } catch (error) {
    console.error("Failed to fetch match:", error);
    return NextResponse.json(
      { error: "Failed to fetch match" },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; matchId: string }> }
) {
  try {
    const { matchId } = await params;
    const body = sanitizeInput(await request.json());
    
    const { score1, score2, completed, rounds, version } = body;

    if (score1 === undefined || score2 === undefined) {
      return NextResponse.json(
        { success: false, error: "score1 and score2 are required" },
        { status: 400 }
      );
    }

    if (typeof version !== 'number') {
      return NextResponse.json(
        { success: false, error: "version is required and must be a number" },
        { status: 400 }
      );
    }

    const result = await updateMRMatchScore(
      prisma,
      matchId,
      version,
      score1,
      score2,
      completed,
      rounds
    );

    const updatedMatch = await prisma.mRMatch.findUnique({
      where: { id: matchId },
      include: { player1: true, player2: true },
    });

    return NextResponse.json({
      success: true,
      data: updatedMatch,
      version: result.version
    });
  } catch (error) {
    console.error("Failed to update match:", error);
    
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
