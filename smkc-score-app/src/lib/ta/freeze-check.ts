/**
 * Freeze Check Utility
 *
 * Validates whether a tournament stage is frozen (locked from time edits).
 * The Tournament.frozenStages field stores a JSON array of stage name strings.
 * When a stage is frozen, all time-update API endpoints reject modifications
 * for entries in that stage. This is used by admins to lock results after
 * each phase completes, preventing accidental or unauthorized changes.
 *
 * Usage:
 *   const freezeError = await checkStageFrozen(prisma, tournamentId, stage);
 *   if (freezeError) return freezeError;
 */

import { NextResponse } from "next/server";
import type { PrismaClient } from "@prisma/client";

/**
 * Check if the specified stage is frozen for the given tournament.
 * Returns a 403 NextResponse if frozen, or null if edits are allowed.
 *
 * @param prisma - Prisma client instance
 * @param tournamentId - Tournament ID to check
 * @param stage - Stage name to check (e.g., "qualification", "phase1")
 * @returns NextResponse with 403 error if frozen, null if not frozen
 */
export async function checkStageFrozen(
  prisma: PrismaClient,
  tournamentId: string,
  stage: string
): Promise<NextResponse | null> {
  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    select: { frozenStages: true },
  });

  if (!tournament) {
    return NextResponse.json(
      { success: false, error: "Tournament not found" },
      { status: 404 }
    );
  }

  // frozenStages is stored as a JSON array of stage name strings
  const frozen = (tournament.frozenStages as string[]) || [];
  if (frozen.includes(stage)) {
    return NextResponse.json(
      {
        success: false,
        error: `This stage (${stage}) is frozen. Time edits are not allowed.`,
      },
      { status: 403 }
    );
  }

  return null;
}
