/**
 * Battle Mode Finals Match Creation API Route
 *
 * Provides an admin endpoint for manually creating finals matches.
 * This is used when matches need to be added to the bracket manually,
 * as opposed to the auto-generated bracket from the POST /finals endpoint.
 *
 * Supports specifying:
 * - Player assignments with controller side preferences
 * - TV number assignment for multi-TV tournament setups
 * - Bracket type (winners/losers/grand_final)
 * - Bracket position for display purposes
 * - Grand Final flag for special handling
 *
 * Authentication: Admin role required
 * Validation: Zod schema for strict input validation
 */

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { createAuditLog, AUDIT_ACTIONS } from "@/lib/audit-log";
import { z } from "zod";
import { createLogger } from "@/lib/logger";

/**
 * Zod schema for validating match creation requests.
 * Ensures all required fields are present and valid before processing.
 *
 * Fields:
 * - player1Id/player2Id: UUID strings for the competing players
 * - player1Side/player2Side: Controller side (1 or 2) for each player
 * - tvNumber: Optional TV assignment for multi-screen setups
 * - bracket: Which bracket this match belongs to
 * - bracketPosition: Display position identifier within the bracket
 * - isGrandFinal: Flag for grand final special handling
 */
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

/**
 * POST /api/tournaments/[id]/bm/finals/matches
 *
 * Create a new finals match manually. Used by admin for bracket management
 * when automatic bracket generation isn't suitable.
 *
 * Request body: See CreateMatchSchema above for field definitions.
 *
 * Match number is auto-incremented based on the highest existing finals match number.
 * The match is created with initial scores of 0-0 and empty rounds.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  /* Logger must be created inside the function for proper test mocking */
  const logger = createLogger('bm-finals-matches-api');
  const session = await auth();

  /* Admin authentication is required for match creation */
  if (!session?.user || session.user.role !== "admin") {
    return NextResponse.json(
      { error: "Unauthorized: Admin access required" },
      { status: 401 }
    );
  }

  const { id: tournamentId } = await params;

  try {
    const body = await request.json();

    /* Validate request body with Zod schema for type safety */
    const parseResult = CreateMatchSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: parseResult.error.issues[0]?.message || "Invalid request body" },
        { status: 400 }
      );
    }

    const data = parseResult.data;

    /* Verify both players exist in the database before creating the match */
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

    /* Auto-increment match number based on existing finals matches */
    const lastMatch = await prisma.bMMatch.findFirst({
      where: { tournamentId, stage: "finals" },
      orderBy: { matchNumber: "desc" },
    });

    const matchNumber = (lastMatch?.matchNumber || 0) + 1;

    /* Create the match with all specified parameters */
    const match = await prisma.bMMatch.create({
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

    /* Record audit log for match creation (security and accountability) */
    try {
      await createAuditLog({
        userId: session.user.id,
        ipAddress: request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "unknown",
        userAgent: request.headers.get("user-agent") || "unknown",
        action: AUDIT_ACTIONS.CREATE_BM_MATCH,
        targetId: match.id,
        targetType: "BMMatch",
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
      /* Audit log failure is non-critical but should be logged for security tracking */
      logger.warn('Failed to create audit log', { error: logError, tournamentId, action: 'CREATE_BM_MATCH' });
    }

    return NextResponse.json(
      { message: "Match created successfully", match },
      { status: 201 }
    );
  } catch (error) {
    logger.error("Failed to create match", { error, tournamentId });
    return NextResponse.json(
      { error: "Failed to create match" },
      { status: 500 }
    );
  }
}
