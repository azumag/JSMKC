/**
 * Player Detail API Route
 *
 * GET    /api/players/:id - Retrieve a single player (public)
 * PUT    /api/players/:id - Update a player (admin only)
 * DELETE /api/players/:id - Delete a player (admin only)
 *
 * All mutation operations (PUT, DELETE) require admin authentication and
 * create audit log entries for accountability.
 */
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { createAuditLog, AUDIT_ACTIONS } from "@/lib/audit-log";
import { getServerSideIdentifier } from "@/lib/rate-limit";
import { sanitizeInput } from "@/lib/sanitize";
import { createLogger } from "@/lib/logger";

/**
 * GET /api/players/:id
 *
 * Retrieves a single player by their unique ID. This endpoint is publicly
 * accessible because player information (name, nickname) is displayed in
 * tournament brackets and results.
 *
 * Response:
 *   200 - Player object
 *   404 - Player not found
 *   500 - Server error
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Logger created inside function for proper test mocking support
  const logger = createLogger('players-id-api');

  try {
    // Await params as required by Next.js App Router dynamic route convention
    const { id } = await params;

    // Look up the player by primary key
    const player = await prisma.player.findUnique({
      where: { id }
    });

    if (!player) {
      return NextResponse.json(
        { success: false, error: "Player not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(player);
  } catch (error) {
    // Await params again in catch block since it may not have been resolved
    // before the error occurred. This ensures we can log the player ID.
    const { id } = await params;
    logger.error("Failed to fetch player", { error, playerId: id });
    return NextResponse.json(
      { success: false, error: "Failed to fetch player" },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/players/:id
 *
 * Updates a player's profile information. Requires admin authentication.
 *
 * Request body:
 *   - name     (string, required) - Player's full name
 *   - nickname (string, required) - Unique display name
 *   - country  (string, optional) - Player's country code
 *
 * Response:
 *   200 - Updated player object
 *   400 - Missing required fields
 *   403 - Not authorized (non-admin)
 *   404 - Player not found (Prisma P2025)
 *   409 - Duplicate nickname (Prisma P2002)
 *   500 - Server error
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Logger created inside function for proper test mocking support
  const logger = createLogger('players-id-api');

  // Admin authentication check before any data access
  const session = await auth();
  const { id } = await params;

  if (!session?.user || session.user.role !== 'admin') {
    return NextResponse.json(
      { success: false, error: 'Unauthorized: Admin access required' },
      { status: 403 }
    );
  }

  try {
    // Re-await params for the id inside try block (mirrors original behavior).
    // This is safe because Promise.resolve on an already-resolved promise is instant.
    const { id } = await params;

    // Sanitize input to prevent XSS and injection attacks
    const body = sanitizeInput(await request.json());
    const { name, nickname, country } = body;

    // Validate required fields
    if (!name || !nickname) {
      return NextResponse.json(
        { success: false, error: "Name and nickname are required" },
        { status: 400 }
      );
    }

    // Update the player record in the database
    const player = await prisma.player.update({
      where: { id },
      data: {
        name,
        nickname,
        country: country || null,
      },
    });

    // Create audit log for the update operation.
    // Wrapped in try/catch so audit failures don't block the main response.
    try {
      const ip = await getServerSideIdentifier();
      const userAgent = request.headers.get('user-agent') || 'unknown';
      await createAuditLog({
        userId: session.user.id,
        ipAddress: ip,
        userAgent,
        action: AUDIT_ACTIONS.UPDATE_PLAYER,
        targetId: id,
        targetType: 'Player',
        details: {
          name,
          nickname,
          country,
        },
      });
    } catch (logError) {
      // Audit log failures are non-critical; log for monitoring but don't fail the request
      logger.warn('Failed to create audit log', {
        error: logError,
        playerId: id,
        action: 'update_player',
      });
    }

    return NextResponse.json(player);
  } catch (error: unknown) {
    // Log error with structured metadata for debugging
    logger.error("Failed to update player", { error, playerId: id });

    // P2025: Record not found - the player ID doesn't exist
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "P2025"
    ) {
      return NextResponse.json(
        { success: false, error: "Player not found" },
        { status: 404 }
      );
    }

    // P2002: Unique constraint violation - nickname already taken by another player
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "P2002"
    ) {
      return NextResponse.json(
        { success: false, error: "A player with this nickname already exists" },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { success: false, error: "Failed to update player" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/players/:id
 *
 * Deletes a player. Requires admin authentication.
 *
 * Response:
 *   200 - { success: true, message: "..." }
 *   403 - Not authorized (non-admin)
 *   404 - Player not found (Prisma P2025)
 *   500 - Server error
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Logger created inside function for proper test mocking support
  const logger = createLogger('players-id-api');

  // Admin authentication check before any data modification
  const session = await auth();
  const { id } = await params;

  if (!session?.user || session.user.role !== 'admin') {
    return NextResponse.json(
      { success: false, error: 'Unauthorized: Admin access required' },
      { status: 403 }
    );
  }

  try {
    // Re-await params inside try block (mirrors original behavior)
    const { id } = await params;

    // Delete the player record from the database
    await prisma.player.delete({
      where: { id }
    });

    // Create audit log for the deletion.
    // Important for security tracking: who deleted which player and when.
    try {
      const ip = await getServerSideIdentifier();
      const userAgent = request.headers.get('user-agent') || 'unknown';
      await createAuditLog({
        userId: session.user.id,
        ipAddress: ip,
        userAgent,
        action: AUDIT_ACTIONS.DELETE_PLAYER,
        targetId: id,
        targetType: 'Player',
        details: {
          playerId: id,
        },
      });
    } catch (logError) {
      // Audit log failures are non-critical; log for monitoring but don't fail the request
      logger.warn('Failed to create audit log', {
        error: logError,
        playerId: id,
        action: 'delete_player',
      });
    }

    return NextResponse.json({
      success: true,
      message: "Player deleted successfully",
    });
  } catch (error: unknown) {
    // Log error with structured metadata for debugging
    logger.error("Failed to delete player", { error, playerId: id });

    // P2025: Record not found - cannot delete a non-existent player
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "P2025"
    ) {
      return NextResponse.json(
        { success: false, error: "Player not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { success: false, error: "Failed to delete player" },
      { status: 500 }
    );
  }
}
