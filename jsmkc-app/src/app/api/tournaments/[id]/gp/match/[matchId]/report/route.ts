import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { rateLimit, getClientIdentifier, getUserAgent } from "@/lib/rate-limit";
import { sanitizeInput } from "@/lib/sanitize";
import { validateTournamentToken } from "@/lib/token-validation";
import { auth } from "@/lib/auth";

const DRIVER_POINTS = [0, 1, 3, 6, 9];

function getPointsFromPosition(position: number): number {
  if (position < 1 || position > 4) return 0;
  return DRIVER_POINTS[position];
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; matchId: string }> }
) {
  try {
    const { id: tournamentId, matchId } = await params;
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
    const { reportingPlayer, races } = body;

    // Get match first to check players
    const match = await prisma.gPMatch.findUnique({
      where: { id: matchId },
      include: { player1: true, player2: true },
    });

    if (!match) {
      return NextResponse.json({ success: false, error: "Match not found" }, { status: 404 });
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

    // Validate input
    if (!reportingPlayer || !Array.isArray(races) || races.length === 0) {
      return NextResponse.json(
        { error: "reportingPlayer and races are required" },
        { status: 400 }
      );
    }

    if (reportingPlayer !== 1 && reportingPlayer !== 2) {
      return NextResponse.json(
        { error: "reportingPlayer must be 1 or 2" },
        { status: 400 }
      );
    }

    for (const race of races) {
      if (!race.course || race.position1 === undefined || race.position2 === undefined) {
        return NextResponse.json(
          { error: "Each race must have course, position1, and position2" },
          { status: 400 }
        );
      }
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
      console.error('Failed to create score entry log:', logError);
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
    console.error("Failed to report score:", error);
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
