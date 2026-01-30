/**
 * Tournament Token Regeneration API Route
 *
 * POST /api/tournaments/:id/token/regenerate
 *
 * Generates a new tournament access token, replacing any existing one.
 * This is used when:
 *   - Setting up a new tournament for score entry
 *   - The current token has been compromised
 *   - The admin wants to revoke all existing player access
 *
 * The new token is a cryptographically secure random string generated
 * by the generateTournamentToken() utility. Any players using the old
 * token will be immediately locked out.
 *
 * Access: Authenticated users only (any role)
 *
 * Request body:
 *   - expiresInHours (number, optional, default: 24) - Token lifetime (1-168 hours)
 *
 * Response:
 *   Success: { success: true, data: { token, expiresAt, expiresInHours } }
 *   Failure: { success: false, error: "..." }
 */
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { createAuditLog } from "@/lib/audit-log";
import { generateTournamentToken, getTokenExpiry } from "@/lib/token-utils";
import { getServerSideIdentifier } from "@/lib/rate-limit";
import { sanitizeInput } from "@/lib/sanitize";
import { createLogger } from "@/lib/logger";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Logger created inside function for proper test mocking support
  const logger = createLogger('token-regenerate-api');

  // Authentication check: any authenticated user can regenerate tokens.
  // In practice, only admins should have access to the UI that calls this endpoint.
  const session = await auth();
  const { id } = await params;
  const { expiresInHours = 24 } = sanitizeInput(await request.json());

  if (!session?.user) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 401 }
    );
  }

  try {
    // Validate the expiration window.
    // Minimum: 1 hour (prevent useless tokens)
    // Maximum: 168 hours (7 days, prevent permanent tokens)
    if (expiresInHours < 1 || expiresInHours > 168) {
      return NextResponse.json(
        { success: false, error: 'Token expiry must be between 1 and 168 hours' },
        { status: 400 }
      );
    }

    // Generate a new cryptographically secure token
    const newToken = generateTournamentToken();
    // Calculate the absolute expiration timestamp
    const newExpiry = getTokenExpiry(expiresInHours);

    // Update the tournament with the new token and expiration.
    // This atomically replaces any existing token, immediately
    // invalidating it for all current users.
    const tournament = await prisma.tournament.update({
      where: { id },
      data: {
        token: newToken,
        tokenExpiresAt: newExpiry,
      },
      select: {
        id: true,
        name: true,
        token: true,
        tokenExpiresAt: true,
      },
    });

    // Create audit log for token regeneration.
    // Only the first 8 characters of the token are logged for security;
    // the full token should never appear in logs.
    try {
      const ip = await getServerSideIdentifier();
      const userAgent = request.headers.get('user-agent') || 'unknown';
      await createAuditLog({
        userId: session.user.id,
        ipAddress: ip,
        userAgent,
        action: 'REGENERATE_TOKEN',
        targetId: id,
        targetType: 'Tournament',
        details: {
          newToken: newToken.substring(0, 8) + '...', // Partial token for security
          expiresInHours,
          newExpiry: newExpiry.toISOString(),
        },
      });
    } catch (logError) {
      // Audit log failures are non-critical; the token was already regenerated
      logger.warn('Failed to create audit log', {
        error: logError,
        tournamentId: id,
        action: 'regenerate_token',
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        token: tournament.token,
        expiresAt: tournament.tokenExpiresAt,
        expiresInHours,
      },
    });
  } catch (error: unknown) {
    // Log error with tournament ID and expiration for debugging
    logger.error("Failed to regenerate token", {
      error,
      tournamentId: id,
      expiresInHours,
    });

    // P2025: Tournament not found
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "P2025"
    ) {
      return NextResponse.json(
        { success: false, error: "Tournament not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { success: false, error: "Failed to regenerate token" },
      { status: 500 }
    );
  }
}
