/**
 * Tournament Token Validation API Route
 *
 * POST /api/tournaments/:id/token/validate
 *
 * Validates a tournament access token submitted by a player.
 * This is the entry point for token-based authentication, which allows
 * players to submit scores without requiring OAuth sign-in.
 *
 * Flow:
 *   1. Player receives a tournament token from the admin
 *   2. Player submits the token via this endpoint
 *   3. If valid and not expired, the player can enter scores
 *
 * The token is validated against the tournament's stored token and
 * checked for expiration. The actual validation logic is delegated
 * to the validateTournamentToken() utility function.
 *
 * Access: Public (no authentication required - this IS the authentication step)
 *
 * Response:
 *   Success: { success: true, data: { tournamentId, tournamentName, tokenValid: true } }
 *   Failure: { success: false, error: "..." } (HTTP 401)
 */
import { NextRequest, NextResponse } from "next/server";
import { validateTournamentToken } from "@/lib/token-validation";
import { createLogger } from "@/lib/logger";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Logger created inside function for proper test mocking support
  const logger = createLogger('token-validate-api');

  try {
    const { id: tournamentId } = await params;

    // Delegate to the shared token validation utility.
    // This function checks the request for a token (in headers or body),
    // looks up the tournament, and verifies the token matches and hasn't expired.
    const validation = await validateTournamentToken(request, tournamentId);

    if (!validation.tournament) {
      // Token is invalid, expired, or tournament not found.
      // Return 401 to indicate authentication failure.
      return NextResponse.json(
        { success: false, error: validation.error || 'Invalid or expired tournament token' },
        { status: 401 }
      );
    }

    // Token is valid - return tournament identification data
    return NextResponse.json({
      success: true,
      data: {
        tournamentId: validation.tournament.id,
        tournamentName: validation.tournament.name,
        tokenValid: true,
      },
    });
  } catch (error) {
    // Log error with tournament ID for debugging token validation issues
    logger.error("Token validation error", {
      error,
      tournamentId: (await params).id,
    });
    return NextResponse.json(
      { success: false, error: "Token validation failed" },
      { status: 500 }
    );
  }
}
