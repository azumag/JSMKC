import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { rateLimit, getClientIdentifier, getUserAgent } from "@/lib/rate-limit";
import { sanitizeInput } from "@/lib/sanitize";
import { SMK_CHARACTERS } from "@/lib/constants";
import { createAuditLog } from "@/lib/audit-log";
import { createLogger } from "@/lib/logger";

const DRIVER_POINTS = [0, 9, 6, 3, 1];

function getPointsFromPosition(position: number): number {
  if (position < 1 || position > 4) return 0;
  return DRIVER_POINTS[position];
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; matchId: string }> }
) {
  const logger = createLogger('gp-score-report-api');
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
    const { reportingPlayer, races, character } = body;

    // Fetch match to check completion status and get player IDs
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

    // Validate character if provided
    if (character && !SMK_CHARACTERS.includes(character as typeof SMK_CHARACTERS[number])) {
      return NextResponse.json({ error: "Invalid character" }, { status: 400 });
    }

    // Determine player ID for logging
    const reportingPlayerId = reportingPlayer === 1 ? match.player1Id : match.player2Id;

    // Calculate points for logging
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

    // Create score entry log
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
      // Score entry log failure is non-critical but should be logged for debugging
      logger.warn('Failed to create score entry log', { error: logError, tournamentId, matchId, playerId: reportingPlayerId });
    }

    // Log character usage if character is provided
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
        // Character usage log failure is non-critical but should be logged for debugging
        logger.warn('Failed to create character usage log', { error: charError, tournamentId, matchId, playerId: reportingPlayerId, character });
      }
    }

    if (match.completed) {
      return NextResponse.json(
        { error: "Match already completed" },
        { status: 400 }
      );
    }

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

    const finalMatch = await prisma.gPMatch.findUnique({
      where: { id: matchId },
      include: { player1: true, player2: true },
    });

    const p1p1 = finalMatch!.player1ReportedPoints1;
    const p1p2 = finalMatch!.player1ReportedPoints2;
    const p2p1 = finalMatch!.player2ReportedPoints1;
    const p2p2 = finalMatch!.player2ReportedPoints2;

    if (
      p1p1 !== null &&
      p1p2 !== null &&
      p2p1 !== null &&
      p2p2 !== null &&
      p1p1 === p2p1 &&
      p1p2 === p2p2
    ) {
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

      await recalculatePlayerStats(tournamentId, confirmedMatch.player1Id);
      await recalculatePlayerStats(tournamentId, confirmedMatch.player2Id);

      return NextResponse.json({
        message: "Scores confirmed and match completed",
        match: confirmedMatch,
        autoConfirmed: true,
      });
    }

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
    // Use structured logging for error tracking and debugging
    logger.error("Failed to report score", { error, tournamentId, matchId });
    return NextResponse.json(
      { error: "Failed to report score" },
      { status: 500 }
    );
  }
}

async function recalculatePlayerStats(tournamentId: string, playerId: string) {
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

  for (const m of matches) {
    const isPlayer1 = m.player1Id === playerId;
    const myPoints = isPlayer1 ? m.points1 : m.points2;
    const oppPoints = isPlayer1 ? m.points2 : m.points1;
    totalPoints += myPoints;

    if (myPoints > oppPoints) {
      wins++;
    } else if (myPoints < oppPoints) {
      losses++;
    } else {
      ties++;
    }
  }

  const score = wins * 2 + ties;

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
