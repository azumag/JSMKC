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
import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { createAuditLog, AUDIT_ACTIONS } from "@/lib/audit-log";
import { getServerSideIdentifier } from "@/lib/rate-limit";
import { sanitizeInput } from "@/lib/sanitize";
import { createLogger } from "@/lib/logger";
import { isValidTournamentSlug, normalizeTournamentSlug, resolveTournamentId } from "@/lib/tournament-identifier";
import {
  createSuccessResponse,
  createErrorResponse,
  handleAuthzError,
  handleValidationError,
} from "@/lib/error-handling";

/**
 * GET /api/tournaments/:id
 *
 * Retrieves a single tournament by ID with its BM qualification standings
 * and BM match records.
 * - Admin users can access all tournaments (public and private).
 * - Non-admin users can only access tournaments where isPublic === true.
 *
 * The response includes:
 *   - Core tournament fields (name, date, status, isPublic)
 *   - bmQualifications: Player standings per group, sorted by group then score
 *   - bmMatches: All BM matches with both player details, sorted by match number
 *
 * Response:
 *   200 - Tournament object with relations
 *   403 - Tournament is private and requester is not admin
 *   404 - Tournament not found
 *   500 - Server error
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Logger created inside function for proper test mocking support
  const logger = createLogger('tournament-api');
  const { id: identifier } = await params;
  const resolvedId = await resolveTournamentId(identifier);

  try {
    const { searchParams } = new URL(request.url);

    /*
     * ?fields=summary returns only core tournament metadata (no relations).
     * Used by the tournament layout which only needs name/date/status.
     * This is much lighter than the full query with BM qualifications/matches,
     * reducing Workers CPU/memory pressure and eliminating most 1101 crashes.
     */
    const isSummary = searchParams.get('fields') === 'summary';

    const tournament = await prisma.tournament.findUnique({
      where: { id: resolvedId },
      select: isSummary
        ? {
            id: true,
            slug: true,
            name: true,
            date: true,
            status: true,
            publicModes: true,
            frozenStages: true,
            qualificationConfirmed: true,
            createdAt: true,
            updatedAt: true,
          }
        : {
            id: true,
            slug: true,
            name: true,
            date: true,
            status: true,
            publicModes: true,
            frozenStages: true,
            qualificationConfirmed: true,
            createdAt: true,
            updatedAt: true,
            bmQualifications: {
              include: { player: true },
              orderBy: [{ group: "asc" }, { score: "desc" }],
            },
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
      return createErrorResponse("Tournament not found", 404);
    }

    // Visibility check based on publicModes (not isPublic).
    // Admin users can see all modes regardless of publicModes setting.
    const session = await auth();
    const isAdmin = session?.user?.role === 'admin';

    // Non-admin: check if at least one mode is public
    const publicModes = tournament.publicModes as string[] || [];
    if (!isAdmin && publicModes.length === 0) {
      return handleAuthzError("This tournament has no visible modes");
    }

    return createSuccessResponse(tournament);
  } catch (error) {
    // Log with tournament ID for easy filtering in log aggregation
    logger.error("Failed to fetch tournament", { error, id: resolvedId });
    return createErrorResponse("Failed to fetch tournament", 500);
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
    return handleAuthzError();
  }

  const { id } = await params;
  const resolvedId = await resolveTournamentId(id);

  try {
    // Sanitize input to prevent XSS/injection attacks
    const body = sanitizeInput(await request.json());
    const { name, date, status, frozenStages, taPlayerSelfEdit, qualificationConfirmed, publicModes } = body;
    const slug = normalizeTournamentSlug(body.slug);

    if (slug !== undefined && slug !== null && !isValidTournamentSlug(slug)) {
      return handleValidationError("Slug must contain only lowercase letters, numbers, and hyphens", "slug");
    }

    // Validate frozenStages if provided: only "qualification" is supported.
    // Phase freeze was removed because phase operations are admin-only.
    const VALID_FROZEN_STAGES = ["qualification"];
    if (frozenStages !== undefined) {
      if (
        !Array.isArray(frozenStages) ||
        !frozenStages.every(
          (s: unknown) => typeof s === "string" && VALID_FROZEN_STAGES.includes(s)
        )
      ) {
        return handleValidationError("frozenStages must be an array of valid stage names");
      }
    }

    // Validate publicModes: must be an array of valid mode names.
    const VALID_MODES = ["ta", "bm", "mr", "gp"];
    if (publicModes !== undefined) {
      if (
        !Array.isArray(publicModes) ||
        !publicModes.every(
          (m: unknown) => typeof m === "string" && VALID_MODES.includes(m)
        )
      ) {
        return handleValidationError("publicModes must be an array of valid mode names (ta, bm, mr, gp)", "publicModes");
      }
    }

    // Use spread conditionals to only update fields that were provided.
    // This prevents accidentally nullifying fields that weren't included
    // in the request body.
    const tournament = await prisma.tournament.update({
      where: { id: resolvedId },
      data: {
        ...(name && { name }),
        ...(slug !== undefined && { slug }),
        ...(date && { date: new Date(date) }),
        ...(status && { status }),
        ...(frozenStages !== undefined && { frozenStages }),
        ...(taPlayerSelfEdit !== undefined && { taPlayerSelfEdit: taPlayerSelfEdit === true }),
        ...(qualificationConfirmed !== undefined && {
          qualificationConfirmed: qualificationConfirmed === true,
          qualificationConfirmedAt: qualificationConfirmed ? new Date() : null,
        }),
        ...(publicModes !== undefined && { publicModes }),
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
        targetId: resolvedId,
        targetType: 'Tournament',
        details: {
          name,
          slug,
          date,
          status,
          frozenStages,
          qualificationConfirmed,
          publicModes,
        },
      });
    } catch (logError) {
      // Audit log failure is non-critical but logged for security tracking
      logger.warn('Failed to create audit log', {
        error: logError,
        id: resolvedId,
        action: 'UPDATE_TOURNAMENT',
      });
    }

    return createSuccessResponse(tournament);
  } catch (error: unknown) {
    // Log error with tournament ID for debugging
    logger.error("Failed to update tournament", { error, id: resolvedId });

    // P2025: Record not found - tournament ID doesn't exist
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "P2025"
    ) {
      return createErrorResponse("Tournament not found", 404);
    }

    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "P2002"
    ) {
      return createErrorResponse("Tournament slug already exists", 409, "CONFLICT");
    }

    return createErrorResponse("Failed to update tournament", 500);
  }
}

/**
 * DELETE /api/tournaments/:id
 *
 * Deletes a tournament. Requires admin authentication.
 * Only draft tournaments can be deleted; active/completed tournaments are locked.
 *
 * Response:
 *   200 - { success: true, message: "..." }
 *   403 - Not authorized (non-admin)
 *   404 - Tournament not found
 *   409 - Tournament has already started
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
    return handleAuthzError();
  }

  const { id } = await params;
  const resolvedId = await resolveTournamentId(id);

  try {
    const deleteResult = await prisma.tournament.deleteMany({
      where: { id: resolvedId, status: "draft" },
    });

    if (deleteResult.count === 0) {
      const tournament = await prisma.tournament.findUnique({
        where: { id: resolvedId },
        select: { status: true },
      });

      if (!tournament) {
        return createErrorResponse("Tournament not found", 404);
      }

      return createErrorResponse(
        "Started tournaments cannot be deleted",
        409,
        "CONFLICT"
      );
    }

    // Audit log for the deletion - important for security tracking
    try {
      const ip = await getServerSideIdentifier();
      const userAgent = request.headers.get('user-agent') || 'unknown';
      await createAuditLog({
        userId: session.user.id,
        ipAddress: ip,
        userAgent,
        action: AUDIT_ACTIONS.DELETE_TOURNAMENT,
        targetId: resolvedId,
        targetType: 'Tournament',
        details: {
          tournamentId: resolvedId,
        },
      });
    } catch (logError) {
      // Audit log failure is non-critical but logged for security tracking
      logger.warn('Failed to create audit log', {
        error: logError,
        id: resolvedId,
        action: 'DELETE_TOURNAMENT',
      });
    }

    return createSuccessResponse({ message: "Tournament deleted successfully" });
  } catch (error: unknown) {
    // Log error with tournament ID for debugging
    logger.error("Failed to delete tournament", { error, id: resolvedId });

    // P2025: Record not found - retained for defensive compatibility.
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "P2025"
    ) {
      return createErrorResponse("Tournament not found", 404);
    }

    return createErrorResponse("Failed to delete tournament", 500);
  }
}
