/**
 * Match Race Score Report API Route
 *
 * Allows participants to self-report their MR match scores.
 * Both players must independently report matching scores for
 * the match to be automatically confirmed.
 *
 * Authorization supports session-based methods:
 * 1. Admin session (full access)
 * 2. Player account (matched by playerId in session)
 *
 * Security features:
 * - Session-based authorization (admin or player)
 * - Input sanitization and validation
 * - Optimistic locking to prevent race conditions
 * - Score entry logging for audit trail
 * - Character usage tracking
 */

import { NextRequest } from "next/server";
import { PLAYER_PUBLIC_SELECT, PLAYER_AUTH_SELECT } from '@/lib/prisma-selects';
import prisma from "@/lib/prisma";
import { getUserAgent, getClientIdentifier } from "@/lib/request-utils";
import { sanitizeInput } from "@/lib/sanitize";
import { createLogger } from "@/lib/logger";
import {
  checkScoreReportAuth,
  createScoreEntryLog,
  createCharacterUsageLog,
  isDualReportEnabled,
  validateCharacter,
  recalculatePlayerStats,
  type RecalculateStatsConfig,
} from "@/lib/api-factories/score-report-helpers";
import { validateMatchRaceScores } from "@/lib/score-validation";
import { TOTAL_MR_RACES } from "@/lib/constants";
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
 * MR-specific stats recalculation config.
 * Direct score comparison for win/loss/tie (MR allows 2-2 draws).
 * Tracks round differential (winRounds - lossRounds) as the `points` field.
 */
const MR_RECALC_CONFIG: RecalculateStatsConfig = {
  matchModel: 'mRMatch',
  qualificationModel: 'mRQualification',
  scoreFields: { p1: 'score1', p2: 'score2' },
  determineResult: (myScore, oppScore) =>
    myScore > oppScore ? 'win' : myScore < oppScore ? 'loss' : 'tie',
  useRoundDifferential: true,
};

/**
 * POST /api/tournaments/[id]/mr/match/[matchId]/report
 *
 * Submit a participant's score report for an MR match.
 * Both players report independently; when reports match,
 * the match is automatically confirmed.
 *
 * Authentication: admin or player (for their own reports).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; matchId: string }> }
) {
  const logger = createLogger('mr-score-report-api');
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
    const lockError = await checkQualificationConfirmed(prisma, tournamentId, 'mr');
    if (lockError) return lockError;

    const userAgent = getUserAgent(request);

    const body = sanitizeInput(await request.json());
    const { reportingPlayer, score1, score2, rounds, character } = body;

    /* Validate character selection */
    if (!validateCharacter(character)) {
      return handleValidationError("Invalid character", "character");
    }

    /* Fetch match and verify it belongs to this tournament */
    const match = await prisma.mRMatch.findUnique({
      where: { id: matchId, tournamentId },
      include: { player1: { select: PLAYER_AUTH_SELECT }, player2: { select: PLAYER_AUTH_SELECT } },
    });

    if (!match) {
      return handleValidationError("Match not found", "matchId");
    }

    /* Validate required fields before auth to fail fast on malformed requests */
    if (reportingPlayer !== 1 && reportingPlayer !== 2) {
      return handleValidationError("reportingPlayer must be 1 or 2", "reportingPlayer");
    }

    if (score1 === undefined || score2 === undefined) {
      return handleValidationError("score1 and score2 are required", "requiredFields");
    }

    /* Multi-method authorization check */
    const isAuthorized = await checkScoreReportAuth(request, tournamentId, reportingPlayer, match);
    if (!isAuthorized) {
      return handleAuthError('Unauthorized: Not authorized for this match');
    }

    /*
     * Correction path: let a participant fix a MR score after the match has
     * already been confirmed. Keep the match completed, update the final score
     * and the reporting player's stored report, then recalculate standings.
     */
    if (match.completed) {
      /* Validate MR scores are in legal range (sum must equal TOTAL_MR_RACES=4) */
      const scoreValidation = validateMatchRaceScores(score1, score2);
      if (!scoreValidation.isValid) {
        return handleValidationError(scoreValidation.error!, "scores");
      }

      try {
        const correctedMatch = await updateWithRetry(prisma, async (tx) => {
          const currentMatch = await tx.mRMatch.findUnique({
            where: { id: matchId },
            select: { version: true },
          });

          if (!currentMatch) {
            throw new Error("Match not found");
          }

          const reportData =
            reportingPlayer === 1
              ? { player1ReportedPoints1: score1, player1ReportedPoints2: score2, player1ReportedRaces: rounds }
              : { player2ReportedPoints1: score1, player2ReportedPoints2: score2, player2ReportedRaces: rounds };

          return tx.mRMatch.update({
            where: { id: matchId, version: currentMatch.version },
            data: {
              score1,
              score2,
              completed: true,
              ...reportData,
              version: { increment: 1 },
            },
            include: { player1: { select: PLAYER_AUTH_SELECT }, player2: { select: PLAYER_AUTH_SELECT } },
          });
        });

        await recalculatePlayerStats(MR_RECALC_CONFIG, tournamentId, correctedMatch.player1Id);
        await recalculatePlayerStats(MR_RECALC_CONFIG, tournamentId, correctedMatch.player2Id);

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

    /* Validate MR scores are in legal range (sum must equal TOTAL_MR_RACES=4) */
    const scoreValidation = validateMatchRaceScores(score1, score2);
    if (!scoreValidation.isValid) {
      return handleValidationError(scoreValidation.error!, "scores");
    }

    /*
     * Validate that submitted rounds use the pre-assigned courses (§10.5).
     * Prevents players from submitting arbitrary course names that would corrupt
     * match records. Only validates when the match has pre-assigned courses;
     * matches created before this feature was deployed may have null assignedCourses.
     */
    if (match.assignedCourses && Array.isArray(match.assignedCourses) && Array.isArray(rounds)) {
      const assigned = match.assignedCourses as string[];
      const submittedCourses = (rounds as { course?: string; winner?: number }[])
        .map(r => r.course);
      const invalidCourses = submittedCourses.filter(
        (course, i) => course !== undefined && course !== assigned[i]
      );
      if (invalidCourses.length > 0) {
        return handleValidationError(
          "Submitted courses do not match the pre-assigned courses for this match",
          "rounds"
        );
      }
    }

    const reportingPlayerId = reportingPlayer === 1 ? match.player1Id : match.player2Id;

    /* Audit logging via shared helpers */
    await createScoreEntryLog(logger, {
      tournamentId, matchId, matchType: 'MR', playerId: reportingPlayerId,
      reportedData: { reportingPlayer, score1, score2 },
      clientIp, userAgent,
    });

    if (character) {
      await createCharacterUsageLog(logger, {
        matchId, matchType: 'MR', playerId: reportingPlayerId, character, tournamentId,
      });
    }

    /*
     * Optimistic locking: safely update reported scores.
     * Prevents race conditions when both players submit simultaneously.
     * Uses updateWithRetry directly with proper select clause to return match data needed for dual-report confirmation.
     */
    let result;
    try {
      result = await updateWithRetry(prisma, async (tx) => {
        const currentMatch = await tx.mRMatch.findUnique({
          where: { id: matchId },
          select: { version: true }
        });

        if (!currentMatch) {
          throw new Error("Match not found");
        }

        // Determine which player is reporting and update the appropriate reported score fields
        const updateData =
          reportingPlayer === 1
            ? { player1ReportedPoints1: score1, player1ReportedPoints2: score2, player1ReportedRaces: rounds, version: { increment: 1 } }
            : { player2ReportedPoints1: score1, player2ReportedPoints2: score2, player2ReportedRaces: rounds, version: { increment: 1 } };

        const updateResult = await tx.mRMatch.update({
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

    /* If dual report is disabled (default), immediately confirm the match.
     * Use updateWithRetry to prevent concurrent auto-confirm from overwriting. */
    if (!(await isDualReportEnabled(tournamentId))) {
      try {
        const finalMatch = await updateWithRetry(prisma, async (tx) =>
          tx.mRMatch.update({
            where: { id: matchId, version: result.version },
            data: { score1, score2, completed: true, version: { increment: 1 } },
            include: { player1: { select: PLAYER_AUTH_SELECT }, player2: { select: PLAYER_AUTH_SELECT } },
          })
        );
        await recalculatePlayerStats(MR_RECALC_CONFIG, tournamentId, finalMatch.player1Id);
        await recalculatePlayerStats(MR_RECALC_CONFIG, tournamentId, finalMatch.player2Id);
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

    /*
     * Auto-confirm when both players report matching scores and all races are complete.
     * In the 4-course format, a match is complete when score1 + score2 = TOTAL_MR_RACES (4).
     * This handles all outcomes: 4-0, 3-1, 2-2 (draw), 1-3, 0-4.
     * Previously this used `score1 >= 3 || score2 >= 3` (best-of-5 logic) which
     * would not auto-confirm 2-2 draws. The sum check correctly handles all cases.
     */
    if (score1 + score2 === TOTAL_MR_RACES) {
      const p1Score1 = result.player1ReportedPoints1;
      const p1Score2 = result.player1ReportedPoints2;
      const p2Score1 = result.player2ReportedPoints1;
      const p2Score2 = result.player2ReportedPoints2;

      if (p1Score1 !== null && p2Score1 !== null && p1Score1 === p2Score1 &&
          p1Score2 !== null && p2Score2 !== null && p1Score2 === p2Score2) {
        try {
          // Use the races from either player's report (they should be identical if scores match)
          const racesToUse = result.player1ReportedRaces || result.player2ReportedRaces;

          /*
           * Update the match record with the final scores.
           * Uses explicit field names (score1/score2) to ensure correct mapping
           * to the MRMatch schema. MR matches store final scores in score1/score2,
           * while GP matches use points1/points2 for driver points.
           *
           * Use result.version directly to avoid a race where concurrent
           * auto-confirm from the other player increments the version between
           * our findUnique and update, causing an unnecessary OptimisticLockError.
           */
          const completedMatch = await updateWithRetry(prisma, async (tx) => {
            const finalResult = await tx.mRMatch.update({
              where: { id: matchId, version: result.version },
              data: { score1: p1Score1, score2: p1Score2, rounds: racesToUse || [], completed: true, version: { increment: 1 } },
              include: { player1: { select: PLAYER_AUTH_SELECT }, player2: { select: PLAYER_AUTH_SELECT } },
            });

            if (!finalResult) {
              throw new OptimisticLockError('Match was updated by another user', result.version);
            }

            return finalResult;
          });

          await recalculatePlayerStats(MR_RECALC_CONFIG, tournamentId, completedMatch.player1Id);
          await recalculatePlayerStats(MR_RECALC_CONFIG, tournamentId, completedMatch.player2Id);

          return createSuccessResponse({
            match: completedMatch,
            autoConfirmed: true,
          }, "Scores confirmed and match completed");
        } catch (error) {
          return handleDatabaseError(error, "match completion");
        }
      }
    }

    /* Both reported but mismatch */
    if (result.player1ReportedPoints1 !== null && result.player1ReportedPoints2 !== null &&
        result.player2ReportedPoints1 !== null && result.player2ReportedPoints2 !== null) {
      return createSuccessResponse({
        match: result,
        mismatch: true,
        player1Report: { score1: result.player1ReportedPoints1, score2: result.player1ReportedPoints2 },
        player2Report: { score1: result.player2ReportedPoints1, score2: result.player2ReportedPoints2 },
      }, "Score reported but mismatch detected - awaiting admin review");
    }

    return createSuccessResponse({
      match: result,
      waitingFor: reportingPlayer === 1 ? "player2" : "player1",
    }, "Score reported successfully");
  } catch (error) {
    logger.error("Failed to report score", { error, tournamentId, matchId });
    return handleDatabaseError(error, "score report");
  }
}
