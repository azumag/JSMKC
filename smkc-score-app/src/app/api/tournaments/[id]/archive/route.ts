/**
 * Tournament Archive API Route
 *
 * GET  /api/tournaments/[id]/archive - Read the immutable R2 archive bundle.
 * POST /api/tournaments/[id]/archive - Regenerate the archive for a completed tournament.
 */
import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { createErrorResponse, createSuccessResponse, handleAuthError, handleAuthzError } from "@/lib/error-handling";
import { persistTournamentArchive, readTournamentArchive } from "@/lib/tournament-archive";
import { resolveTournament } from "@/lib/tournament-identifier";
import { createLogger } from "@/lib/logger";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const archive = await readTournamentArchive(id);
  if (!archive) {
    return createErrorResponse("Tournament archive not found", 404, "NOT_FOUND");
  }

  const publicModes = archive.tournament.publicModes as string[] || [];
  if (publicModes.length === 0) {
    return handleAuthzError("This archived tournament has no visible modes");
  }

  return createSuccessResponse(archive);
}

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const logger = createLogger("tournament-archive-api");
  const session = await auth();
  if (!session?.user) return handleAuthError("Authentication required");
  if (session.user.role !== "admin") return handleAuthzError();

  const { id } = await params;
  const tournament = await resolveTournament(id, { id: true, status: true });
  if (!tournament) {
    return createErrorResponse("Tournament not found", 404, "NOT_FOUND");
  }
  if (tournament.status !== "completed") {
    return createErrorResponse("Only completed tournaments can be archived", 409, "CONFLICT");
  }

  try {
    const archive = await persistTournamentArchive(tournament.id);
    return createSuccessResponse(archive);
  } catch (error) {
    logger.error("Failed to persist tournament archive", { error, tournamentId: tournament.id });
    return createErrorResponse("Failed to persist tournament archive", 500, "INTERNAL_ERROR");
  }
}
