import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { createAuditLog } from "@/lib/audit-log";
import { extendTokenExpiry, getTokenTimeRemaining } from "@/lib/token-utils";
import { checkRateLimit, getServerSideIdentifier } from "@/lib/rate-limit";
import { sanitizeInput } from "@/lib/sanitize";
import { createLogger } from "@/lib/logger";

// Create logger for token extend API module
// Using structured logging to provide consistent error tracking and debugging capabilities
// The logger provides proper log levels (error, warn, info, debug) and includes service name context
const logger = createLogger('token-extend-api');

// POST - Extend tournament token expiry
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  const { id } = await params;
  const { extensionHours = 24 } = sanitizeInput(await request.json());
  
  if (!session?.user) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 401 }
    );
  }

  // Apply rate limiting for token validation
  const identifier = await getServerSideIdentifier();
  const rateLimitResult = await checkRateLimit('tokenValidation', identifier);
  
  if (!rateLimitResult.success) {
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
    // Validate input
    if (extensionHours < 1 || extensionHours > 168) { // Max 7 days
      return NextResponse.json(
        { success: false, error: 'Extension hours must be between1 and 168' },
        { status: 400 }
      );
    }

    // Get current tournament data
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

    if (!currentTournament.token) {
      return NextResponse.json(
        { success: false, error: "No token exists for this tournament" },
        { status: 400 }
      );
    }

    // Calculate new expiry time
    const newExpiry = extendTokenExpiry(currentTournament.tokenExpiresAt, extensionHours);

    // Update tournament with extended expiry
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

    // Create audit log
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
      // Log audit log failures with error context for monitoring
      // Audit log failures shouldn't prevent the main operation from completing
      logger.warn('Failed to create audit log', { error: logError, tournamentId: id, action: 'extend_token' });
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
    // Log error with structured metadata for better debugging and monitoring
    // The error object is passed as metadata to maintain error stack traces
    logger.error("Failed to extend token", { error, tournamentId: id, extensionHours });
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
