import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

// GET match race matches for polling
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: tournamentId } = await params;
    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token');

    // Validate token if provided
    if (token) {
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
    }

    const matches = await prisma.mRMatch.findMany({
      where: { tournamentId },
      include: { 
        player1: true, 
        player2: true
      },
      orderBy: { matchNumber: "asc" },
    });

    return NextResponse.json({ matches });
  } catch (error) {
    console.error("Failed to fetch MR matches:", error);
    return NextResponse.json(
      { error: "Failed to fetch match race matches" },
      { status: 500 }
    );
  }
}