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
import { getUserAgent } from "@/lib/rate-limit";
import { sanitizeInput } from "@/lib/sanitize";
import { createAuditLog } from "@/lib/audit-log";
import { createLogger } from "@/lib/logger";
import {
  checkScoreReportAuth,
  createScoreEntryLog,
  createCharacterUsageLog,
  validateCharacter,
  applyRateLimit,
} from "@/lib/api-factories/score-report-helpers";

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
    /* Rate limit: 10 score reports per minute per IP */
    const rl = await applyRateLimit(request, 10, 60 * 1000);
    if (!rl.allowed) return rl.response!;
    const clientIp = rl.clientIp;
    const userAgent = getUserAgent(request);

    const body = sanitizeInput(await request.json());
    const { reportingPlayer, score1, score2, rounds, character } = body;

    /* Validate character selection */
    if (!validateCharacter(character)) {
      return NextResponse.json({ error: "Invalid character" }, { status: 400 });
    }

    /* Fetch match */
    const match = await prisma.mRMatch.findUnique({
      where: { id: matchId },
      include: { player1: true, player2: true },
    });

    if (!match) {
      return NextResponse.json({ error: "Match not found" }, { status: 404 });
    }

    /* Multi-method authorization check */
    const isAuthorized = await checkScoreReportAuth(request, tournamentId, reportingPlayer, match);
    if (!isAuthorized) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized: Invalid token or not authorized for this match' },
        { status: 401 }
      );
    }

    /* Validate required fields */
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

    /* Store reported scores (no optimistic locking for MR) */
    if (reportingPlayer === 1) {
      await prisma.mRMatch.update({
        where: { id: matchId },
        data: { player1ReportedPoints1: score1, player1ReportedPoints2: score2 },
      });
    } else {
      await prisma.mRMatch.update({
        where: { id: matchId },
        data: { player2ReportedPoints1: score1, player2ReportedPoints2: score2 },
      });
    }

    /* Fetch updated match to check dual-report status */
    const updatedMatch = await prisma.mRMatch.findUnique({
      where: { id: matchId },
      include: { player1: true, player2: true },
    });

    /*
     * Auto-confirm when both players report matching scores
     * and the match has a definitive winner (score >= 3).
     */
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

    /* Audit log inside the score >= 3 block (preserving existing behavior) */
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
