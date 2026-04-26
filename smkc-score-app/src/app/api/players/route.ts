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
import { createErrorResponse, handleValidationError, handleAuthzError } from "@/lib/error-handling";

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
    // Password is globally omitted via PrismaClient config in lib/prisma.ts.
    //
    // Exclude the system __BREAK__ player used as a sentinel for BYE matches
    // in round-robin scheduling. This player has no real-world identity and
    // should never appear in player listings or UI.
    const where = { id: { not: '__BREAK__' } };
    const result = await paginate(
      {
        findMany: prisma.player.findMany.bind(prisma.player),
        count: prisma.player.count,
      },
      where,
      { nickname: "asc" },
      { page, limit }
    );

    /*
     * For admin users, annotate each player with hasTournamentData so the UI can
     * disable the delete button without a separate per-player API call.
     * Uses a batch query strategy: fetch all registered player IDs from each
     * tournament table, then build a Set for O(1) lookup per player.
     * This avoids N+1 queries while keeping the data fresh on every page load.
     */
    const session = await auth();
    if (session?.user?.role === 'admin') {
      // Scope all queries to just the player IDs on the current page to avoid full-table scans.
      // result.data is untyped (paginate returns unknown[]); cast to the minimal shape we need.
      const players = result.data as Array<{ id: string }>;
      const pagePlayerIds = players.map(p => p.id);

      // Run queries sequentially to avoid D1 (SQLite) concurrent query failures.
      // D1 can intermittently fail under parallel query load (Promise.all with 8 queries),
      // causing the entire /api/players endpoint to return 500.
      //
      // Variable-count budget: D1's SQLITE_LIMIT_VARIABLE_NUMBER is 100,
      // but Prisma adds bound parameters of its own to each query (e.g. soft-
      // delete `deletedAt` predicates, implicit type casts), so an `IN (?,…)`
      // clause that already binds the full 100 page IDs immediately tips the
      // statement over the limit. Chunk into batches of 50 to leave headroom.
      //
      // Gracefully degrade: if hasTournamentData fails, return players without
      // the flag rather than failing the entire request.
      const ID_BATCH = 50;
      const idChunks: string[][] = [];
      for (let i = 0; i < pagePlayerIds.length; i += ID_BATCH) {
        idChunks.push(pagePlayerIds.slice(i, i + ID_BATCH));
      }

      try {
        const collected = new Set<string>();

        // Helper: run a per-chunk query and feed every yielded id into the Set.
        async function collectFrom<T extends Record<string, unknown>>(
          query: (chunk: string[]) => Promise<T[]>,
          fields: ReadonlyArray<keyof T & string>,
        ) {
          for (const chunk of idChunks) {
            const rows = await query(chunk);
            for (const row of rows) {
              for (const field of fields) {
                const v = row[field];
                if (typeof v === "string") collected.add(v);
              }
            }
          }
        }

        await collectFrom(
          (chunk) => prisma.bMQualification.findMany({ where: { playerId: { in: chunk } }, select: { playerId: true } }),
          ["playerId"]
        );
        await collectFrom(
          (chunk) => prisma.bMMatch.findMany({ where: { player1Id: { in: chunk } }, select: { player1Id: true } }),
          ["player1Id"]
        );
        await collectFrom(
          (chunk) => prisma.bMMatch.findMany({ where: { player2Id: { in: chunk } }, select: { player2Id: true } }),
          ["player2Id"]
        );
        await collectFrom(
          (chunk) => prisma.mRQualification.findMany({ where: { playerId: { in: chunk } }, select: { playerId: true } }),
          ["playerId"]
        );
        await collectFrom(
          (chunk) => prisma.mRMatch.findMany({ where: { player1Id: { in: chunk } }, select: { player1Id: true } }),
          ["player1Id"]
        );
        await collectFrom(
          (chunk) => prisma.mRMatch.findMany({ where: { player2Id: { in: chunk } }, select: { player2Id: true } }),
          ["player2Id"]
        );
        await collectFrom(
          (chunk) => prisma.gPQualification.findMany({ where: { playerId: { in: chunk } }, select: { playerId: true } }),
          ["playerId"]
        );
        await collectFrom(
          (chunk) => prisma.gPMatch.findMany({ where: { player1Id: { in: chunk } }, select: { player1Id: true } }),
          ["player1Id"]
        );
        await collectFrom(
          (chunk) => prisma.gPMatch.findMany({ where: { player2Id: { in: chunk } }, select: { player2Id: true } }),
          ["player2Id"]
        );
        await collectFrom(
          (chunk) => prisma.tTEntry.findMany({ where: { playerId: { in: chunk } }, select: { playerId: true } }),
          ["playerId"]
        );
        await collectFrom(
          (chunk) => prisma.tournamentPlayerScore.findMany({ where: { playerId: { in: chunk } }, select: { playerId: true } }),
          ["playerId"]
        );

        result.data = players.map(player => ({
          ...player,
          hasTournamentData: collected.has(player.id),
        }));
      } catch (annotationError) {
        // hasTournamentData is a UI convenience (disables delete button).
        // If it fails, serve the player list without it rather than returning 500.
        logger.warn("Failed to annotate hasTournamentData, serving without it", { error: annotationError });
      }
    }

    /* Spread paginate() result to avoid double-wrapping:
     * paginate returns { data, meta }, createSuccessResponse wraps in { success, data }.
     * Direct JSON response preserves flat structure: { success, data: [...], meta: {...} } */
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    logger.error("Failed to fetch players", { error });
    return createErrorResponse("Failed to fetch players", 500);
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

  try {
    // Authentication check: only admins can create players.
    // auth() is inside try/catch to prevent unhandled errors on Workers
    // (e.g., JWT verification failures) from returning HTML error pages.
    const session = await auth();
    if (!session?.user || session.user.role !== 'admin') {
      return handleAuthzError();
    }

    // Sanitize all input fields to prevent XSS and injection attacks
    const body = sanitizeInput(await request.json());
    const { name, nickname, country, noCamera } = body;

    // Validate required fields before database operations
    if (!name || !nickname) {
      return handleValidationError("Name and nickname are required");
    }

    // Generate a cryptographically secure random password (12 characters).
    // This password is hashed with bcrypt before storage.
    // The plaintext is returned only once in the response.
    const plainPassword = generateSecurePassword(12);
    const hashedPassword = await hashPassword(plainPassword);

    // Create the player record in the database.
    // Omit password hash from the returned object — the plaintext is
    // returned separately and the hash must never leave the server.
    const player = await prisma.player.create({
      data: {
        name,
        nickname,
        country: country || null,
        noCamera: noCamera === true,
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
    /* Use standard { success, data } wrapper. 201 set explicitly. */
    return NextResponse.json(
      { success: true, data: { player, temporaryPassword: plainPassword } },
      { status: 201 }
    );
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
      return createErrorResponse("A player with this nickname already exists", 409);
    }
    return createErrorResponse("Failed to create player", 500);
  }
}
