import { NextRequest } from "next/server";

import { rateLimit, getClientIdentifier } from "@/lib/rate-limit";
import {
  createErrorResponse,
  createSuccessResponse,
  handleValidationError,
  handleAuthError,
  handleRateLimitError,
  handleDatabaseError
} from "@/lib/error-handling";
import { sanitizeInput } from "@/lib/sanitize";
import { validateTournamentToken } from "@/lib/token-validation";
import { updateWithRetry, OptimisticLockError } from "@/lib/optimistic-locking";
import { validateBattleModeScores, calculateMatchResult } from "@/lib/score-validation";
import {
  RATE_LIMIT_SCORE_INPUT,
  RATE_LIMIT_SCORE_INPUT_DURATION,
  SMK_CHARACTERS
} from "@/lib/constants";

import prisma from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { createLogger } from "@/lib/logger";

// Initialize logger for structured logging
const logger = createLogger('bm-score-report-api');

/**
 * POST - Report score from a player
 * Allows players to self-report their match scores with optimistic locking and validation
 * @param request - NextRequest object
 * @param params - Route parameters containing tournamentId and matchId
 * @returns Response with score report status
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; matchId: string }> }
) {
  const { id: tournamentId, matchId } = await params;
  try {
    const clientIp = getClientIdentifier(request);

    const rateLimitResult = await rateLimit(clientIp, RATE_LIMIT_SCORE_INPUT, RATE_LIMIT_SCORE_INPUT_DURATION);
    if (!rateLimitResult.success) {
      return handleRateLimitError(rateLimitResult.retryAfter);
    }

    const body = sanitizeInput(await request.json());
    const { reportingPlayer, score1, score2, character } = body;

    // Validate character if provided
    if (character && !SMK_CHARACTERS.includes(character as typeof SMK_CHARACTERS[number])) {
      return handleValidationError("Invalid character", "character");
    }

    // Get match first to check players
    const match = await prisma.bMMatch.findUnique({
      where: { id: matchId },
      include: {
        player1: true,
        player2: true,
      },
    });

    if (!match) {
      return handleValidationError("Match not found", "matchId");
    }

    if (match.completed) {
      return handleValidationError("Match already completed", "matchStatus");
    }

    // Check authorization
    let isAuthorized = false;
    const session = await auth();

    // 1. Tournament token
    const tokenValidation = await validateTournamentToken(request, tournamentId);
    if (tokenValidation.tournament) {
      isAuthorized = true;
    }

    // 2. Authenticated user
    if (session?.user?.id) {
      const userType = session.user.userType;

      if (userType === 'admin' && session.user.role === 'admin') {
        isAuthorized = true;
      } else if (userType === 'player') {
        const playerId = session.user.playerId;
        if (reportingPlayer === 1 && match.player1Id === playerId) {
          isAuthorized = true;
        }
        if (reportingPlayer === 2 && match.player2Id === playerId) {
          isAuthorized = true;
        }
      } else {
        // OAuth linked player
        if (reportingPlayer === 1 && match.player1.userId === session.user.id) {
          isAuthorized = true;
        }
        if (reportingPlayer === 2 && match.player2.userId === session.user.id) {
          isAuthorized = true;
        }
      }
    }

    if (!isAuthorized) {
      return handleAuthError('Unauthorized: Invalid token or not authorized for this match');
    }

    // Validate input
    if (reportingPlayer !== 1 && reportingPlayer !== 2) {
      return handleValidationError("Invalid reporting player", "reportingPlayer");
    }

    // Validate scores using centralized validation
    const scoreValidation = validateBattleModeScores(score1, score2);
    if (!scoreValidation.isValid) {
      return handleValidationError(scoreValidation.error || "Invalid scores", "scores");
    }

    // Determine player ID for logging
    const reportingPlayerId = reportingPlayer === 1 ? match.player1Id : match.player2Id;

    // Create score entry log
    try {
      await prisma.scoreEntryLog.create({
        data: {
          tournamentId,
          matchId,
          matchType: 'BM',
          playerId: reportingPlayerId,
          reportedData: {
            reportingPlayer,
            score1,
            score2
          },
          ipAddress: clientIp,
          userAgent: request.headers.get('user-agent') || 'unknown',
        },
      });
    } catch (logError) {
      // Score entry log failure is non-critical but should be logged for debugging
      logger.warn('Failed to create score entry log', { error: logError, tournamentId, matchId, playerId: reportingPlayerId });
    }

    // Log character usage if character is provided
    if (character) {
      try {
        await prisma.matchCharacterUsage.create({
          data: {
            matchId,
            matchType: 'BM',
            playerId: reportingPlayerId,
            character,
          },
        });
      } catch (charError) {
        // Character usage log failure is non-critical but should be logged for debugging
        logger.warn('Failed to create character usage log', { error: charError, tournamentId, matchId, playerId: reportingPlayerId, character });
      }
    }

    // Use optimistic locking to prevent race conditions
    let result;
    try {
      result = await updateWithRetry(prisma, async (tx) => {
        // Get fresh version for this attempt
        const currentMatch = await tx.bMMatch.findUnique({
          where: { id: matchId },
          select: { version: true }
        });

        if (!currentMatch) {
          throw new Error("Match not found");
        }

        // Update reported scores with version check
        const updateData =
          reportingPlayer === 1
            ? {
              player1ReportedScore1: score1,
              player1ReportedScore2: score2,
              version: { increment: 1 },
            }
            : {
              player2ReportedScore1: score1,
              player2ReportedScore2: score2,
              version: { increment: 1 },
            };

        const updateResult = await tx.bMMatch.update({
          where: {
            id: matchId,
            version: currentMatch.version,
          },
          data: updateData,
          select: {
            id: true,
            player1ReportedScore1: true,
            player1ReportedScore2: true,
            player2ReportedScore1: true,
            player2ReportedScore2: true,
            completed: true,
            version: true,
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
          409,
          "OPTIMISTIC_LOCK_ERROR",
          { requiresRefresh: true }
        );
      }
      return handleDatabaseError(error, "score report update");
    }

    // Check if both players have reported and scores match
    const p1s1 = result?.player1ReportedScore1;
    const p1s2 = result?.player1ReportedScore2;
    const p2s1 = result?.player2ReportedScore1;
    const p2s2 = result?.player2ReportedScore2;

    if (
      p1s1 !== null &&
      p1s2 !== null &&
      p2s1 !== null &&
      p2s2 !== null &&
      p1s1 === p2s1 &&
      p1s2 === p2s2
    ) {
      try {
        // Scores match - auto-confirm and update qualifications with optimistic locking
        const finalMatch = await updateWithRetry(prisma, async (tx) => {
          // Get fresh version for this attempt
          const currentMatch = await tx.bMMatch.findUnique({
            where: { id: matchId },
            select: { version: true }
          });

          if (!currentMatch) {
            throw new Error("Match not found");
          }

          const finalResult = await tx.bMMatch.update({
            where: {
              id: matchId,
              version: currentMatch.version,
            },
            data: {
              score1: p1s1,
              score2: p1s2,
              completed: true,
              version: { increment: 1 },
            },
            include: { player1: true, player2: true },
          });

          if (!finalResult) {
            throw new OptimisticLockError('Match was updated by another user', currentMatch.version);
          }

          return finalResult;
        });

        // Recalculate qualifications for both players
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

    // If both reported but don't match, flag for admin review
    if (
      p1s1 !== null &&
      p1s2 !== null &&
      p2s1 !== null &&
      p2s2 !== null
    ) {
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
    // Use structured logging for error tracking and debugging
    logger.error("Failed to report score", { error, tournamentId, matchId });
    return handleDatabaseError(error, "score report");
  }
}

/**
 * Recalculate player statistics after match completion
 * @param tournamentId - ID of tournament
 * @param playerId - ID of player to recalculate stats for
 */
async function recalculatePlayerStats(tournamentId: string, playerId: string) {
  const matches = await prisma.bMMatch.findMany({
    where: {
      tournamentId,
      stage: "qualification",
      completed: true,
      OR: [{ player1Id: playerId }, { player2Id: playerId }],
    },
  });

  const stats = {
    mp: 0,
    wins: 0,
    ties: 0,
    losses: 0,
    winRounds: 0,
    lossRounds: 0,
  };

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
    data: {
      ...stats,
      points: stats.winRounds - stats.lossRounds,
      score,
    },
  });
}