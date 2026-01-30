/**
 * Tournament Token Extension API Route
 *
 * POST /api/tournaments/:id/token/extend
 *
 * Extends the expiration time of an existing tournament token without
 * changing the token value itself. This is useful when a tournament
 * runs longer than expected and players need continued access.
 *
 * Unlike token regeneration, extension preserves the current token value
 * so existing player sessions remain valid.
 *
 * Access: Authenticated users only (any role)
 * Rate-limited: Uses the 'tokenValidation' bucket
 *
 * Request body:
 *   - extensionHours (number, optional, default: 24) - Hours to add (1-168)
 *
 * Response:
 *   Success: { success: true, data: { newExpiryDate, extensionHours, timeRemaining } }
 *   Failure: { success: false, error: "..." }
 */
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { createAuditLog } from "@/lib/audit-log";
import { extendTokenExpiry, getTokenTimeRemaining } from "@/lib/token-utils";
import { checkRateLimit, getServerSideIdentifier } from "@/lib/rate-limit";
import { sanitizeInput } from "@/lib/sanitize";
import { createLogger } from "@/lib/logger";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Logger created inside function for proper test mocking support
  const logger = createLogger('token-extend-api');

  // Authentication check: any authenticated user can extend tokens
  const session = await auth();
  const { id } = await params;
  const { extensionHours = 24 } = sanitizeInput(await request.json());

  if (!session?.user) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 401 }
    );
  }

  // Rate limiting: prevent abuse of the token extension endpoint.
  // Uses the 'tokenValidation' bucket shared with other token operations.
  const identifier = await getServerSideIdentifier();
  const rateLimitResult = await checkRateLimit('tokenValidation', identifier);

  if (!rateLimitResult.success) {
    // Return 429 with standard rate limit headers for client backoff
    return NextResponse.json(
      {
        success: false,
        error: 'Too many requests. Please try again later.',
        retryAfter: rateLimitResult.retryAfter
      },
      {
        status: 429,
        headers: {
          'X-RateLimit-Limit': (rateLimitResult.limit ?? 0).toString(),
          'X-RateLimit-Remaining': (rateLimitResult.remaining ?? 0).toString(),
          'X-RateLimit-Reset': (rateLimitResult.reset ?? 0).toString(),
        }
      }
    );
  }

  try {
    // Validate the extension window.
    // Minimum: 1 hour (prevent meaningless extensions)
    // Maximum: 168 hours (7 days, prevent indefinite extensions)
    if (extensionHours < 1 || extensionHours > 168) {
      return NextResponse.json(
        { success: false, error: 'Extension hours must be between 1 and 168' },
        { status: 400 }
      );
    }

    // Fetch the current tournament to check token existence and get current expiry
    const currentTournament = await prisma.tournament.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        token: true,
        tokenExpiresAt: true,
      },
    });

    if (!currentTournament) {
      return NextResponse.json(
        { success: false, error: "Tournament not found" },
        { status: 404 }
      );
    }

    // Cannot extend a token that doesn't exist yet.
    // Admin should use the regenerate endpoint to create one first.
    if (!currentTournament.token) {
      return NextResponse.json(
        { success: false, error: "No token exists for this tournament" },
        { status: 400 }
      );
    }

    // Calculate the new expiry by adding extensionHours to the current expiry.
    // If the token is already expired, the extension is calculated from the
    // current time (handled by the extendTokenExpiry utility).
    const newExpiry = extendTokenExpiry(currentTournament.tokenExpiresAt, extensionHours);

    // Update only the expiry timestamp; the token value remains unchanged
    // so existing player sessions continue to work.
    const tournament = await prisma.tournament.update({
      where: { id },
      data: {
        tokenExpiresAt: newExpiry,
      },
      select: {
        id: true,
        name: true,
        tokenExpiresAt: true,
      },
    });

    // Create audit log for the extension operation.
    // Records both the old and new expiry times for accountability.
    try {
      const ip = await getServerSideIdentifier();
      const userAgent = request.headers.get('user-agent') || 'unknown';
      await createAuditLog({
        userId: session.user.id,
        ipAddress: ip,
        userAgent,
        action: 'EXTEND_TOKEN',
        targetId: id,
        targetType: 'Tournament',
        details: {
          extensionHours,
          oldExpiry: currentTournament.tokenExpiresAt?.toISOString(),
          newExpiry: newExpiry.toISOString(),
          timeRemaining: getTokenTimeRemaining(newExpiry),
        },
      });
    } catch (logError) {
      // Audit log failures are non-critical; the extension was already applied
      logger.warn('Failed to create audit log', {
        error: logError,
        tournamentId: id,
        action: 'extend_token',
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        newExpiryDate: tournament.tokenExpiresAt,
        extensionHours,
        timeRemaining: getTokenTimeRemaining(tournament.tokenExpiresAt),
      },
    });
  } catch (error: unknown) {
    // Log error with full context for debugging
    logger.error("Failed to extend token", {
      error,
      tournamentId: id,
      extensionHours,
    });

    // P2025: Tournament not found (should be caught above, but as a safety net)
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
      { success: false, error: "Failed to extend token" },
      { status: 500 }
    );
  }
}
