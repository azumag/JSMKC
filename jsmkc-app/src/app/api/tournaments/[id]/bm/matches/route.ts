import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { paginate } from "@/lib/pagination";

// GET battle mode matches for polling
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: tournamentId } = await params;
    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token');

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

    const { searchParams } = new URL(request.url);
    const page = Number(searchParams.get('page')) || 1;
    const limit = Number(searchParams.get('limit')) || 50;

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
    console.error("Failed to fetch BM matches:", error);
    return NextResponse.json(
      { error: "Failed to fetch battle mode matches" },
      { status: 500 }
    );
  }
}