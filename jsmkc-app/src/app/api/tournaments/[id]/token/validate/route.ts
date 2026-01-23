import { NextRequest, NextResponse } from "next/server";
import { validateTournamentToken } from "@/lib/token-validation";
import { createLogger } from "@/lib/logger";

// Create logger for token validation API module
// Using structured logging to provide consistent error tracking and debugging capabilities
// The logger provides proper log levels (error, warn, info, debug) and includes service name context
const logger = createLogger('token-validate-api');

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
    // Log error with structured metadata for better debugging and monitoring
    // The error object is passed as metadata to maintain error stack traces
    logger.error("Token validation error", { error, tournamentId: (await params).id });
    return NextResponse.json(
      { success: false, error: "Token validation failed" },
      { status: 500 }
    );
  }
}