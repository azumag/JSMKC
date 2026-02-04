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
 * 3. OAuth-linked player (matched by userId)
 *
 * Security features:
 * - Session-based authorization (admin, player, or OAuth-linked player)
 * - Input sanitization and validation
 * - Optimistic locking to prevent race conditions
 * - Score entry logging for audit trail
 * - Character usage tracking
 */

import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { getUserAgent, getClientIdentifier } from "@/lib/request-utils";
import { sanitizeInput } from "@/lib/sanitize";
import { createLogger } from "@/lib/logger";
import {
  checkScoreReportAuth,
  createScoreEntryLog,
  createCharacterUsageLog,
  validateCharacter,
} from "@/lib/api-factories/score-report-helpers";
import {
  createErrorResponse,
  createSuccessResponse,
  handleValidationError,
  handleAuthError,
  handleDatabaseError
} from "@/lib/error-handling";
import { updateWithRetry, OptimisticLockError } from "@/lib/optimistic-locking";

/**
 * POST /api/tournaments/[id]/mr/match/[matchId]/report
 *
 * Submit a participant's score report for an MR match.
 * Both players report independently; when reports match,
 * the match is automatically confirmed.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; matchId: string }> }
) {
  const logger = createLogger('mr-score-report-api');
  const { id: tournamentId, matchId } = await params;
  try {
    const clientIp = getClientIdentifier(request);
    const userAgent = getUserAgent(request);

    const body = sanitizeInput(await request.json());
    const { reportingPlayer, score1, score2, rounds, character } = body;

    /* Validate character selection */
    if (!validateCharacter(character)) {
      return handleValidationError("Invalid character", "character");
    }

    /* Fetch match */
    const match = await prisma.mRMatch.findUnique({
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

    /* Validate required fields */
    if (!reportingPlayer || score1 === undefined || score2 === undefined) {
      return handleValidationError("reportingPlayer, score1, and score2 are required", "requiredFields");
    }

    if (reportingPlayer !== 1 && reportingPlayer !== 2) {
      return handleValidationError("reportingPlayer must be 1 or 2", "reportingPlayer");
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

    /*
     * Auto-confirm when both players report matching scores
     * and the match has a definitive winner (score >= 3).
     */
    if (score1 >= 3 || score2 >= 3) {
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
           */
          const completedMatch = await updateWithRetry(prisma, async (tx) => {
            const currentMatch = await tx.mRMatch.findUnique({
              where: { id: matchId },
              select: { version: true }
            });

            if (!currentMatch) {
              throw new Error("Match not found");
            }

            const finalResult = await tx.mRMatch.update({
              where: { id: matchId, version: currentMatch.version },
              data: { score1: p1Score1, score2: p1Score2, rounds: racesToUse || [], completed: true, version: { increment: 1 } },
              include: { player1: true, player2: true },
            });

            if (!finalResult) {
              throw new OptimisticLockError('Match was updated by another user', currentMatch.version);
            }

            return finalResult;
          });

          await recalculatePlayerStats(tournamentId, completedMatch.player1Id);
          await recalculatePlayerStats(tournamentId, completedMatch.player2Id);

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

/**
 * Recalculate MR qualification stats for a player.
 * MR-specific: tracks winRounds/lossRounds and round differential.
 *
 * Reads from the match's final score fields (score1/score2) which are set
 * when both players report matching scores. Uses correct field names
 * per MRMatch schema, which differs from GPMatch (points1/points2).
 */
async function recalculatePlayerStats(tournamentId: string, playerId: string) {
  const matches = await prisma.mRMatch.findMany({
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

    if (myScore > oppScore) stats.wins++;
    else if (myScore < oppScore) stats.losses++;
    else stats.ties++;
  }

  const score = stats.wins * 2 + stats.ties;

  await prisma.mRQualification.updateMany({
    where: { tournamentId, playerId },
    data: { ...stats, points: stats.winRounds - stats.lossRounds, score },
  });
}
