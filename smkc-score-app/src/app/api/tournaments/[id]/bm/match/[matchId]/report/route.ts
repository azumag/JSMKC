/**
 * Battle Mode Score Report API Route
 *
 * Handles player self-reporting of match scores. This is the primary endpoint
 * used by tournament participants to report their BM match results.
 *
 * The dual-report confirmation system works as follows:
 * 1. Player 1 reports their score -> stored as player1ReportedScore1/Score2
 * 2. Player 2 reports their score -> stored as player2ReportedScore1/Score2
 * 3. If both reports match -> match is auto-confirmed and completed
 * 4. If reports differ -> flagged for admin review (mismatch)
 *
 * Security features:
 * - Session-based authorization (admin or player)
 * - Input sanitization and validation
 * - Optimistic locking to prevent race conditions
 * - Score entry logging for audit trail
 * - Character usage tracking
 */

import { NextRequest } from "next/server";

import {
  createErrorResponse,
  createSuccessResponse,
  handleValidationError,
  handleAuthError,
  handleDatabaseError,
  handleRateLimitError,
} from "@/lib/error-handling";
import { checkRateLimit } from "@/lib/rate-limit";
import { sanitizeInput } from "@/lib/sanitize";
import { updateWithRetry, OptimisticLockError } from "@/lib/optimistic-locking";
import { validateBattleModeScores, calculateMatchResult } from "@/lib/score-validation";
import { getUserAgent, getClientIdentifier } from "@/lib/request-utils";
import {
  checkScoreReportAuth,
  createScoreEntryLog,
  createCharacterUsageLog,
  isDualReportEnabled,
  validateCharacter,
  recalculatePlayerStats,
  type RecalculateStatsConfig,
} from "@/lib/api-factories/score-report-helpers";

import prisma from "@/lib/prisma";
import { createLogger } from "@/lib/logger";
import { resolveTournamentId } from "@/lib/tournament-identifier";

/**
 * BM-specific stats recalculation config.
 * Uses calculateMatchResult() for win/loss/tie determination (handles BM's sum=4 constraint).
 * Tracks round differential (winRounds - lossRounds) as the `points` field.
 */
const BM_RECALC_CONFIG: RecalculateStatsConfig = {
  matchModel: 'bMMatch',
  qualificationModel: 'bMQualification',
  scoreFields: { p1: 'score1', p2: 'score2' },
  determineResult: (myScore, oppScore) => {
    const { result1 } = calculateMatchResult(myScore, oppScore);
    return result1;
  },
  useRoundDifferential: true,
};

/**
 * POST /api/tournaments/[id]/bm/match/[matchId]/report
 *
 * Report score from a player's perspective. Supports:
 * 1. Admin session (full access)
 * 2. Player session (restricted to own matches)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; matchId: string }> }
) {
  const logger = createLogger('bm-score-report-api');
  const { id, matchId } = await params;
  const tournamentId = await resolveTournamentId(id);

  /* Rate limit: prevent abuse on score report endpoint */
  const clientIp = getClientIdentifier(request);
  const rateResult = await checkRateLimit('scoreInput', clientIp);
  if (!rateResult.success) {
    return handleRateLimitError(rateResult.retryAfter);
  }

  try {
    const body = sanitizeInput(await request.json());
    const { reportingPlayer, score1, score2, character } = body;

    /* Validate character selection */
    if (!validateCharacter(character)) {
      return handleValidationError("Invalid character", "character");
    }

    /* Fetch match and verify existence */
    const match = await prisma.bMMatch.findUnique({
      where: { id: matchId },
      include: { player1: true, player2: true },
    });

    if (!match) {
      return handleValidationError("Match not found", "matchId");
    }

    /* Prevent reports on completed matches (checked before auth) */
    if (match.completed) {
      return handleValidationError("Match already completed", "matchStatus");
    }

    /* Validate reportingPlayer before auth check to prevent invalid values propagating */
    if (reportingPlayer !== 1 && reportingPlayer !== 2) {
      return handleValidationError("reportingPlayer must be 1 or 2", "reportingPlayer");
    }

    /* Multi-method authorization check */
    const isAuthorized = await checkScoreReportAuth(request, tournamentId, reportingPlayer, match);
    if (!isAuthorized) {
      return handleAuthError('Unauthorized: Not authorized for this match');
    }

    /* BM-specific score validation */
    const scoreValidation = validateBattleModeScores(score1, score2);
    if (!scoreValidation.isValid) {
      return handleValidationError(scoreValidation.error || "Invalid scores", "scores");
    }

    const reportingPlayerId = reportingPlayer === 1 ? match.player1Id : match.player2Id;
    const userAgent = getUserAgent(request);

    /* Audit logging via shared helpers */
    await createScoreEntryLog(logger, {
      tournamentId, matchId, matchType: 'BM', playerId: reportingPlayerId,
      reportedData: { reportingPlayer, score1, score2 },
      clientIp, userAgent,
    });

    if (character) {
      await createCharacterUsageLog(logger, {
        matchId, matchType: 'BM', playerId: reportingPlayerId, character, tournamentId,
      });
    }

    /*
     * Optimistic locking: safely update reported scores.
     * Prevents race conditions when both players submit simultaneously.
     */
    let result;
    try {
      result = await updateWithRetry(prisma, async (tx) => {
        const currentMatch = await tx.bMMatch.findUnique({
          where: { id: matchId },
          select: { version: true }
        });

        if (!currentMatch) {
          throw new Error("Match not found");
        }

        const updateData =
          reportingPlayer === 1
            ? { player1ReportedScore1: score1, player1ReportedScore2: score2, version: { increment: 1 } }
            : { player2ReportedScore1: score1, player2ReportedScore2: score2, version: { increment: 1 } };

        const updateResult = await tx.bMMatch.update({
          where: { id: matchId, version: currentMatch.version },
          data: updateData,
          select: {
            id: true,
            player1ReportedScore1: true, player1ReportedScore2: true,
            player2ReportedScore1: true, player2ReportedScore2: true,
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
        const finalMatch = await updateWithRetry(prisma, async (tx) => {
          const currentMatch = await tx.bMMatch.findUnique({
            where: { id: matchId },
            select: { version: true },
          });
          if (!currentMatch) throw new Error("Match not found");
          return tx.bMMatch.update({
            where: { id: matchId, version: currentMatch.version },
            data: { score1, score2, completed: true, version: { increment: 1 } },
            include: { player1: true, player2: true },
          });
        });
        await recalculatePlayerStats(BM_RECALC_CONFIG, tournamentId, finalMatch.player1Id);
        await recalculatePlayerStats(BM_RECALC_CONFIG, tournamentId, finalMatch.player2Id);
        return createSuccessResponse({ match: finalMatch, autoConfirmed: true },
          "Score confirmed (dual report disabled)");
      } catch (error) {
        return handleDatabaseError(error, "match completion");
      }
    }

    /* Check dual-report: auto-confirm or flag mismatch */
    const p1s1 = result?.player1ReportedScore1;
    const p1s2 = result?.player1ReportedScore2;
    const p2s1 = result?.player2ReportedScore1;
    const p2s2 = result?.player2ReportedScore2;

    if (
      p1s1 !== null && p1s2 !== null && p2s1 !== null && p2s2 !== null &&
      p1s1 === p2s1 && p1s2 === p2s2
    ) {
      try {
        const finalMatch = await updateWithRetry(prisma, async (tx) => {
          const currentMatch = await tx.bMMatch.findUnique({
            where: { id: matchId },
            select: { version: true }
          });

          if (!currentMatch) {
            throw new Error("Match not found");
          }

          const finalResult = await tx.bMMatch.update({
            where: { id: matchId, version: currentMatch.version },
            data: { score1: p1s1, score2: p1s2, completed: true, version: { increment: 1 } },
            include: { player1: true, player2: true },
          });

          if (!finalResult) {
            throw new OptimisticLockError('Match was updated by another user', currentMatch.version);
          }

          return finalResult;
        });

        await recalculatePlayerStats(BM_RECALC_CONFIG, tournamentId, finalMatch.player1Id);
        await recalculatePlayerStats(BM_RECALC_CONFIG, tournamentId, finalMatch.player2Id);

        return createSuccessResponse({
          match: finalMatch,
          autoConfirmed: true,
        }, "Scores confirmed and match completed");
      } catch (error) {
        return handleDatabaseError(error, "match completion");
      }
    }

    /* Both reported but mismatch */
    if (p1s1 !== null && p1s2 !== null && p2s1 !== null && p2s2 !== null) {
      return createSuccessResponse({
        match: result!,
        mismatch: true,
        player1Report: { score1: p1s1, score2: p1s2 },
        player2Report: { score1: p2s1, score2: p2s2 },
      }, "Score reported but mismatch detected - awaiting admin review");
    }

    return createSuccessResponse({
      match: result!,
      waitingFor: reportingPlayer === 1 ? "player2" : "player1",
    }, "Score reported successfully");
  } catch (error) {
    logger.error("Failed to report score", { error, tournamentId, matchId });
    return handleDatabaseError(error, "score report");
  }
}
