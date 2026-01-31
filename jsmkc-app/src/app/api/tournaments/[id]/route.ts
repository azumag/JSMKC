/**
 * Tournament Detail API Route
 *
 * GET    /api/tournaments/:id - Retrieve tournament with related match data (public)
 * PUT    /api/tournaments/:id - Update tournament metadata (admin only)
 * DELETE /api/tournaments/:id - Delete a tournament (admin only)
 *
 * The GET endpoint returns the full tournament record including:
 *   - Battle Mode qualifications (grouped by group, sorted by score)
 *   - Battle Mode matches (with player details, sorted by match number)
 *
 * This is the primary endpoint for the tournament detail page.
 * Additional match types (MR, GP, TA) are loaded via their own endpoints.
 */
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { createAuditLog, AUDIT_ACTIONS } from "@/lib/audit-log";
import { getServerSideIdentifier } from "@/lib/rate-limit";
import { sanitizeInput } from "@/lib/sanitize";
import { createLogger } from "@/lib/logger";

/**
 * GET /api/tournaments/:id
 *
 * Retrieves a single tournament by ID with its BM qualification standings
 * and BM match records. This is publicly accessible because tournament
 * results are viewable by anyone.
 *
 * The response includes:
 *   - Core tournament fields (name, date, status, token info)
 *   - bmQualifications: Player standings per group, sorted by group then score
 *   - bmMatches: All BM matches with both player details, sorted by match number
 *
 * Response:
 *   200 - Tournament object with relations
 *   404 - Tournament not found
 *   500 - Server error
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Logger created inside function for proper test mocking support
  const logger = createLogger('tournament-api');
  const { id } = await params;

  try {
    // Fetch tournament with BM-related data eagerly loaded.
    // Using select instead of include to control exactly which fields
    // are returned, avoiding accidental exposure of sensitive data.
    const tournament = await prisma.tournament.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        date: true,
        status: true,
        token: true,
        tokenExpiresAt: true,
        createdAt: true,
        updatedAt: true,
        // BM qualification standings: sorted by group (A, B, ...) then by score descending
        bmQualifications: {
          include: { player: true },
          orderBy: [{ group: "asc" }, { score: "desc" }],
        },
        // BM matches: include both players for display, sorted chronologically
        bmMatches: {
          include: {
            player1: true,
            player2: true,
          },
          orderBy: { matchNumber: "asc" },
        },
      },
    });

    if (!tournament) {
      return NextResponse.json(
        { error: "Tournament not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(tournament);
  } catch (error) {
    // Log with tournament ID for easy filtering in log aggregation
    logger.error("Failed to fetch tournament", { error, id });
    return NextResponse.json(
      { error: "Failed to fetch tournament" },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/tournaments/:id
 *
 * Updates tournament metadata (name, date, status). Requires admin authentication.
 * Only provided fields are updated; omitted fields remain unchanged.
 *
 * Request body (all optional):
 *   - name   (string) - Tournament name
 *   - date   (string) - Tournament date in ISO format
 *   - status (string) - Tournament status (draft, active, completed, etc.)
 *
 * Response:
 *   200 - Updated tournament object
 *   403 - Not authorized (non-admin)
 *   404 - Tournament not found (Prisma P2025)
 *   500 - Server error
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Logger created inside function for proper test mocking support
  const logger = createLogger('tournament-api');

  // Admin authentication check
  const session = await auth();
  if (!session?.user || session.user.role !== 'admin') {
    return NextResponse.json(
      { success: false, error: 'Unauthorized: Admin access required' },
      { status: 403 }
    );
  }

  const { id } = await params;

  try {
    // Sanitize input to prevent XSS/injection attacks
    const body = sanitizeInput(await request.json());
    const { name, date, status } = body;

    // Use spread conditionals to only update fields that were provided.
    // This prevents accidentally nullifying fields that weren't included
    // in the request body.
    const tournament = await prisma.tournament.update({
      where: { id },
      data: {
        ...(name && { name }),
        ...(date && { date: new Date(date) }),
        ...(status && { status }),
      },
    });

    // Audit log for the update operation
    try {
      const ip = await getServerSideIdentifier();
      const userAgent = request.headers.get('user-agent') || 'unknown';
      await createAuditLog({
        userId: session.user.id,
        ipAddress: ip,
        userAgent,
        action: AUDIT_ACTIONS.UPDATE_TOURNAMENT,
        targetId: id,
        targetType: 'Tournament',
        details: {
          name,
          date,
          status,
        },
      });
    } catch (logError) {
      // Audit log failure is non-critical but logged for security tracking
      logger.warn('Failed to create audit log', {
        error: logError,
        id,
        action: 'UPDATE_TOURNAMENT',
      });
    }

    return NextResponse.json(tournament);
  } catch (error: unknown) {
    // Log error with tournament ID for debugging
    logger.error("Failed to update tournament", { error, id });

    // P2025: Record not found - tournament ID doesn't exist
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "P2025"
    ) {
      return NextResponse.json(
        { error: "Tournament not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { error: "Failed to update tournament" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/tournaments/:id
 *
 * Deletes a tournament. Requires admin authentication.
 *
 * Response:
 *   200 - { success: true, message: "..." }
 *   403 - Not authorized (non-admin)
 *   404 - Tournament not found (Prisma P2025)
 *   500 - Server error
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Logger created inside function for proper test mocking support
  const logger = createLogger('tournament-api');

  // Admin authentication check
  const session = await auth();
  if (!session?.user || session.user.role !== 'admin') {
    return NextResponse.json(
      { success: false, error: 'Unauthorized: Admin access required' },
      { status: 403 }
    );
  }

  const { id } = await params;

  try {
    // Delete the tournament record from the database
    await prisma.tournament.delete({
      where: { id }
    });

    // Audit log for the deletion - important for security tracking
    try {
      const ip = await getServerSideIdentifier();
      const userAgent = request.headers.get('user-agent') || 'unknown';
      await createAuditLog({
        userId: session.user.id,
        ipAddress: ip,
        userAgent,
        action: AUDIT_ACTIONS.DELETE_TOURNAMENT,
        targetId: id,
        targetType: 'Tournament',
        details: {
          tournamentId: id,
        },
      });
    } catch (logError) {
      // Audit log failure is non-critical but logged for security tracking
      logger.warn('Failed to create audit log', {
        error: logError,
        id,
        action: 'DELETE_TOURNAMENT',
      });
    }

    return NextResponse.json({
      success: true,
      message: "Tournament deleted successfully",
    });
  } catch (error: unknown) {
    // Log error with tournament ID for debugging
    logger.error("Failed to delete tournament", { error, id });

    // P2025: Record not found - cannot delete a non-existent tournament
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "P2025"
    ) {
      return NextResponse.json(
        { error: "Tournament not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { error: "Failed to delete tournament" },
      { status: 500 }
    );
  }
}
