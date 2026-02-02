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

/**
 * GET /api/tournaments
 *
 * Returns a paginated list of all active (non-deleted) tournaments,
 * sorted by date in descending order (most recent first).
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

    // Use the paginate utility for consistent pagination behavior.
    // Sort: newest tournaments first for relevance.
    const result = await paginate(
      {
        findMany: prisma.tournament.findMany,
        count: prisma.tournament.count,
      },
      {},
      { date: "desc" },
      { page, limit }
    );

    return NextResponse.json(result);
  } catch (error) {
    // Log error with structured metadata for monitoring
    logger.error("Failed to fetch tournaments", { error });
    return NextResponse.json(
      { error: "Failed to fetch tournaments" },
      { status: 500 }
    );
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
    return NextResponse.json(
      { success: false, error: 'Unauthorized: Admin access required' },
      { status: 403 }
    );
  }

  try {
    // Sanitize input to prevent XSS and injection attacks
    const body = sanitizeInput(await request.json());
    const { name, date } = body;

    // Validate required fields
    if (!name || !date) {
      return NextResponse.json(
        { error: "Name and date are required" },
        { status: 400 }
      );
    }

    // Create the tournament with initial "draft" status.
    // Tournaments must be manually activated before score entry is allowed.
    const tournament = await prisma.tournament.create({
      data: {
        name,
        date: new Date(date),
        status: "draft",
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

    return NextResponse.json(tournament, { status: 201 });
  } catch (error) {
    // Log error with structured metadata for monitoring
    logger.error("Failed to create tournament", { error });
    return NextResponse.json(
      { error: "Failed to create tournament" },
      { status: 500 }
    );
  }
}
