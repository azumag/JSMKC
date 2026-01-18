import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { rateLimit, getClientIdentifier, getUserAgent } from "@/lib/rate-limit";
import { createAuditLog } from "@/lib/audit-log";
import { sanitizeInput } from "@/lib/sanitize";

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
    const { reportingPlayer, score1, score2, rounds } = body;

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

    const match = await prisma.mRMatch.findUnique({
      where: { id: matchId },
    });

    if (!match) {
      return NextResponse.json(
        { error: "Match not found" },
        { status: 404 }
      );
    }

    if (reportingPlayer === 1) {
      await prisma.mRMatch.update({
        where: { id: matchId },
        data: {
          player1ReportedScore1: score1,
          player1ReportedScore2: score2,
        },
      });
    } else {
      await prisma.mRMatch.update({
        where: { id: matchId },
        data: {
          player2ReportedScore1: score1,
          player2ReportedScore2: score2,
        },
      });
    }

    const updatedMatch = await prisma.mRMatch.findUnique({
      where: { id: matchId },
      include: { player1: true, player2: true },
    });

    if (score1 >= 3 || score2 >= 3) {
      const p1Score1 = updatedMatch!.player1ReportedScore1;
      const p1Score2 = updatedMatch!.player1ReportedScore2;
      const p2Score1 = updatedMatch!.player2ReportedScore1;
      const p2Score2 = updatedMatch!.player2ReportedScore2;

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
    console.error("Failed to report score:", error);
    return NextResponse.json(
      { error: "Failed to report score" },
      { status: 500 }
    );
  }
}
