/**
 * Qualification Confirmed Check Utility
 *
 * Validates whether a tournament's BM/MR/GP qualification is confirmed (locked).
 * When qualificationConfirmed is true, all score-update and score-report
 * API endpoints reject modifications for qualification-stage matches.
 * This prevents accidental or unauthorized changes after admin confirmation.
 *
 * Follows the same pattern as freeze-check.ts (TA stage freeze).
 *
 * Usage:
 *   const lockError = await checkQualificationConfirmed(prisma, tournamentId);
 *   if (lockError) return lockError;
 */

import type { NextResponse } from "next/server";
import type { PrismaClient } from "@prisma/client";
import { createErrorResponse } from "@/lib/error-handling";

/**
 * Check if the tournament's qualification is confirmed (locked from edits).
 * Returns a 403 NextResponse if confirmed, or null if edits are allowed.
 *
 * @param prisma - Prisma client instance
 * @param tournamentId - Tournament ID to check
 * @returns NextResponse with 403 error if confirmed, null if not confirmed
 */
export async function checkQualificationConfirmed(
  prisma: PrismaClient,
  tournamentId: string
): Promise<NextResponse | null> {
  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    select: { qualificationConfirmed: true },
  });

  if (!tournament) {
    return createErrorResponse("Tournament not found", 404);
  }

  if (tournament.qualificationConfirmed) {
    return createErrorResponse(
      'Qualification is confirmed. Score edits are locked.',
      403,
      'QUALIFICATION_CONFIRMED',
    );
  }

  return null;
}
