/**
 * Grand Prix Match Score Report API Route
 *
 * Allows participants to self-report their GP match results.
 * Uses a dual-report system: both players submit their results independently.
 * When both reports match, the match is auto-confirmed.
 * If reports differ, the match is flagged for admin review.
 *
 * GP-specific: Reports include race-by-race positions and driver points
 * (9 for 1st, 6 for 2nd, 3 for 3rd, 1 for 4th).
 *
 * Features:
 * - Score entry logging for audit trail
 * - Character usage tracking
 * - Auto-confirmation when both players agree
 * - Mismatch detection for admin review
 */

import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { getUserAgent, getClientIdentifier } from "@/lib/request-utils";
import { sanitizeInput } from "@/lib/sanitize";
import { createLogger } from "@/lib/logger";
import {
  createScoreEntryLog,
  createCharacterUsageLog,
  validateCharacter,
  checkScoreReportAuth,
} from "@/lib/api-factories/score-report-helpers";
import {
  createErrorResponse,
  createSuccessResponse,
  handleValidationError,
  handleAuthError,
  handleDatabaseError,
} from "@/lib/error-handling";
import { updateWithRetry, OptimisticLockError } from "@/lib/optimistic-locking";

/**
 * Driver points table indexed by finishing position.
 * Position 0 is unused (placeholder for 1-indexed positions).
 * 1st place = 9pts, 2nd = 6pts, 3rd = 3pts, 4th = 1pt.
 */
const DRIVER_POINTS = [0, 9, 6, 3, 1];

/**
 * Convert a finishing position to driver points.
 * Returns 0 for invalid positions (outside 1-4 range).
 */
function getPointsFromPosition(position: number): number {
  if (position < 1 || position > 4) return 0;
  return DRIVER_POINTS[position];
}

/**
 * POST /api/tournaments/[id]/gp/match/[matchId]/report
 *
 * Submit a GP match score report from a participant.
 * Processes race-by-race positions into driver points and
 * stores the report. Auto-confirms when both players agree.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; matchId: string }> }
) {
  const logger = createLogger('gp-score-report-api');
  const { id: tournamentId, matchId } = await params;
  try {
    const clientIp = getClientIdentifier(request);
    const userAgent = getUserAgent(request);

    const body = sanitizeInput(await request.json());
    const { reportingPlayer, races, character } = body;

    /* Fetch match with player userId for auth check */
    const match = await prisma.gPMatch.findUnique({
      where: { id: matchId },
      include: {
        player1: { select: { userId: true } },
        player2: { select: { userId: true } },
      },
    });

    if (!match) {
      return handleValidationError("Match not found", "matchId");
    }

    if (match.completed) {
      return handleValidationError("Match already completed", "matchStatus");
    }

    /* Authorization check (consistent with BM and MR report routes) */
    const isAuthorized = await checkScoreReportAuth(request, tournamentId, reportingPlayer, match);
    if (!isAuthorized) {
      return handleAuthError('Unauthorized: Not authorized for this match');
    }

    /* Validate character selection */
    if (!validateCharacter(character)) {
      return handleValidationError("Invalid character", "character");
    }

    const reportingPlayerId = reportingPlayer === 1 ? match.player1Id : match.player2Id;

    /* Process races: convert finishing positions to driver points */
    let totalPoints1 = 0;
    let totalPoints2 = 0;

    const processedRaces = races.map((race: { position1: number; position2: number; course: string }) => {
      const points1 = getPointsFromPosition(race.position1);
      const points2 = getPointsFromPosition(race.position2);
      totalPoints1 += points1;
      totalPoints2 += points2;
      return {
        course: race.course,
        position1: race.position1,
        position2: race.position2,
        points1,
        points2,
      };
    });

    /* Audit logging via shared helpers */
    await createScoreEntryLog(logger, {
      tournamentId, matchId, matchType: 'GP', playerId: reportingPlayerId,
      reportedData: { reportingPlayer, races: processedRaces, totalPoints1, totalPoints2 },
      clientIp, userAgent,
    });

    if (character) {
      await createCharacterUsageLog(logger, {
        matchId, matchType: 'GP', playerId: reportingPlayerId, character, tournamentId,
      });
    }

    /*
     * Optimistic locking: safely update reported scores.
     * Prevents race conditions when both players submit simultaneously.
     */
    let updatedMatch;
    try {
      updatedMatch = await updateWithRetry(prisma, async (tx) => {
        const currentMatch = await tx.gPMatch.findUnique({
          where: { id: matchId },
          select: { version: true }
        });

        if (!currentMatch) {
          throw new Error("Match not found");
        }

        const updateData =
          reportingPlayer === 1
            ? { player1ReportedPoints1: totalPoints1, player1ReportedPoints2: totalPoints2, player1ReportedRaces: processedRaces, version: { increment: 1 } }
            : { player2ReportedPoints1: totalPoints1, player2ReportedPoints2: totalPoints2, player2ReportedRaces: processedRaces, version: { increment: 1 } };

        const updateResult = await tx.gPMatch.update({
          where: { id: matchId, version: currentMatch.version },
          data: updateData,
          select: {
            id: true,
            player1ReportedPoints1: true, player1ReportedPoints2: true, player1ReportedRaces: true,
            player2ReportedPoints1: true, player2ReportedPoints2: true, player2ReportedRaces: true,
            completed: true, version: true,
          },
        });

        if (!updateResult) {
          throw new OptimisticLockError('Match was updated by another user', currentMatch.version);
        }

        return updateResult;
      });
    } catch (error) {
      if (error instanceof OptimisticLockError) {
        return createErrorResponse(
          "This match was updated by someone else. Please refresh and try again.",
          409, "OPTIMISTIC_LOCK_ERROR", { requiresRefresh: true }
        );
      }
      return handleDatabaseError(error, "score report update");
    }

    /* Check dual-report: auto-confirm or flag mismatch */
    const p1p1 = updatedMatch.player1ReportedPoints1;
    const p1p2 = updatedMatch.player1ReportedPoints2;
    const p2p1 = updatedMatch.player2ReportedPoints1;
    const p2p2 = updatedMatch.player2ReportedPoints2;

    /* Auto-confirm when both reports match */
    if (
      p1p1 !== null && p1p2 !== null && p2p1 !== null && p2p2 !== null &&
      p1p1 === p2p1 && p1p2 === p2p2
    ) {
      const racesToUse = updatedMatch.player1ReportedRaces || updatedMatch.player2ReportedRaces;

      try {
        const confirmedMatch = await updateWithRetry(prisma, async (tx) => {
          const currentMatch = await tx.gPMatch.findUnique({
            where: { id: matchId },
            select: { version: true }
          });

          if (!currentMatch) {
            throw new Error("Match not found");
          }

          const finalResult = await tx.gPMatch.update({
            where: { id: matchId, version: currentMatch.version },
            data: { points1: p1p1, points2: p1p2, races: racesToUse || [], completed: true, version: { increment: 1 } },
            include: { player1: true, player2: true },
          });

          if (!finalResult) {
            throw new OptimisticLockError('Match was updated by another user', currentMatch.version);
          }

          return finalResult;
        });

        await recalculatePlayerStats(tournamentId, confirmedMatch.player1Id);
        await recalculatePlayerStats(tournamentId, confirmedMatch.player2Id);

        return createSuccessResponse({
          match: confirmedMatch,
          autoConfirmed: true,
        }, "Scores confirmed and match completed");
      } catch (error) {
        return handleDatabaseError(error, "match completion");
      }
    }

    /* Mismatch: both reported but scores disagree */
    if (p1p1 !== null && p1p2 !== null && p2p1 !== null && p2p2 !== null) {
      return createSuccessResponse({
        match: updatedMatch,
        mismatch: true,
        player1Report: { points1: p1p1, points2: p1p2 },
        player2Report: { points1: p2p1, points2: p2p2 },
      }, "Score reported but mismatch detected - awaiting admin review");
    }

    return createSuccessResponse({
      match: updatedMatch,
      waitingFor: reportingPlayer === 1 ? "player2" : "player1",
    }, "Score reported successfully");
  } catch (error) {
    logger.error("Failed to report score", { error, tournamentId, matchId });
    return handleDatabaseError(error, "score report");
  }
}

/**
 * Recalculate GP qualification stats for a player.
 * GP-specific: tracks total driver points across matches.
 */
async function recalculatePlayerStats(tournamentId: string, playerId: string) {
  const matches = await prisma.gPMatch.findMany({
    where: {
      tournamentId, stage: "qualification", completed: true,
      OR: [{ player1Id: playerId }, { player2Id: playerId }],
    },
  });

  let totalPoints = 0;
  let wins = 0;
  let ties = 0;
  let losses = 0;

  for (const m of matches) {
    const isPlayer1 = m.player1Id === playerId;
    const myPoints = isPlayer1 ? m.points1 : m.points2;
    const oppPoints = isPlayer1 ? m.points2 : m.points1;
    totalPoints += myPoints;

    if (myPoints > oppPoints) wins++;
    else if (myPoints < oppPoints) losses++;
    else ties++;
  }

  const score = wins * 2 + ties;

  await prisma.gPQualification.updateMany({
    where: { tournamentId, playerId },
    data: { mp: matches.length, wins, ties, losses, points: totalPoints, score },
  });
}
