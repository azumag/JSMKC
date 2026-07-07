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
import { PLAYER_PUBLIC_SELECT } from '@/lib/prisma-selects';
import prisma from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { createAuditLog, AUDIT_ACTIONS, resolveAuditUserId } from "@/lib/audit-log";
import { getServerSideIdentifier } from "@/lib/rate-limit";
import { sanitizeInput } from "@/lib/sanitize";
import { createLogger } from "@/lib/logger";
import { retryDbRead } from "@/lib/db-read-retry";
import { isValidTournamentSlug, normalizeTournamentSlug, resolveTournamentId } from "@/lib/tournament-identifier";
import {
  createSuccessResponse,
  createErrorResponse,
  handleAuthzError,
  handleValidationError,
} from "@/lib/error-handling";
import { isValidPublicModes } from "@/lib/public-modes";
import {
  getArchivedTournamentSummary,
  persistTournamentArchive,
  readTournamentArchive,
} from "@/lib/tournament-archive";

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
  let resolvedId = identifier;

  try {
    resolvedId = await retryDbRead(
      () => resolveTournamentId(identifier),
      {
        onRetry: ({ attempt, error }) => logger.warn("Retrying tournament id resolve", {
          attempt,
          id: identifier,
          error: error instanceof Error ? error.message : error,
        }),
      },
    );

    const { searchParams } = new URL(request.url);

    /*
     * ?fields=summary returns only core tournament metadata (no relations).
     * Used by the tournament layout which only needs name/date/status.
     * This is much lighter than the full query with BM qualifications/matches,
     * reducing Workers CPU/memory pressure and eliminating most 1101 crashes.
     */
    const isSummary = searchParams.get('fields') === 'summary';

    const tournament = await retryDbRead(
      () => prisma.tournament.findUnique({
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
              debugMode: true,
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
              debugMode: true,
              createdAt: true,
              updatedAt: true,
              bmQualifications: {
                include: { player: { select: PLAYER_PUBLIC_SELECT } },
                orderBy: [{ group: "asc" }, { score: "desc" }],
              },
              bmMatches: {
                include: {
                  player1: { select: PLAYER_PUBLIC_SELECT },
                  player2: { select: PLAYER_PUBLIC_SELECT },
                },
                orderBy: { matchNumber: "asc" },
              },
            },
      }),
      {
        onRetry: ({ attempt, error }) => logger.warn("Retrying tournament read", {
          attempt,
          id: resolvedId,
          error: error instanceof Error ? error.message : error,
        }),
      },
    );

    if (!tournament) {
      const archived = await readTournamentArchive(identifier);
      if (archived) {
        return createSuccessResponse(getArchivedTournamentSummary(archived, isSummary));
      }
      return createErrorResponse("Tournament not found", 404);
    }

    // Visibility check based on publicModes (not isPublic).
    // Admin users can see all tournaments; authenticated users (players) can
    // also access private tournaments so they can submit times before modes are
    // published. Unauthenticated requests are blocked when publicModes is empty.
    const session = await auth();
    const isAdmin = session?.user?.role === 'admin';
    const isAuthenticated = Boolean(session?.user);

    // Ternary select makes Prisma v6 infer {} for the result; cast to access the field.
    const publicModes = (tournament as { publicModes?: unknown }).publicModes as string[] || [];
    if (!isAuthenticated && publicModes.length === 0) {
      return handleAuthzError("This tournament has no visible modes");
    }

    // `debugMode` exposes internal QA state and signals which tournaments
    // accept the auto-fill API. Hide it from non-admin callers entirely so
    // it's not visible to scrapers or curious users probing the public
    // summary endpoint. Admins still see the flag (used to render the
    // auto-fill button on qualification pages).
    // Cast away the {} inferred by the ternary-select Prisma query so the
    // 'in' operator and destructuring below are type-safe.
    const t = tournament as Record<string, unknown>;
    if (!isAdmin && 'debugMode' in t) {
      const { debugMode: _hiddenDebugMode, ...rest } = t;
      void _hiddenDebugMode;
      return createSuccessResponse(rest);
    }

    return createSuccessResponse(t);
  } catch (error) {
    // Log with tournament ID for easy filtering in log aggregation
    logger.error("Failed to fetch tournament", { error, id: resolvedId });
    const archived = await readTournamentArchive(identifier);
    if (archived) {
      return createSuccessResponse(
        getArchivedTournamentSummary(archived, new URL(request.url).searchParams.get('fields') === 'summary')
      );
    }
    return createErrorResponse("Failed to fetch tournament", 500);
  }
}

/**
 * Tournament status lifecycle. Each key lists the statuses it may move to:
 *
 *   draft ──start──▶ active ──complete──▶ completed
 *     ▲                │  ▲                  │  │
 *     │◀───demote──────┘  └─────reopen──────┘  │
 *     └◀────────────demote─────────────────────┘
 *
 * - "reopen" (completed -> active) lets admins fix scores after a
 *   tournament was closed by mistake or results were disputed.
 * - "demote" (back to draft) is the deletion path: DELETE only accepts
 *   draft tournaments (issue #667), so admin tooling (e2e/cleanup.js,
 *   e2e/tc-all.js deleteTournament) demotes first, then deletes. Removing
 *   this path would make non-draft tournaments undeletable.
 * - The only rejected transition is draft -> completed: a tournament must
 *   be started before it can be completed, so a stray "complete" call on a
 *   never-started tournament fails loudly instead of skipping activation.
 * - Same-status updates are accepted as no-ops so clients can PUT their
 *   current state without special-casing.
 *
 * Reopening deliberately leaves the persisted archive alone: the archive is
 * only served as a fallback when the live row is missing (see GET above),
 * and it is overwritten the next time the tournament is completed.
 */
const ALLOWED_STATUS_TRANSITIONS: Record<string, readonly string[]> = {
  draft: ["active"],
  active: ["completed", "draft"],
  completed: ["active", "draft"],
};

/**
 * PUT /api/tournaments/:id
 *
 * Updates tournament metadata (name, date, status). Requires admin authentication.
 * Only provided fields are updated; omitted fields remain unchanged.
 *
 * Request body (all optional):
 *   - name   (string) - Tournament name
 *   - date   (string) - Tournament date in ISO format
 *   - status (string) - Tournament status; must follow ALLOWED_STATUS_TRANSITIONS
 *
 * Response:
 *   200 - Updated tournament object
 *   400 - Invalid status value or disallowed status transition
 *   403 - Not authorized (non-admin)
 *   404 - Tournament not found (Prisma P2025, or status change on missing row)
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
    const {
      name, date, status, frozenStages, taPlayerSelfEdit, publicModes,
      // Per-mode qualification confirmed flags (issue #696).
      // Legacy qualificationConfirmed is no longer accepted; use the mode-specific fields.
      bmQualificationConfirmed,
      mrQualificationConfirmed,
      gpQualificationConfirmed,
      // debugMode: enables auto-fill buttons; admin-only toggle (#746)
      debugMode,
    } = body;
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

    // Validate publicModes: each entry must be a valid mode name, with no
    // duplicates. Modes are independently publishable (issue #618), so any
    // subset of [ta, bm, mr, gp, overall] in any order is accepted.
    if (publicModes !== undefined) {
      if (!Array.isArray(publicModes) || !isValidPublicModes(publicModes)) {
        return handleValidationError(
          "publicModes must be an array of valid modes (ta, bm, mr, gp, overall) with no duplicates",
          "publicModes"
        );
      }
    }

    // Validate the requested status value itself (pure, no DB read) against
    // the lifecycle map before touching the database.
    if (status !== undefined) {
      if (
        typeof status !== "string" ||
        // Object.hasOwn (not `in`): prototype keys like "toString" must not
        // pass value validation and leak into the DB query below.
        !Object.hasOwn(ALLOWED_STATUS_TRANSITIONS, status)
      ) {
        return handleValidationError(
          `status must be one of: ${Object.keys(ALLOWED_STATUS_TRANSITIONS).join(", ")}`,
          "status"
        );
      }
    }

    // Use spread conditionals to only update fields that were provided.
    // This prevents accidentally nullifying fields that weren't included
    // in the request body.
    const updateData = {
      ...(name && { name }),
      ...(slug !== undefined && { slug }),
      ...(date && { date: new Date(date) }),
      ...(status && { status }),
      ...(frozenStages !== undefined && { frozenStages }),
      ...(taPlayerSelfEdit !== undefined && { taPlayerSelfEdit: taPlayerSelfEdit === true }),
      // Per-mode qualification confirmed flags (issue #696).
      // qualificationConfirmedAt is updated whenever any mode is confirmed so the
      // overlay event system (overlay-events/route.ts) continues to fire correctly.
      ...(bmQualificationConfirmed !== undefined && {
        bmQualificationConfirmed: bmQualificationConfirmed === true,
        ...(bmQualificationConfirmed === true && { qualificationConfirmedAt: new Date() }),
      }),
      ...(mrQualificationConfirmed !== undefined && {
        mrQualificationConfirmed: mrQualificationConfirmed === true,
        ...(mrQualificationConfirmed === true && { qualificationConfirmedAt: new Date() }),
      }),
      ...(gpQualificationConfirmed !== undefined && {
        gpQualificationConfirmed: gpQualificationConfirmed === true,
        ...(gpQualificationConfirmed === true && { qualificationConfirmedAt: new Date() }),
      }),
      ...(publicModes !== undefined && { publicModes }),
      ...(debugMode !== undefined && { debugMode: debugMode === true }),
    };

    let tournament;
    if (status !== undefined) {
      // Fold the "is this transition allowed from the CURRENT status" check
      // into the write itself via a conditional updateMany, instead of a
      // separate findUnique-then-update (issue #2761): D1 has no interactive
      // transactions, so a read-then-write pair leaves a window where a
      // concurrent PUT can change the status in between, letting a
      // since-invalidated transition slip through. Scoping the WHERE clause
      // to the set of statuses this transition is valid from makes the guard
      // atomic with the write — count===0 means either the row doesn't exist
      // or its status raced away from under us, exactly like the DELETE
      // handler's deleteMany-then-disambiguate pattern below.
      const allowedSourceStatuses = new Set<string>([status]);
      for (const [from, tos] of Object.entries(ALLOWED_STATUS_TRANSITIONS)) {
        if (tos.includes(status)) allowedSourceStatuses.add(from);
      }

      const updateResult = await prisma.tournament.updateMany({
        where: { id: resolvedId, status: { in: [...allowedSourceStatuses] } },
        data: updateData,
      });

      if (updateResult.count === 0) {
        const current = await prisma.tournament.findUnique({
          where: { id: resolvedId },
          select: { status: true },
        });
        if (!current) {
          return createErrorResponse("Tournament not found", 404);
        }
        return handleValidationError(
          `Cannot change tournament status from "${current.status}" to "${status}"`,
          "status"
        );
      }

      tournament = await prisma.tournament.findUnique({ where: { id: resolvedId } });
      if (!tournament) {
        // Row vanished between the successful updateMany and this read
        // (e.g. a concurrent delete). Vanishingly unlikely, but report it
        // as "not found" rather than crashing on a null response body.
        return createErrorResponse("Tournament not found", 404);
      }
    } else {
      tournament = await prisma.tournament.update({
        where: { id: resolvedId },
        data: updateData,
      });
    }

    if (status === "completed") {
      try {
        await persistTournamentArchive(resolvedId);
      } catch (archiveError) {
        logger.warn("Failed to persist tournament archive", {
          error: archiveError,
          id: resolvedId,
        });
      }
    }

    // Audit log for the update operation — fire-and-forget via .catch()
    try {
      const ip = await getServerSideIdentifier();
      const userAgent = request.headers.get('user-agent') || 'unknown';
      createAuditLog({
        userId: resolveAuditUserId(session),
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
          bmQualificationConfirmed,
          mrQualificationConfirmed,
          gpQualificationConfirmed,
          publicModes,
        },
      }).catch((err) => logger.warn('Failed to create audit log', {
        error: err,
        id: resolvedId,
        action: 'UPDATE_TOURNAMENT',
      }));
    } catch (logError) {
      // Covers sync failures (e.g. getServerSideIdentifier, resolveAuditUserId)
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
      createAuditLog({
        userId: resolveAuditUserId(session),
        ipAddress: ip,
        userAgent,
        action: AUDIT_ACTIONS.DELETE_TOURNAMENT,
        targetId: resolvedId,
        targetType: 'Tournament',
        details: {
          tournamentId: resolvedId,
        },
      }).catch((err) => logger.warn('Failed to create audit log', {
        error: err,
        id: resolvedId,
        action: 'DELETE_TOURNAMENT',
      }));
    } catch (logError) {
      // Covers sync failures (e.g. getServerSideIdentifier, resolveAuditUserId)
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
