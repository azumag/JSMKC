import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { rateLimit, getClientIdentifier, getUserAgent } from "@/lib/rate-limit";
import { sanitizeInput } from "@/lib/sanitize";
import { validateTournamentToken } from "@/lib/token-validation";
import { auth } from "@/lib/auth";
import { SMK_CHARACTERS } from "@/lib/constants";
import { createAuditLog } from "@/lib/audit-log";
import { createLogger } from "@/lib/logger";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; matchId: string }> }
) {
  const logger = createLogger('mr-score-report-api');
  const { id: tournamentId, matchId } = await params;
  try {
    const clientIp = getClientIdentifier(request);
    const userAgent = getUserAgent(request);

    const rateLimitResult = await rateLimit(clientIp, 10, 60 * 1000);
    if (!rateLimitResult.success) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        { status: 429 }
      );
    }

    const body = sanitizeInput(await request.json());
    const { reportingPlayer, score1, score2, rounds, character } = body;

    // Validate character if provided
    if (character && !SMK_CHARACTERS.includes(character as typeof SMK_CHARACTERS[number])) {
      return NextResponse.json({ error: "Invalid character" }, { status: 400 });
    }

    // Get match first to check players
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
      return NextResponse.json(
        { success: false, error: 'Unauthorized: Invalid token or not authorized for this match' },
        { status: 401 }
      );
    }

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

    // Determine player ID for logging
    const reportingPlayerId = reportingPlayer === 1 ? match.player1Id : match.player2Id;

    // Create score entry log
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
      // Score entry log failure is non-critical but should be logged for debugging
      logger.warn('Failed to create score entry log', { error: logError, tournamentId, matchId, playerId: reportingPlayerId });
    }

    // Log character usage if character is provided
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
        // Character usage log failure is non-critical but should be logged for debugging
        logger.warn('Failed to create character usage log', { error: charError, tournamentId, matchId, playerId: reportingPlayerId, character });
      }
    }

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

    const updatedMatch = await prisma.mRMatch.findUnique({
      where: { id: matchId },
      include: { player1: true, player2: true },
    });

    if (score1 >= 3 || score2 >= 3) {
      const p1Score1 = updatedMatch!.player1ReportedPoints1;
      const p1Score2 = updatedMatch!.player1ReportedPoints2;
      const p2Score1 = updatedMatch!.player2ReportedPoints1;
      const p2Score2 = updatedMatch!.player2ReportedPoints2;

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
    // Use structured logging for error tracking and debugging
    logger.error("Failed to report score", { error, tournamentId, matchId });
    return NextResponse.json(
      { error: "Failed to report score" },
      { status: 500 }
    );
  }
}
