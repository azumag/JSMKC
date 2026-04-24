/**
 * Tournaments Collection API Route
 *
 * GET  /api/tournaments  - List all tournaments (public, paginated)
 * POST /api/tournaments  - Create a new tournament (admin only)
 *
 * Tournaments are the top-level organizational unit in the JSMKC system.
 * Each tournament contains matches across four competitive modes:
 * TA (Time Attack), BM (Battle Mode), MR (Match Race), and GP (Grand Prix).
 *
 * New tournaments are created in "draft" status and must be explicitly
 * activated before players can submit scores.
 */
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { createAuditLog, AUDIT_ACTIONS } from "@/lib/audit-log";
import { getServerSideIdentifier } from "@/lib/rate-limit";
import { sanitizeInput } from "@/lib/sanitize";
import { paginate } from "@/lib/pagination";
import { createLogger } from "@/lib/logger";
import { isValidTournamentSlug, normalizeTournamentSlug } from "@/lib/tournament-identifier";
import {
  createSuccessResponse,
  createErrorResponse,
  handleAuthzError,
  handleValidationError,
} from "@/lib/error-handling";

/**
 * GET /api/tournaments
 *
 * Returns a paginated list of all tournaments sorted by date descending.
 * Visibility filtering by mode (publicModes) is handled client-side.
 * Per-tournament access control is enforced in GET /api/tournaments/[id].
 *
 * Query parameters:
 *   - page  (number, default: 1)  - Page number for pagination
 *   - limit (number, default: 50) - Number of results per page
 *
 * Response: Paginated result including data array, total count, and page info.
 */
export async function GET(request: NextRequest) {
  // Logger created inside function for proper test mocking support
  const logger = createLogger('tournaments-api');

  try {
    // Extract pagination parameters with defaults
    const { searchParams } = new URL(request.url);
    const page = Number(searchParams.get('page')) || 1;
    const limit = Number(searchParams.get('limit')) || 50;

    // All tournaments are returned regardless of auth state.
    // Per-mode visibility (publicModes) is enforced client-side so non-admin
    // users only see modes listed in publicModes. Server-side filtering is
    // done per-tournament in GET /api/tournaments/[id].
    const where = {};

    // Use the paginate utility for consistent pagination behavior.
    // Sort: newest tournaments first for relevance.
    const result = await paginate(
      {
        findMany: prisma.tournament.findMany.bind(prisma.tournament),
        count: prisma.tournament.count,
      },
      where,
      { date: "desc" },
      { page, limit }
    );

    return createSuccessResponse(result);
  } catch (error) {
    // Log error with structured metadata for monitoring
    logger.error("Failed to fetch tournaments", { error });
    return createErrorResponse("Failed to fetch tournaments", 500);
  }
}

/**
 * POST /api/tournaments
 *
 * Creates a new tournament. Requires admin authentication.
 * New tournaments start in "draft" status.
 *
 * Request body:
 *   - name (string, required) - Tournament name (e.g., "JSMKC #42")
 *   - date (string, required) - Tournament date in ISO format
 *
 * Response (201): Created tournament object
 *
 * Error responses:
 *   400 - Missing required fields (name or date)
 *   403 - Unauthorized (not admin)
 *   500 - Server error
 */
export async function POST(request: NextRequest) {
  // Logger created inside function for proper test mocking support
  const logger = createLogger('tournaments-api');

  // Admin authentication: only admins can create tournaments
  const session = await auth();
  if (!session?.user || session.user.role !== 'admin') {
    return handleAuthzError();
  }

  try {
    // Sanitize input to prevent XSS and injection attacks
    const body = sanitizeInput(await request.json());
    const { name, date, dualReportEnabled, taPlayerSelfEdit } = body;
    const slug = normalizeTournamentSlug(body.slug);

    // Validate required fields
    if (!name || !date) {
      return handleValidationError("Name and date are required");
    }

    if (slug !== undefined && slug !== null && !isValidTournamentSlug(slug)) {
      return handleValidationError("Slug must contain only lowercase letters, numbers, and hyphens", "slug");
    }

    // Create the tournament with initial "draft" status and no public modes.
    // New tournaments are private by default; admin enables modes individually.
    // dualReportEnabled defaults to false — when true, both players must
    // report matching scores for auto-confirmation.
    const tournament = await prisma.tournament.create({
      data: {
        name,
        ...(slug !== undefined && { slug }),
        date: new Date(date),
        status: "draft",
        dualReportEnabled: dualReportEnabled === true,
        taPlayerSelfEdit: taPlayerSelfEdit !== false,
        publicModes: [],
      },
    });

    // Create audit log for tournament creation.
    // Wrapped in try/catch so audit failures don't block the response.
    try {
      const ip = await getServerSideIdentifier();
      const userAgent = request.headers.get('user-agent') || 'unknown';
      await createAuditLog({
        userId: session.user.id,
        ipAddress: ip,
        userAgent,
        action: AUDIT_ACTIONS.CREATE_TOURNAMENT,
        targetId: tournament.id,
        targetType: 'Tournament',
        details: {
          name,
          slug,
          date,
        },
      });
    } catch (logError) {
      // Audit log failures are non-critical; the tournament was created successfully.
      // Log the failure for monitoring but don't roll back the creation.
      logger.warn('Failed to create audit log', {
        error: logError,
        tournamentId: tournament.id,
        action: 'create_tournament',
      });
    }

    /* Use standard { success, data } wrapper. 201 status set explicitly. */
    return NextResponse.json(
      { success: true, data: tournament },
      { status: 201 }
    );
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "P2002"
    ) {
      return createErrorResponse("Tournament slug already exists", 409, "CONFLICT");
    }

    // Log error with structured metadata for monitoring
    logger.error("Failed to create tournament", { error });
    return createErrorResponse("Failed to create tournament", 500);
  }
}
