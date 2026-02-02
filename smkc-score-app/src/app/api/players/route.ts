/**
 * Players Collection API Route
 *
 * GET  /api/players  - List all players (public, paginated)
 * POST /api/players  - Create a new player (admin only)
 *
 * Player creation flow:
 *   1. Admin submits name, nickname, and optional country
 *   2. A secure random password is generated for the player
 *   3. The password is hashed and stored; the plaintext is returned once
 *   4. An audit log entry is created for accountability
 *
 * The plaintext password is returned only in the POST response and is never
 * stored or retrievable again. Admins must share it with the player immediately.
 */
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { sanitizeInput } from "@/lib/sanitize";
import { auth } from "@/lib/auth";
import { generateSecurePassword, hashPassword } from "@/lib/password-utils";
import { createAuditLog, AUDIT_ACTIONS } from "@/lib/audit-log";
import { getServerSideIdentifier } from "@/lib/rate-limit";
import { paginate } from "@/lib/pagination";
import { createLogger } from "@/lib/logger";

/**
 * GET /api/players
 *
 * Returns a paginated list of all active (non-deleted) players,
 * sorted alphabetically by nickname.
 *
 * Query parameters:
 *   - page  (number, default: 1)  - Page number for pagination
 *   - limit (number, default: 50) - Number of results per page
 *
 * Response: Paginated result from the paginate() utility including
 * data array, total count, page info, etc.
 */
export async function GET(request: NextRequest) {
  // Logger created inside function for proper test mocking support
  const logger = createLogger('players-api');

  try {
    // Extract pagination parameters from query string with sensible defaults.
    // limit is capped by the paginate() utility to prevent excessive queries.
    const { searchParams } = new URL(request.url);
    const page = Number(searchParams.get('page')) || 1;
    const limit = Number(searchParams.get('limit')) || 50;

    // Use the paginate utility to handle offset calculation and total count.
    // Sort: alphabetical by nickname for consistent ordering.
    const result = await paginate(
      {
        findMany: prisma.player.findMany,
        count: prisma.player.count,
      },
      {},
      { nickname: "asc" },
      { page, limit }
    );

    return NextResponse.json(result);
  } catch (error) {
    // Log with structured metadata so error details appear in monitoring dashboards.
    // The error object preserves the original stack trace for debugging.
    logger.error("Failed to fetch players", { error });
    return NextResponse.json(
      { error: "Failed to fetch players" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/players
 *
 * Creates a new player record. Requires admin authentication.
 *
 * Request body:
 *   - name     (string, required) - Player's full name
 *   - nickname (string, required) - Unique display name used in tournaments
 *   - country  (string, optional) - Player's country code
 *
 * Response (201):
 *   { player: {...}, temporaryPassword: "..." }
 *
 * Error responses:
 *   400 - Missing required fields (name or nickname)
 *   403 - Unauthorized (not admin)
 *   409 - Duplicate nickname (Prisma P2002 unique constraint violation)
 *   500 - Server error
 */
export async function POST(request: NextRequest) {
  // Logger created inside function for proper test mocking support
  const logger = createLogger('players-api');

  // Authentication check: only admins can create players.
  // This prevents unauthorized player registration.
  const session = await auth();
  if (!session?.user || session.user.role !== 'admin') {
    return NextResponse.json(
      { error: 'Unauthorized: Admin access required' },
      { status: 403 }
    );
  }

  try {
    // Sanitize all input fields to prevent XSS and injection attacks
    const body = sanitizeInput(await request.json());
    const { name, nickname, country } = body;

    // Validate required fields before database operations
    if (!name || !nickname) {
      return NextResponse.json(
        { error: "Name and nickname are required" },
        { status: 400 }
      );
    }

    // Generate a cryptographically secure random password (12 characters).
    // This password is hashed with bcrypt before storage.
    // The plaintext is returned only once in the response.
    const plainPassword = generateSecurePassword(12);
    const hashedPassword = await hashPassword(plainPassword);

    // Create the player record in the database
    const player = await prisma.player.create({
      data: {
        name,
        nickname,
        country: country || null,
        password: hashedPassword,
      },
    });

    // Create audit log entry for the player creation.
    // Audit logging is wrapped in try/catch so that failures in logging
    // do not prevent the main operation from succeeding.
    try {
      const ip = await getServerSideIdentifier();
      const userAgent = request.headers.get('user-agent') || 'unknown';
      await createAuditLog({
        userId: session.user.id,
        ipAddress: ip,
        userAgent,
        action: AUDIT_ACTIONS.CREATE_PLAYER,
        targetId: player.id,
        targetType: 'Player',
        details: { name, nickname, country, passwordGenerated: true },
      });
    } catch (logError) {
      // Audit log failures are non-critical: the player was already created
      // successfully. We log the failure for monitoring but do not roll back.
      logger.warn('Failed to create audit log', {
        error: logError,
        playerId: player.id,
        action: 'create_player',
      });
    }

    // Return the created player along with the one-time plaintext password.
    // The admin must communicate this password to the player immediately.
    return NextResponse.json({
      player,
      temporaryPassword: plainPassword,
    }, { status: 201 });
  } catch (error: unknown) {
    // Log error with structured metadata for monitoring and debugging
    logger.error("Failed to create player", { error });

    // Prisma error P2002 indicates a unique constraint violation.
    // For players, this means the nickname is already taken.
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "P2002"
    ) {
      return NextResponse.json(
        { error: "A player with this nickname already exists" },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { error: "Failed to create player" },
      { status: 500 }
    );
  }
}
