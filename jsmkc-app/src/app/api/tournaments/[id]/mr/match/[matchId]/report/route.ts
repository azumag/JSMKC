/**
 * Match Race Score Report API Route
 *
 * Allows participants to self-report their MR match scores.
 * Both players must independently report matching scores for
 * the match to be automatically confirmed.
 *
 * Authorization supports three methods:
 * 1. Tournament token (for anonymous participant access)
 * 2. Player account (matched by playerId in session)
 * 3. OAuth-linked player (matched by userId)
 *
 * Rate limited to 10 requests per minute per client IP.
 * Includes character usage tracking for post-tournament statistics.
 */

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { rateLimit, getClientIdentifier, getUserAgent } from "@/lib/rate-limit";
import { sanitizeInput } from "@/lib/sanitize";
import { validateTournamentToken } from "@/lib/token-validation";
import { auth } from "@/lib/auth";
import { SMK_CHARACTERS } from "@/lib/constants";
import { createAuditLog } from "@/lib/audit-log";
import { createLogger } from "@/lib/logger";

/**
 * POST /api/tournaments/[id]/mr/match/[matchId]/report
 *
 * Submit a participant's score report for an MR match.
 * Both players report independently; when reports match,
 * the match is automatically confirmed.
 *
 * Body:
 * - reportingPlayer: 1 or 2 (which player is reporting)
 * - score1: Player 1's race wins
 * - score2: Player 2's race wins
 * - rounds: Array of race details (optional)
 * - character: SMK character used (optional, for stats)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; matchId: string }> }
) {
  /* Logger must be created inside the function for proper test mocking */
  const logger = createLogger('mr-score-report-api');
  const { id: tournamentId, matchId } = await params;
  try {
    /* Extract client info for rate limiting and audit logging */
    const clientIp = getClientIdentifier(request);
    const userAgent = getUserAgent(request);

    /* Rate limit: 10 score reports per minute per IP to prevent abuse */
    const rateLimitResult = await rateLimit(clientIp, 10, 60 * 1000);
    if (!rateLimitResult.success) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        { status: 429 }
      );
    }

    const body = sanitizeInput(await request.json());
    const { reportingPlayer, score1, score2, rounds, character } = body;

    /* Validate character against allowed SMK character list if provided */
    if (character && !SMK_CHARACTERS.includes(character as typeof SMK_CHARACTERS[number])) {
      return NextResponse.json({ error: "Invalid character" }, { status: 400 });
    }

    /* Fetch the match to verify existence and check player assignments */
    const match = await prisma.mRMatch.findUnique({
      where: { id: matchId },
      include: {
        player1: true,
        player2: true,
      },
    });

    if (!match) {
      return NextResponse.json(
        { error: "Match not found" },
        { status: 404 }
      );
    }

    /*
     * Authorization check: supports three methods
     * 1. Tournament token - any holder can report
     * 2. Player session - must match the reporting player
     * 3. OAuth-linked user - userId must match player's linked account
     */
    let isAuthorized = false;
    const session = await auth();

    /* Method 1: Tournament token validation */
    const tokenValidation = await validateTournamentToken(request, tournamentId);
    if (tokenValidation.tournament) {
      isAuthorized = true;
    }

    /* Method 2 & 3: Session-based authorization */
    if (session?.user?.id) {
      const userType = session.user.userType;

      if (userType === 'admin' && session.user.role === 'admin') {
        /* Admins can report any score */
        isAuthorized = true;
      } else if (userType === 'player') {
        /* Player accounts must match the reporting player position */
        const playerId = session.user.playerId;
        if (reportingPlayer === 1 && match.player1Id === playerId) {
          isAuthorized = true;
        }
        if (reportingPlayer === 2 && match.player2Id === playerId) {
          isAuthorized = true;
        }
      } else {
        /* OAuth-linked players: check userId on player records */
        if (reportingPlayer === 1 && match.player1.userId === session.user.id) {
          isAuthorized = true;
        }
        if (reportingPlayer === 2 && match.player2.userId === session.user.id) {
          isAuthorized = true;
        }
      }
    }

    if (!isAuthorized) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized: Invalid token or not authorized for this match' },
        { status: 401 }
      );
    }

    /* Validate required score fields */
    if (!reportingPlayer || score1 === undefined || score2 === undefined) {
      return NextResponse.json(
        { error: "reportingPlayer, score1, and score2 are required" },
        { status: 400 }
      );
    }

    if (reportingPlayer !== 1 && reportingPlayer !== 2) {
      return NextResponse.json(
        { error: "reportingPlayer must be 1 or 2" },
        { status: 400 }
      );
    }

    /* Identify the reporting player for logging purposes */
    const reportingPlayerId = reportingPlayer === 1 ? match.player1Id : match.player2Id;

    /* Create score entry log for audit trail (non-critical) */
    try {
      await prisma.scoreEntryLog.create({
        data: {
          tournamentId,
          matchId,
          matchType: 'MR',
          playerId: reportingPlayerId,
          reportedData: {
            reportingPlayer,
            score1,
            score2
          },
          ipAddress: clientIp,
          userAgent: userAgent,
        },
      });
    } catch (logError) {
      /* Score entry log failure is non-critical but should be logged for debugging */
      logger.warn('Failed to create score entry log', { error: logError, tournamentId, matchId, playerId: reportingPlayerId });
    }

    /* Track character usage if character is provided (for tournament statistics) */
    if (character) {
      try {
        await prisma.matchCharacterUsage.create({
          data: {
            matchId,
            matchType: 'MR',
            playerId: reportingPlayerId,
            character,
          },
        });
      } catch (charError) {
        /* Character usage log failure is non-critical but should be logged for debugging */
        logger.warn('Failed to create character usage log', { error: charError, tournamentId, matchId, playerId: reportingPlayerId, character });
      }
    }

    /* Store the reported scores in the appropriate player's report fields */
    if (reportingPlayer === 1) {
      await prisma.mRMatch.update({
        where: { id: matchId },
        data: {
          player1ReportedPoints1: score1,
          player1ReportedPoints2: score2,
        },
      });
    } else {
      await prisma.mRMatch.update({
        where: { id: matchId },
        data: {
          player2ReportedPoints1: score1,
          player2ReportedPoints2: score2,
        },
      });
    }

    /* Fetch updated match to check if both players have reported */
    const updatedMatch = await prisma.mRMatch.findUnique({
      where: { id: matchId },
      include: { player1: true, player2: true },
    });

    /*
     * Auto-confirm match when both players report matching scores.
     * Only confirm if the match has a definitive winner (score >= 3).
     */
    if (score1 >= 3 || score2 >= 3) {
      const p1Score1 = updatedMatch!.player1ReportedPoints1;
      const p1Score2 = updatedMatch!.player1ReportedPoints2;
      const p2Score1 = updatedMatch!.player2ReportedPoints1;
      const p2Score2 = updatedMatch!.player2ReportedPoints2;

      /* Both players must have reported and their reports must match */
      if (p1Score1 !== null && p2Score1 !== null && p1Score1 === p2Score1 &&
          p1Score2 !== null && p2Score2 !== null && p1Score2 === p2Score2) {
        await prisma.mRMatch.update({
          where: { id: matchId },
          data: {
            score1: p1Score1!,
            score2: p1Score2!,
            rounds: rounds || null,
            completed: true,
          },
      });
    }

    /* Create audit log for the score report */
    await createAuditLog({
      ipAddress: clientIp,
      userAgent,
      action: "REPORT_MR_SCORE",
      targetId: matchId,
      targetType: "MRMatch",
      details: {
        tournamentId,
        reportingPlayer,
        score1,
        score2,
      },
    });
    }

    return NextResponse.json({ success: true, match: updatedMatch });
  } catch (error) {
    logger.error("Failed to report score", { error, tournamentId, matchId });
    return NextResponse.json(
      { error: "Failed to report score" },
      { status: 500 }
    );
  }
}
