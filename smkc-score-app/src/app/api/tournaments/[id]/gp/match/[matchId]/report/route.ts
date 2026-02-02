/**
 * Grand Prix Match Score Report API Route
 *
 * Allows participants to self-report their GP match results.
 * Uses a dual-report system: both players submit their results independently.
 * When both reports match, the match is auto-confirmed.
 * If reports differ, the match is flagged for admin review.
 *
 * GP-specific: Reports include race-by-race positions and driver points
 * (9 for 1st, 6 for 2nd, 3 for 3rd, 1 for 4th).
 *
 * Features:
 * - Rate limiting (10 requests/minute per IP)
 * - Score entry logging for audit trail
 * - Character usage tracking
 * - Auto-confirmation when both players agree
 * - Mismatch detection for admin review
 */

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getUserAgent } from "@/lib/rate-limit";
import { sanitizeInput } from "@/lib/sanitize";
import { createAuditLog } from "@/lib/audit-log";
import { createLogger } from "@/lib/logger";
import {
  createScoreEntryLog,
  createCharacterUsageLog,
  validateCharacter,
  applyRateLimit,
  checkScoreReportAuth,
} from "@/lib/api-factories/score-report-helpers";

/**
 * Driver points table indexed by finishing position.
 * Position 0 is unused (placeholder for 1-indexed positions).
 * 1st place = 9pts, 2nd = 6pts, 3rd = 3pts, 4th = 1pt.
 */
const DRIVER_POINTS = [0, 9, 6, 3, 1];

/**
 * Convert a finishing position to driver points.
 * Returns 0 for invalid positions (outside 1-4 range).
 */
function getPointsFromPosition(position: number): number {
  if (position < 1 || position > 4) return 0;
  return DRIVER_POINTS[position];
}

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
  const { id: tournamentId, matchId } = await params;
  try {
    /* Rate limit: 10 requests per minute per IP */
    const rl = await applyRateLimit(request, 10, 60 * 1000);
    if (!rl.allowed) return rl.response!;
    const clientIp = rl.clientIp;
    const userAgent = getUserAgent(request);

    const body = sanitizeInput(await request.json());
    const { reportingPlayer, races, character } = body;

    /* Fetch match with player userId for auth check */
    const match = await prisma.gPMatch.findUnique({
      where: { id: matchId },
      include: {
        player1: { select: { userId: true } },
        player2: { select: { userId: true } },
      },
    });

    if (!match) {
      return NextResponse.json({ error: "Match not found" }, { status: 404 });
    }

    if (match.completed) {
      return NextResponse.json(
        { error: "Match already completed" },
        { status: 400 }
      );
    }

    /* Authorization check (consistent with BM and MR report routes) */
    const isAuthorized = await checkScoreReportAuth(request, tournamentId, reportingPlayer, match);
    if (!isAuthorized) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized: Not authorized for this match' },
        { status: 401 }
      );
    }

    /* Validate character selection */
    if (!validateCharacter(character)) {
      return NextResponse.json({ error: "Invalid character" }, { status: 400 });
    }

    const reportingPlayerId = reportingPlayer === 1 ? match.player1Id : match.player2Id;

    /* Process races: convert finishing positions to driver points */
    let totalPoints1 = 0;
    let totalPoints2 = 0;

    const processedRaces = races.map((race: { position1: number; position2: number; course: string }) => {
      const points1 = getPointsFromPosition(race.position1);
      const points2 = getPointsFromPosition(race.position2);
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

    /* Store reported scores (no optimistic locking for GP) */
    const updateData =
      reportingPlayer === 1
        ? { player1ReportedPoints1: totalPoints1, player1ReportedPoints2: totalPoints2, player1ReportedRaces: processedRaces }
        : { player2ReportedPoints1: totalPoints1, player2ReportedPoints2: totalPoints2, player2ReportedRaces: processedRaces };

    const updatedMatch = await prisma.gPMatch.update({
      where: { id: matchId },
      data: updateData,
    });

    /* Audit log outside the confirmation block (GP-specific behavior) */
    await createAuditLog({
      ipAddress: clientIp,
      userAgent,
      action: "REPORT_GP_SCORE",
      targetId: matchId,
      targetType: "GPMatch",
      details: {
        tournamentId,
        reportingPlayer,
        points1: totalPoints1,
        points2: totalPoints2,
      },
    });

    /* Check dual-report: auto-confirm or flag mismatch */
    const finalMatch = await prisma.gPMatch.findUnique({
      where: { id: matchId },
      include: { player1: true, player2: true },
    });

    const p1p1 = finalMatch!.player1ReportedPoints1;
    const p1p2 = finalMatch!.player1ReportedPoints2;
    const p2p1 = finalMatch!.player2ReportedPoints1;
    const p2p2 = finalMatch!.player2ReportedPoints2;

    /* Auto-confirm when both reports match */
    if (
      p1p1 !== null && p1p2 !== null && p2p1 !== null && p2p2 !== null &&
      p1p1 === p2p1 && p1p2 === p2p2
    ) {
      const racesToUse = finalMatch!.player1ReportedRaces || finalMatch!.player2ReportedRaces;

      const confirmedMatch = await prisma.gPMatch.update({
        where: { id: matchId },
        data: { points1: p1p1, points2: p1p2, races: racesToUse || [], completed: true },
        include: { player1: true, player2: true },
      });

      await recalculatePlayerStats(tournamentId, confirmedMatch.player1Id);
      await recalculatePlayerStats(tournamentId, confirmedMatch.player2Id);

      return NextResponse.json({
        message: "Scores confirmed and match completed",
        match: confirmedMatch,
        autoConfirmed: true,
      });
    }

    /* Mismatch: both reported but scores disagree */
    if (p1p1 !== null && p1p2 !== null && p2p1 !== null && p2p2 !== null) {
      return NextResponse.json({
        message: "Score reported but mismatch detected - awaiting admin review",
        match: updatedMatch,
        mismatch: true,
        player1Report: { points1: p1p1, points2: p1p2 },
        player2Report: { points1: p2p1, points2: p2p2 },
      });
    }

    return NextResponse.json({
      message: "Score reported successfully",
      match: updatedMatch,
      waitingFor: reportingPlayer === 1 ? "player2" : "player1",
    });
  } catch (error) {
    logger.error("Failed to report score", { error, tournamentId, matchId });
    return NextResponse.json(
      { error: "Failed to report score" },
      { status: 500 }
    );
  }
}

/**
 * Recalculate GP qualification stats for a player.
 * GP-specific: tracks total driver points across matches.
 */
async function recalculatePlayerStats(tournamentId: string, playerId: string) {
  const matches = await prisma.gPMatch.findMany({
    where: {
      tournamentId, stage: "qualification", completed: true,
      OR: [{ player1Id: playerId }, { player2Id: playerId }],
    },
  });

  let totalPoints = 0;
  let wins = 0;
  let ties = 0;
  let losses = 0;

  for (const m of matches) {
    const isPlayer1 = m.player1Id === playerId;
    const myPoints = isPlayer1 ? m.points1 : m.points2;
    const oppPoints = isPlayer1 ? m.points2 : m.points1;
    totalPoints += myPoints;

    if (myPoints > oppPoints) wins++;
    else if (myPoints < oppPoints) losses++;
    else ties++;
  }

  const score = wins * 2 + ties;

  await prisma.gPQualification.updateMany({
    where: { tournamentId, playerId },
    data: { mp: matches.length, wins, ties, losses, points: totalPoints, score },
  });
}
