import { NextRequest, NextResponse } from "next/server";
import { validateTournamentToken } from "@/lib/token-validation";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: tournamentId } = await params;
    
    // Validate tournament token
    const validation = await validateTournamentToken(request, tournamentId);
    
    if (!validation.tournament) {
      return NextResponse.json(
        { success: false, error: validation.error || 'Invalid or expired tournament token' },
        { status: 401 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        tournamentId: validation.tournament.id,
        tournamentName: validation.tournament.name,
        tokenValid: true,
      },
    });
  } catch (error) {
    console.error("Token validation error:", error);
    return NextResponse.json(
      { success: false, error: "Token validation failed" },
      { status: 500 }
    );
  }
}