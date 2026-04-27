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
import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { createAuditLog, AUDIT_ACTIONS, resolveAuditUserId } from "@/lib/audit-log";
import { getServerSideIdentifier } from "@/lib/rate-limit";
import { sanitizeInput } from "@/lib/sanitize";
import { createLogger } from "@/lib/logger";
import { createSuccessResponse, createErrorResponse, handleValidationError, handleAuthzError } from "@/lib/error-handling";

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

    // Look up the player by primary key.
    // Password is globally omitted via PrismaClient config in lib/prisma.ts.
    const player = await prisma.player.findUnique({
      where: { id },
    });

    if (!player) {
      return createErrorResponse("Player not found", 404);
    }

    return createSuccessResponse(player);
  } catch (error) {
    // Await params again in catch block since it may not have been resolved
    // before the error occurred. This ensures we can log the player ID.
    const { id } = await params;
    logger.error("Failed to fetch player", { error, playerId: id });
    return createErrorResponse("Failed to fetch player", 500);
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

  // Resolve route params early so the id is available in the catch block
  const { id } = await params;

  try {
    // auth() inside try/catch to prevent unhandled errors on Workers
    const session = await auth();
    if (!session?.user || session.user.role !== 'admin') {
      return handleAuthzError();
    }

    // Sanitize input to prevent XSS and injection attacks
    const body = sanitizeInput(await request.json());
    const { name, nickname, country, noCamera } = body;

    // Validate required fields
    if (!name || !nickname) {
      return handleValidationError("Name and nickname are required");
    }

    // Update the player record in the database.
    // Omit password hash from the returned object.
    const player = await prisma.player.update({
      where: { id },
      data: {
        name,
        nickname,
        country: country || null,
        noCamera: noCamera === true,
      },
    });

    // Create audit log for the update operation.
    // Wrapped in try/catch so audit failures don't block the main response.
    try {
      const ip = await getServerSideIdentifier();
      const userAgent = request.headers.get('user-agent') || 'unknown';
      await createAuditLog({
        userId: resolveAuditUserId(session),
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

    return createSuccessResponse(player);
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
      return createErrorResponse("Player not found", 404);
    }

    // P2002: Unique constraint violation - nickname already taken by another player
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "P2002"
    ) {
      return createErrorResponse("A player with this nickname already exists", 409);
    }

    return createErrorResponse("Failed to update player", 500);
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

  // Resolve route params early so the id is available in the catch block
  const { id } = await params;

  try {
    // auth() inside try/catch to prevent unhandled errors on Workers
    const session = await auth();
    if (!session?.user || session.user.role !== 'admin') {
      return handleAuthzError();
    }

    /*
     * Guard: prevent deletion of players who are registered in any tournament.
     * Checks all 8 tournament-participation tables in parallel.
     *
     * Why each table is checked:
     * - BM/MR/GP Match tables: onDelete: Restrict — deletion would fail with a FK constraint
     *   error (confusing 500). Guard gives a clear 409 instead.
     * - Qualification tables (BM/MR/GP) and TTEntry/TournamentPlayerScore: onDelete: Cascade
     *   in the Prisma schema, so deletion would silently wipe historical tournament data.
     *   These are guarded by deliberate policy, not by FK enforcement.
     */
    const tournamentCounts = await Promise.all([
      prisma.bMQualification.count({ where: { playerId: id } }),
      prisma.bMMatch.count({ where: { OR: [{ player1Id: id }, { player2Id: id }] } }),
      prisma.mRQualification.count({ where: { playerId: id } }),
      prisma.mRMatch.count({ where: { OR: [{ player1Id: id }, { player2Id: id }] } }),
      prisma.gPQualification.count({ where: { playerId: id } }),
      prisma.gPMatch.count({ where: { OR: [{ player1Id: id }, { player2Id: id }] } }),
      prisma.tTEntry.count({ where: { playerId: id } }),
      prisma.tournamentPlayerScore.count({ where: { playerId: id } }),
    ]);

    if (tournamentCounts.some(count => count > 0)) {
      return createErrorResponse(
        "Cannot delete a player who is registered in a tournament",
        409
      );
    }

    /*
     * Delete non-cascading child records first.
     * Score entry logs and character usage rows reference Player without
     * onDelete: Cascade in the Prisma schema, so a reported player would
     * otherwise become undeletable.
     */
    await prisma.scoreEntryLog.deleteMany({
      where: { playerId: id },
    });

    await prisma.matchCharacterUsage.deleteMany({
      where: { playerId: id },
    });

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
        userId: resolveAuditUserId(session),
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

    return createSuccessResponse({
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
      return createErrorResponse("Player not found", 404);
    }

    return createErrorResponse("Failed to delete player", 500);
  }
}
