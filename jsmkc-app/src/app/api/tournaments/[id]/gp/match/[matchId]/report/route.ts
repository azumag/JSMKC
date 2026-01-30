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
import { rateLimit, getClientIdentifier, getUserAgent } from "@/lib/rate-limit";
import { sanitizeInput } from "@/lib/sanitize";
import { SMK_CHARACTERS } from "@/lib/constants";
import { createAuditLog } from "@/lib/audit-log";
import { createLogger } from "@/lib/logger";

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
 *
 * Request body: { reportingPlayer: 1|2, races: [...], character? }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; matchId: string }> }
) {
  const logger = createLogger('gp-score-report-api');
  const { id: tournamentId, matchId } = await params;
  try {
    const clientIp = getClientIdentifier(request);
    const userAgent = getUserAgent(request);

    /* Rate limit: 10 requests per minute per IP to prevent abuse */
    const rateLimitResult = await rateLimit(clientIp, 10, 60 * 1000);
    if (!rateLimitResult.success) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        { status: 429 }
      );
    }

    const body = sanitizeInput(await request.json());
    const { reportingPlayer, races, character } = body;

    /* Fetch match to validate existence and check completion status */
    const match = await prisma.gPMatch.findUnique({
      where: { id: matchId },
      select: {
        player1Id: true,
        player2Id: true,
        completed: true,
      },
    });

    if (!match) {
      return NextResponse.json({ error: "Match not found" }, { status: 404 });
    }

    /* Validate character selection against the 8 SMK characters */
    if (character && !SMK_CHARACTERS.includes(character as typeof SMK_CHARACTERS[number])) {
      return NextResponse.json({ error: "Invalid character" }, { status: 400 });
    }

    /* Determine which player is reporting for audit logging */
    const reportingPlayerId = reportingPlayer === 1 ? match.player1Id : match.player2Id;

    /*
     * Process each race: convert finishing positions to driver points.
     * Each race in a GP cup awards points based on position (9/6/3/1).
     * Total match points are the sum across all races.
     */
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

    /* Create score entry log for audit trail (non-critical, fail silently) */
    try {
      await prisma.scoreEntryLog.create({
        data: {
          tournamentId,
          matchId,
          matchType: 'GP',
          playerId: reportingPlayerId,
          reportedData: {
            reportingPlayer,
            races: processedRaces,
            totalPoints1,
            totalPoints2,
          },
          ipAddress: clientIp,
          userAgent: userAgent,
        },
        });
    } catch (logError) {
      /* Score entry log failure is non-critical but should be logged for debugging */
      logger.warn('Failed to create score entry log', { error: logError, tournamentId, matchId, playerId: reportingPlayerId });
    }

    /* Log character usage if character is provided (non-critical) */
    if (character) {
      try {
        await prisma.matchCharacterUsage.create({
          data: {
            matchId,
            matchType: 'GP',
            playerId: reportingPlayerId,
            character,
          },
        });
      } catch (charError) {
        logger.warn('Failed to create character usage log', { error: charError, tournamentId, matchId, playerId: reportingPlayerId, character });
      }
    }

    /* Reject reports for already-completed matches */
    if (match.completed) {
      return NextResponse.json(
        { error: "Match already completed" },
        { status: 400 }
      );
    }

    /*
     * Store the report for the reporting player.
     * Player 1 reports go to player1ReportedPoints1/Points2/Races fields.
     * Player 2 reports go to player2ReportedPoints1/Points2/Races fields.
     */
    const updateData =
      reportingPlayer === 1
        ? {
            player1ReportedPoints1: totalPoints1,
            player1ReportedPoints2: totalPoints2,
            player1ReportedRaces: processedRaces,
          }
        : {
            player2ReportedPoints1: totalPoints1,
            player2ReportedPoints2: totalPoints2,
            player2ReportedRaces: processedRaces,
          };

    const updatedMatch = await prisma.gPMatch.update({
      where: { id: matchId },
      data: updateData,
    });

    /* Create audit log entry for the score report */
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

    /*
     * Check if both players have now reported.
     * If both reports exist and match, auto-confirm the result.
     * If both reports exist but differ, flag for admin review.
     */
    const finalMatch = await prisma.gPMatch.findUnique({
      where: { id: matchId },
      include: { player1: true, player2: true },
    });

    const p1p1 = finalMatch!.player1ReportedPoints1;
    const p1p2 = finalMatch!.player1ReportedPoints2;
    const p2p1 = finalMatch!.player2ReportedPoints1;
    const p2p2 = finalMatch!.player2ReportedPoints2;

    /*
     * Auto-confirmation: Both players reported matching scores.
     * When points match exactly, the match is automatically completed
     * without needing admin intervention.
     */
    if (
      p1p1 !== null &&
      p1p2 !== null &&
      p2p1 !== null &&
      p2p2 !== null &&
      p1p1 === p2p1 &&
      p1p2 === p2p2
    ) {
      /* Use player 1's race details (both should be identical) */
      const racesToUse = finalMatch!.player1ReportedRaces || finalMatch!.player2ReportedRaces;

      const confirmedMatch = await prisma.gPMatch.update({
        where: { id: matchId },
        data: {
          points1: p1p1,
          points2: p1p2,
          races: racesToUse || [],
          completed: true,
        },
        include: { player1: true, player2: true },
      });

      /* Recalculate qualification standings for both players */
      await recalculatePlayerStats(tournamentId, confirmedMatch.player1Id);
      await recalculatePlayerStats(tournamentId, confirmedMatch.player2Id);

      return NextResponse.json({
        message: "Scores confirmed and match completed",
        match: confirmedMatch,
        autoConfirmed: true,
      });
    }

    /* Mismatch detection: both reported but scores don't agree */
    if (p1p1 !== null && p1p2 !== null && p2p1 !== null && p2p2 !== null) {
      return NextResponse.json({
        message: "Score reported but mismatch detected - awaiting admin review",
        match: updatedMatch,
        mismatch: true,
        player1Report: { points1: p1p1, points2: p1p2 },
        player2Report: { points1: p2p1, points2: p2p2 },
      });
    }

    /* Only one player has reported so far */
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
 * Recalculate a player's qualification standing stats.
 * Fetches all completed qualification matches for the player
 * and computes wins, ties, losses, total driver points, and score.
 *
 * This is called after auto-confirmation to update the standings table.
 *
 * @param tournamentId - Tournament ID
 * @param playerId - Player ID to recalculate
 */
async function recalculatePlayerStats(tournamentId: string, playerId: string) {
  /* Fetch all completed qualification matches involving this player */
  const matches = await prisma.gPMatch.findMany({
    where: {
      tournamentId,
      stage: "qualification",
      completed: true,
      OR: [{ player1Id: playerId }, { player2Id: playerId }],
    },
  });

  let totalPoints = 0;
  let wins = 0;
  let ties = 0;
  let losses = 0;

  /* Iterate through matches to accumulate stats */
  for (const m of matches) {
    const isPlayer1 = m.player1Id === playerId;
    const myPoints = isPlayer1 ? m.points1 : m.points2;
    const oppPoints = isPlayer1 ? m.points2 : m.points1;
    totalPoints += myPoints;

    /* Determine match outcome based on driver point totals */
    if (myPoints > oppPoints) {
      wins++;
    } else if (myPoints < oppPoints) {
      losses++;
    } else {
      ties++;
    }
  }

  /* Score formula: wins×2 + ties×1 (standard round-robin scoring) */
  const score = wins * 2 + ties;

  /* Update the qualification record with recalculated stats */
  await prisma.gPQualification.updateMany({
    where: { tournamentId, playerId },
    data: {
      mp: matches.length,
      wins,
      ties,
      losses,
      points: totalPoints,
      score,
    },
  });
}
