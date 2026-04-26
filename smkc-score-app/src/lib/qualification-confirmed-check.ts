/**
 * Qualification Confirmed Check Utility
 *
 * Validates whether a specific mode's qualification is confirmed (locked).
 * When a mode's qualificationConfirmed flag is true, all score-update and
 * score-report API endpoints for that mode reject modifications.
 * This prevents accidental or unauthorized changes after admin confirmation.
 *
 * Each mode (bm/mr/gp) has its own independent flag so confirming one mode
 * does not lock the others (issue #696).
 *
 * Usage:
 *   const lockError = await checkQualificationConfirmed(prisma, tournamentId, 'bm');
 *   if (lockError) return lockError;
 */

import type { NextResponse } from "next/server";
import type { PrismaClient } from "@prisma/client";
import { createErrorResponse } from "@/lib/error-handling";

type QualMode = 'bm' | 'mr' | 'gp';

/** Maps event type code to the corresponding per-mode DB column name. */
const MODE_FIELD: Record<QualMode, 'bmQualificationConfirmed' | 'mrQualificationConfirmed' | 'gpQualificationConfirmed'> = {
  bm: 'bmQualificationConfirmed',
  mr: 'mrQualificationConfirmed',
  gp: 'gpQualificationConfirmed',
};

/**
 * Check if a specific mode's qualification is confirmed (locked from edits).
 * Returns a 403 NextResponse if confirmed, or null if edits are allowed.
 *
 * @param prisma - Prisma client instance
 * @param tournamentId - Tournament ID to check
 * @param mode - Which mode to check ('bm' | 'mr' | 'gp')
 * @returns NextResponse with 403 error if confirmed, null if not confirmed
 */
export async function checkQualificationConfirmed(
  prisma: PrismaClient,
  tournamentId: string,
  mode: QualMode,
): Promise<NextResponse | null> {
  const field = MODE_FIELD[mode];
  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    select: { [field]: true },
  });

  if (!tournament) {
    return createErrorResponse("Tournament not found", 404);
  }

  if (tournament[field]) {
    return createErrorResponse(
      `${mode.toUpperCase()} qualification is confirmed. Score edits are locked.`,
      403,
      'QUALIFICATION_CONFIRMED',
    );
  }

  return null;
}
