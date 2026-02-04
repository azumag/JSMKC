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
 * - Rate limiting to prevent abuse
 * - Session-based authorization (admin, player, or OAuth-linked player)
 * - Input sanitization and validation
 * - Optimistic locking to prevent race conditions
 * - Score entry logging for audit trail
 * - Character usage tracking
 */

import { NextRequest } from "next/server";

// Rate limiting removed — internal tournament tool with few concurrent users
import {
  createErrorResponse,
  createSuccessResponse,
  handleValidationError,
  handleAuthError,
  handleDatabaseError
} from "@/lib/error-handling";
import { sanitizeInput } from "@/lib/sanitize";
import { updateWithRetry, OptimisticLockError } from "@/lib/optimistic-locking";
import { validateBattleModeScores, calculateMatchResult } from "@/lib/score-validation";
import {
  checkScoreReportAuth,
  createScoreEntryLog,
  createCharacterUsageLog,
  validateCharacter,
} from "@/lib/api-factories/score-report-helpers";

import prisma from "@/lib/prisma";
import { createLogger } from "@/lib/logger";

/**
 * POST /api/tournaments/[id]/bm/match/[matchId]/report
 *
 * Report score from a player's perspective. Supports multiple authorization methods:
 * 1. Admin session (full access)
 * 2. Player session (restricted to own matches)
 * 3. OAuth-linked player session
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; matchId: string }> }
) {
  const logger = createLogger('bm-score-report-api');
  const { id: tournamentId, matchId } = await params;

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

    /* Multi-method authorization check */
    const isAuthorized = await checkScoreReportAuth(request, tournamentId, reportingPlayer, match);
    if (!isAuthorized) {
      return handleAuthError('Unauthorized: Not authorized for this match');
    }

    if (reportingPlayer !== 1 && reportingPlayer !== 2) {
      return handleValidationError("Invalid reporting player", "reportingPlayer");
    }

    /* BM-specific score validation */
    const scoreValidation = validateBattleModeScores(score1, score2);
    if (!scoreValidation.isValid) {
      return handleValidationError(scoreValidation.error || "Invalid scores", "scores");
    }

    const reportingPlayerId = reportingPlayer === 1 ? match.player1Id : match.player2Id;

    /* Audit logging via shared helpers */
    await createScoreEntryLog(logger, {
      tournamentId, matchId, matchType: 'BM', playerId: reportingPlayerId,
      reportedData: { reportingPlayer, score1, score2 },
      clientIp: request.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown',
      userAgent: request.headers.get('user-agent') || 'unknown',
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

        await recalculatePlayerStats(tournamentId, finalMatch.player1Id);
        await recalculatePlayerStats(tournamentId, finalMatch.player2Id);

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

/**
 * Recalculate BM qualification stats for a player.
 * BM-specific: tracks winRounds/lossRounds and round differential.
 */
async function recalculatePlayerStats(tournamentId: string, playerId: string) {
  const matches = await prisma.bMMatch.findMany({
    where: {
      tournamentId, stage: "qualification", completed: true,
      OR: [{ player1Id: playerId }, { player2Id: playerId }],
    },
  });

  const stats = { mp: 0, wins: 0, ties: 0, losses: 0, winRounds: 0, lossRounds: 0 };

  for (const m of matches) {
    stats.mp++;
    const isPlayer1 = m.player1Id === playerId;
    const myScore = isPlayer1 ? m.score1 : m.score2;
    const oppScore = isPlayer1 ? m.score2 : m.score1;
    stats.winRounds += myScore;
    stats.lossRounds += oppScore;

    const { result1 } = calculateMatchResult(
      isPlayer1 ? m.score1 : m.score2,
      isPlayer1 ? m.score2 : m.score1
    );

    if (result1 === "win") stats.wins++;
    else if (result1 === "loss") stats.losses++;
    else stats.ties++;
  }

  const score = stats.wins * 2 + stats.ties;

  await prisma.bMQualification.updateMany({
    where: { tournamentId, playerId },
    data: { ...stats, points: stats.winRounds - stats.lossRounds, score },
  });
}
