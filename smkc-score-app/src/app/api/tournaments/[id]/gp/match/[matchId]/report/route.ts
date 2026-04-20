/**
 * Grand Prix Match Score Report API Route
 *
 * Allows participants to self-report their GP match results.
 * Uses a dual-report system: both players submit their results independently.
 * When both reports match, the match is auto-confirmed.
 * If reports differ, the match is flagged for admin review.
 *
 * GP-specific: Reports include race-by-race positions and driver points
 * (9 for 1st, 6 for 2nd, 3 for 3rd, 1 for 4th, 0 for 5th-8th).
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
  isDualReportEnabled,
  recalculatePlayerStats,
  type RecalculateStatsConfig,
} from "@/lib/api-factories/score-report-helpers";
import { validateGPRacePosition } from "@/lib/score-validation";
import { getDriverPoints, TOTAL_GP_RACES } from "@/lib/constants";
import {
  createErrorResponse,
  createSuccessResponse,
  handleValidationError,
  handleAuthError,
  handleDatabaseError,
  handleRateLimitError,
} from "@/lib/error-handling";
import { checkRateLimit } from "@/lib/rate-limit";
import { updateWithRetry, OptimisticLockError } from "@/lib/optimistic-locking";
import { resolveTournamentId } from "@/lib/tournament-identifier";
import { checkQualificationConfirmed } from "@/lib/qualification-confirmed-check";

/**
 * GP-specific stats recalculation config.
 * Direct driver-points comparison for win/loss/tie.
 * Accumulates total driver points as the `points` field (not round differential).
 */
const GP_RECALC_CONFIG: RecalculateStatsConfig = {
  matchModel: 'gPMatch',
  qualificationModel: 'gPQualification',
  scoreFields: { p1: 'points1', p2: 'points2' },
  determineResult: (myPoints, oppPoints) =>
    myPoints > oppPoints ? 'win' : myPoints < oppPoints ? 'loss' : 'tie',
  useRoundDifferential: false,
};


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
  const { id, matchId } = await params;
  const tournamentId = await resolveTournamentId(id);

  /* Rate limit: prevent abuse on score report endpoint */
  const clientIp = getClientIdentifier(request);
  const rateResult = await checkRateLimit('scoreInput', clientIp);
  if (!rateResult.success) {
    return handleRateLimitError(rateResult.retryAfter);
  }

  try {
    /* Block score reports when qualification is confirmed */
    const lockError = await checkQualificationConfirmed(prisma, tournamentId);
    if (lockError) return lockError;

    const userAgent = getUserAgent(request);

    const body = sanitizeInput(await request.json());
    const { reportingPlayer, races, character } = body;

    /* Fetch match with player userId for auth check */
    const match = await prisma.gPMatch.findUnique({
      where: { id: matchId, tournamentId },
      include: {
        player1: { select: { userId: true } },
        player2: { select: { userId: true } },
      },
    });

    if (!match) {
      return handleValidationError("Match not found", "matchId");
    }

    /* Validate reportingPlayer before auth check to prevent invalid values propagating */
    if (reportingPlayer !== 1 && reportingPlayer !== 2) {
      return handleValidationError("reportingPlayer must be 1 or 2", "reportingPlayer");
    }

    /* Authorization check (consistent with BM and MR report routes) */
    const isAuthorized = await checkScoreReportAuth(request, tournamentId, reportingPlayer, match);
    if (!isAuthorized) {
      return handleAuthError('Unauthorized: Not authorized for this match');
    }

    /*
     * Correction path: let a participant fix a GP score after the match has
     * already been confirmed. Keep the match completed, update the final score
     * and the reporting player's stored report, then recalculate standings.
     */
    if (match.completed) {
      /* Validate GP race positions are in legal range (0-8) before processing */
      if (!Array.isArray(races) || races.length !== TOTAL_GP_RACES) {
        return handleValidationError(`races must be an array of ${TOTAL_GP_RACES} entries`, "races");
      }
      for (let i = 0; i < races.length; i++) {
        const race = races[i] as { position1: number; position2: number; course: string };
        const pos1Result = validateGPRacePosition(race.position1);
        if (!pos1Result.isValid) return handleValidationError(pos1Result.error!, "position1");
        const pos2Result = validateGPRacePosition(race.position2);
        if (!pos2Result.isValid) return handleValidationError(pos2Result.error!, "position2");
        /* Two players cannot finish in the same position (except both game-over at 0 per §7.2) */
        if (race.position1 === race.position2 && race.position1 !== 0) {
          return handleValidationError(
            `Race ${i + 1}: both players cannot finish in the same position (${race.position1})`,
            "position",
          );
        }
      }

      /* Process races: convert finishing positions to driver points (same as normal flow) */
      let totalPoints1 = 0;
      let totalPoints2 = 0;

      const processedRaces = races.map((race: { position1: number; position2: number; course: string }) => {
        const pts1 = getDriverPoints(race.position1);
        const pts2 = getDriverPoints(race.position2);
        totalPoints1 += pts1;
        totalPoints2 += pts2;
        return {
          course: race.course,
          position1: race.position1,
          position2: race.position2,
          points1: pts1,
          points2: pts2,
        };
      });

      try {
        const correctedMatch = await updateWithRetry(prisma, async (tx) => {
          const currentMatch = await tx.gPMatch.findUnique({
            where: { id: matchId },
            select: { version: true },
          });

          if (!currentMatch) {
            throw new Error("Match not found");
          }

          const reportData =
            reportingPlayer === 1
              ? { player1ReportedPoints1: totalPoints1, player1ReportedPoints2: totalPoints2, player1ReportedRaces: processedRaces }
              : { player2ReportedPoints1: totalPoints1, player2ReportedPoints2: totalPoints2, player2ReportedRaces: processedRaces };

          return tx.gPMatch.update({
            where: { id: matchId, version: currentMatch.version },
            data: {
              points1: totalPoints1,
              points2: totalPoints2,
              completed: true,
              ...reportData,
              version: { increment: 1 },
            },
            include: { player1: true, player2: true },
          });
        });

        await recalculatePlayerStats(GP_RECALC_CONFIG, tournamentId, correctedMatch.player1Id);
        await recalculatePlayerStats(GP_RECALC_CONFIG, tournamentId, correctedMatch.player2Id);

        return createSuccessResponse({
          match: correctedMatch,
          corrected: true,
        }, "Score correction saved");
      } catch (error) {
        if (error instanceof OptimisticLockError) {
          return createErrorResponse(
            "This match was updated by someone else. Please refresh and try again.",
            409, "OPTIMISTIC_LOCK_ERROR", { requiresRefresh: true }
          );
        }
        return handleDatabaseError(error, "score correction");
      }
    }

    /* Validate character selection */
    if (!validateCharacter(character)) {
      return handleValidationError("Invalid character", "character");
    }

    const reportingPlayerId = reportingPlayer === 1 ? match.player1Id : match.player2Id;

    /* Validate GP race positions are in legal range (0-8) before processing */
    if (!Array.isArray(races) || races.length !== TOTAL_GP_RACES) {
      return handleValidationError(`races must be an array of ${TOTAL_GP_RACES} entries`, "races");
    }
    for (let i = 0; i < races.length; i++) {
      const race = races[i] as { position1: number; position2: number; course: string };
      const pos1Result = validateGPRacePosition(race.position1);
      if (!pos1Result.isValid) return handleValidationError(pos1Result.error!, "position1");
      const pos2Result = validateGPRacePosition(race.position2);
      if (!pos2Result.isValid) return handleValidationError(pos2Result.error!, "position2");
      /* Two players cannot finish in the same position (except both game-over at 0 per §7.2) */
      if (race.position1 === race.position2 && race.position1 !== 0) {
        return handleValidationError(
          `Race ${i + 1}: both players cannot finish in the same position (${race.position1})`,
          "position",
        );
      }
    }

    /* Process races: convert finishing positions to driver points */
    let totalPoints1 = 0;
    let totalPoints2 = 0;

    const processedRaces = races.map((race: { position1: number; position2: number; course: string }) => {
      const points1 = getDriverPoints(race.position1);
      const points2 = getDriverPoints(race.position2);
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

    /* If dual report is disabled (default), immediately confirm the match */
    if (!(await isDualReportEnabled(tournamentId))) {
      try {
        const finalMatch = await updateWithRetry(prisma, async (tx) =>
          tx.gPMatch.update({
            where: { id: matchId, version: updatedMatch.version },
            data: { points1: totalPoints1, points2: totalPoints2, completed: true, version: { increment: 1 } },
            include: { player1: true, player2: true },
          })
        );
        await recalculatePlayerStats(GP_RECALC_CONFIG, tournamentId, finalMatch.player1Id);
        await recalculatePlayerStats(GP_RECALC_CONFIG, tournamentId, finalMatch.player2Id);
        return createSuccessResponse({ match: finalMatch, autoConfirmed: true },
          "Score confirmed (dual report disabled)");
      } catch (error) {
        if (error instanceof OptimisticLockError) {
          return createErrorResponse(
            "This match was updated by someone else. Please refresh and try again.",
            409, "OPTIMISTIC_LOCK_ERROR", { requiresRefresh: true }
          );
        }
        return handleDatabaseError(error, "match completion");
      }
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
      const p1Races = updatedMatch.player1ReportedRaces;
      const p2Races = updatedMatch.player2ReportedRaces;

      /* Check if race data also matches when both players have reported races */
      const racesMatch =
        p1Races.length === p2Races.length &&
        p1Races.every((race, i) =>
          race.course === p2Races[i].course &&
          race.position1 === p2Races[i].position1 &&
          race.position2 === p2Races[i].position2
        );
      if (!racesMatch) {
        return createErrorResponse(
          "Race data mismatch: both players reported the same score but different race details. Please refresh and reconfirm.",
          409, "RACE_DATA_MISMATCH", {
            player1Races: p1Races,
            player2Races: p2Races,
            requiresRefresh: true
          }
        );
      }

      const racesToUse = p1Races || p2Races;

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

        await recalculatePlayerStats(GP_RECALC_CONFIG, tournamentId, confirmedMatch.player1Id);
        await recalculatePlayerStats(GP_RECALC_CONFIG, tournamentId, confirmedMatch.player2Id);

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
