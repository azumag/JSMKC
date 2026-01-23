import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { createAuditLog, AUDIT_ACTIONS } from "@/lib/audit-log";
import { z } from "zod";
import { sanitizeInput } from "@/lib/sanitize";
import { createLogger } from "@/lib/logger";

// Initialize logger for structured logging
const logger = createLogger('mr-finals-matches-api');

const CreateMatchSchema = z.object({
  player1Id: z.string().uuid(),
  player2Id: z.string().uuid(),
  player1Side: z.number().int().min(1).max(2).optional().default(1),
  player2Side: z.number().int().min(1).max(2).optional().default(2),
  tvNumber: z.number().int().optional(),
  bracket: z.enum(["winners", "losers", "grand_final"]).default("winners"),
  bracketPosition: z.string().optional(),
  isGrandFinal: z.boolean().default(false),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();

  if (!session?.user || session.user.role !== "admin") {
    return NextResponse.json(
      { error: "Unauthorized: Admin access required" },
      { status: 401 }
    );
  }

  const { id: tournamentId } = await params;
  try {
    const body = sanitizeInput(await request.json());

    const parseResult = CreateMatchSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: parseResult.error.issues[0]?.message || "Invalid request body" },
        { status: 400 }
      );
    }

    const data = parseResult.data;

    const [player1, player2] = await Promise.all([
      prisma.player.findUnique({ where: { id: data.player1Id } }),
      prisma.player.findUnique({ where: { id: data.player2Id } }),
    ]);

    if (!player1 || !player2) {
      return NextResponse.json(
        { error: "One or both players not found" },
        { status: 404 }
      );
    }

    const lastMatch = await prisma.mRMatch.findFirst({
      where: { tournamentId, stage: "finals" },
      orderBy: { matchNumber: "desc" },
    });

    const matchNumber = (lastMatch?.matchNumber || 0) + 1;

    const match = await prisma.mRMatch.create({
      data: {
        tournamentId,
        matchNumber,
        stage: "finals",
        round: data.bracketPosition,
        tvNumber: data.tvNumber,
        player1Id: data.player1Id,
        player2Id: data.player2Id,
        player1Side: data.player1Side,
        player2Side: data.player2Side,
        score1: 0,
        score2: 0,
        completed: false,
        bracket: data.bracket,
        bracketPosition: data.bracketPosition,
        losses: 0,
        isGrandFinal: data.isGrandFinal,
        rounds: {},
      },
      include: { player1: true, player2: true },
    });

    try {
      await createAuditLog({
        userId: session.user.id,
        ipAddress: request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "unknown",
        userAgent: request.headers.get("user-agent") || "unknown",
        action: AUDIT_ACTIONS.CREATE_MR_MATCH,
        targetId: match.id,
        targetType: "MRMatch",
        details: {
          tournamentId,
          player1Nickname: player1.nickname,
          player2Nickname: player2.nickname,
          bracket: data.bracket,
          bracketPosition: data.bracketPosition,
          isGrandFinal: data.isGrandFinal,
        },
      });
    } catch (logError) {
      // Audit log failure is non-critical but should be logged for security tracking
      logger.warn('Failed to create audit log', { error: logError, tournamentId, action: 'CREATE_MR_MATCH' });
    }

    return NextResponse.json(
      { message: "Match created successfully", match },
      { status: 201 }
    );
  } catch (error) {
    // Use structured logging for error tracking and debugging
    logger.error("Failed to create match", { error, tournamentId });
    return NextResponse.json(
      { error: "Failed to create match" },
      { status: 500 }
    );
  }
}
