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
 * - Tournament token or session-based authorization
 * - Input sanitization and validation
 * - Optimistic locking to prevent race conditions
 * - Score entry logging for audit trail
 * - Character usage tracking
 */

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

/**
 * POST /api/tournaments/[id]/bm/match/[matchId]/report
 *
 * Report score from a player's perspective. Supports multiple authorization methods:
 * 1. Tournament token (for non-authenticated participants)
 * 2. Admin session (full access)
 * 3. Player session (restricted to own matches)
 * 4. OAuth-linked player session
 *
 * Request body:
 * {
 *   reportingPlayer: 1 | 2;   - Which player position is reporting
 *   score1: number;            - Rounds won by player 1
 *   score2: number;            - Rounds won by player 2
 *   character?: string;        - Optional: SMK character used
 * }
 *
 * @param request - NextRequest object
 * @param params - Route parameters containing tournamentId and matchId
 * @returns Response with score report status, auto-confirm result, or mismatch flag
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; matchId: string }> }
) {
  /* Logger must be created inside the function for proper test mocking */
  const logger = createLogger('bm-score-report-api');
  const { id: tournamentId, matchId } = await params;

  try {
    /* Apply rate limiting based on client IP to prevent abuse */
    const clientIp = getClientIdentifier(request);

    const rateLimitResult = await rateLimit(clientIp, RATE_LIMIT_SCORE_INPUT, RATE_LIMIT_SCORE_INPUT_DURATION);
    if (!rateLimitResult.success) {
      return handleRateLimitError(rateLimitResult.retryAfter);
    }

    /* Sanitize input to prevent XSS and injection attacks */
    const body = sanitizeInput(await request.json());
    const { reportingPlayer, score1, score2, character } = body;

    /* Validate character selection against the official SMK character roster */
    if (character && !SMK_CHARACTERS.includes(character as typeof SMK_CHARACTERS[number])) {
      return handleValidationError("Invalid character", "character");
    }

    /* Fetch the match to verify it exists and check player assignments */
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

    /* Prevent score reports on already completed matches */
    if (match.completed) {
      return handleValidationError("Match already completed", "matchStatus");
    }

    /*
     * Multi-method authorization check.
     * The system supports three authorization paths:
     * 1. Tournament token - for link-based participant access
     * 2. Admin session - full admin override capability
     * 3. Player session - players can only report their own matches
     */
    let isAuthorized = false;
    const session = await auth();

    /* Path 1: Tournament token authorization */
    const tokenValidation = await validateTournamentToken(request, tournamentId);
    if (tokenValidation.tournament) {
      isAuthorized = true;
    }

    /* Path 2 & 3: Session-based authorization */
    if (session?.user?.id) {
      const userType = session.user.userType;

      if (userType === 'admin' && session.user.role === 'admin') {
        /* Admins have unrestricted access to report scores */
        isAuthorized = true;
      } else if (userType === 'player') {
        /* Direct player login - verify they are a participant in this match */
        const playerId = session.user.playerId;
        if (reportingPlayer === 1 && match.player1Id === playerId) {
          isAuthorized = true;
        }
        if (reportingPlayer === 2 && match.player2Id === playerId) {
          isAuthorized = true;
        }
      } else {
        /* OAuth-linked player - check via userId on the player record */
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

    /* Validate the reportingPlayer field is either 1 or 2 */
    if (reportingPlayer !== 1 && reportingPlayer !== 2) {
      return handleValidationError("Invalid reporting player", "reportingPlayer");
    }

    /* Validate scores using centralized BM score validation rules */
    const scoreValidation = validateBattleModeScores(score1, score2);
    if (!scoreValidation.isValid) {
      return handleValidationError(scoreValidation.error || "Invalid scores", "scores");
    }

    /* Resolve the reporting player's ID for logging purposes */
    const reportingPlayerId = reportingPlayer === 1 ? match.player1Id : match.player2Id;

    /* Create a score entry log for audit trail and dispute resolution */
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
      /* Score entry log failure is non-critical but should be logged for debugging */
      logger.warn('Failed to create score entry log', { error: logError, tournamentId, matchId, playerId: reportingPlayerId });
    }

    /* Log character usage if a character selection was provided */
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
        /* Character usage log failure is non-critical but should be logged for debugging */
        logger.warn('Failed to create character usage log', { error: charError, tournamentId, matchId, playerId: reportingPlayerId, character });
      }
    }

    /*
     * Use optimistic locking with retry to safely update reported scores.
     * This prevents race conditions when both players submit simultaneously.
     * The updateWithRetry wrapper will automatically retry on version conflicts.
     */
    let result;
    try {
      result = await updateWithRetry(prisma, async (tx) => {
        /* Get fresh version for this attempt */
        const currentMatch = await tx.bMMatch.findUnique({
          where: { id: matchId },
          select: { version: true }
        });

        if (!currentMatch) {
          throw new Error("Match not found");
        }

        /*
         * Store the reported scores in the appropriate player columns.
         * Player 1 and Player 2 have separate reported score fields to
         * enable the dual-confirmation system.
         */
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

    /*
     * Check if both players have now reported and their scores agree.
     * If scores match, auto-confirm the match and update standings.
     */
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
        /*
         * Scores match - auto-confirm the match result.
         * Use optimistic locking again for the confirmation update to
         * prevent double-confirmation race conditions.
         */
        const finalMatch = await updateWithRetry(prisma, async (tx) => {
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

        /* Recalculate qualification standings for both players after match completion */
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

    /*
     * If both players reported but scores don't match, flag for admin review.
     * This is a common scenario in competitive play and requires manual resolution.
     */
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

    /* Only one player has reported so far - waiting for the other */
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
 * Recalculate all aggregate statistics for a player in a tournament.
 *
 * This function fetches ALL completed qualification matches for the given player
 * and recomputes their stats from scratch. This full-recalculation approach avoids
 * bugs that can arise from incremental stat updates (e.g., when a match result is
 * edited after initial entry).
 *
 * Stats calculated:
 * - mp (matches played), wins, ties, losses
 * - winRounds, lossRounds (total rounds won/lost)
 * - points (round differential = winRounds - lossRounds)
 * - score (match points: 2*wins + 1*ties)
 *
 * @param tournamentId - ID of the tournament
 * @param playerId - ID of the player to recalculate stats for
 */
async function recalculatePlayerStats(tournamentId: string, playerId: string) {
  /* Fetch all completed qualification matches involving this player */
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

  /* Iterate through all matches and accumulate stats */
  for (const m of matches) {
    stats.mp++;
    const isPlayer1 = m.player1Id === playerId;
    const myScore = isPlayer1 ? m.score1 : m.score2;
    const oppScore = isPlayer1 ? m.score2 : m.score1;
    stats.winRounds += myScore;
    stats.lossRounds += oppScore;

    /* Use calculateMatchResult to determine win/tie/loss consistently */
    const { result1 } = calculateMatchResult(
      isPlayer1 ? m.score1 : m.score2,
      isPlayer1 ? m.score2 : m.score1
    );

    if (result1 === "win") stats.wins++;
    else if (result1 === "loss") stats.losses++;
    else stats.ties++;
  }

  /* Match-level score: 2 points per win, 1 per tie, 0 per loss */
  const score = stats.wins * 2 + stats.ties;

  /* Persist the recalculated stats to the qualification record */
  await prisma.bMQualification.updateMany({
    where: { tournamentId, playerId },
    data: {
      ...stats,
      points: stats.winRounds - stats.lossRounds,
      score,
    },
  });
}
