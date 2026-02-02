/**
 * Finals Matches Route Factory
 *
 * Generates POST handlers for finals match creation API routes.
 * Takes a FinalsMatchesConfig and returns a POST handler that uses the
 * config's model name, logger name, audit settings, and sanitization flag.
 *
 * This eliminates duplicated code across BM and MR finals match creation routes
 * while preserving identical API response shapes for each event type.
 *
 * POST: Create a new finals match with bracket metadata and player assignments
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { createAuditLog } from '@/lib/audit-log';
import { sanitizeInput } from '@/lib/sanitize';
import { z } from 'zod';
import { createLogger } from '@/lib/logger';

/**
 * Zod schema for validating match creation requests.
 * Ensures all required fields are present and valid before processing.
 */
const CreateMatchSchema = z.object({
  player1Id: z.string().uuid(),
  player2Id: z.string().uuid(),
  player1Side: z.number().int().min(1).max(2).optional().default(1),
  player2Side: z.number().int().min(1).max(2).optional().default(2),
  tvNumber: z.number().int().optional(),
  bracket: z.enum(['winners', 'losers', 'grand_final']).default('winners'),
  bracketPosition: z.string().optional(),
  isGrandFinal: z.boolean().default(false),
});

/**
 * Configuration for a finals matches route handler.
 *
 * Captures the differences between BM and MR finals match creation endpoints
 * so the factory can produce correct behavior for each event type.
 */
export interface FinalsMatchesConfig {
  /** Prisma model name for match records (e.g., 'bMMatch') */
  matchModel: string;
  /** Logger instance name (e.g., 'bm-finals-matches-api') */
  loggerName: string;
  /** Audit action string (e.g., AUDIT_ACTIONS.CREATE_BM_MATCH) */
  auditAction: string;
  /** Audit target type (e.g., 'BMMatch') */
  auditTargetType: string;
  /** Whether to sanitize request body before validation (MR uses this) */
  sanitizeBody?: boolean;
}

/**
 * Create finals matches route handlers from a matches configuration.
 *
 * @param config - Finals matches configuration (BM or MR)
 * @returns Object with POST handler function
 */
export function createFinalsMatchesHandlers(config: FinalsMatchesConfig) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const matchMdl = (p: any) => p[config.matchModel];

  /**
   * POST handler: Create a new finals match with bracket metadata.
   * Requires admin authentication. Match number is auto-incremented.
   */
  async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
  ) {
    const logger = createLogger(config.loggerName);
    const session = await auth();

    /* Admin authentication required for match creation */
    if (!session?.user || session.user.role !== 'admin') {
      return NextResponse.json(
        { error: 'Unauthorized: Admin access required' },
        { status: 401 },
      );
    }

    const { id: tournamentId } = await params;

    try {
      let body = await request.json();

      /* Sanitize input when configured (e.g., MR route uses sanitization) */
      if (config.sanitizeBody) {
        body = sanitizeInput(body);
      }

      /* Validate request body with Zod schema for type safety */
      const parseResult = CreateMatchSchema.safeParse(body);
      if (!parseResult.success) {
        return NextResponse.json(
          { error: parseResult.error.issues[0]?.message || 'Invalid request body' },
          { status: 400 },
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
          { error: 'One or both players not found' },
          { status: 404 },
        );
      }

      /* Auto-increment match number based on existing finals matches */
      const lastMatch = await matchMdl(prisma).findFirst({
        where: { tournamentId, stage: 'finals' },
        orderBy: { matchNumber: 'desc' },
      });

      const matchNumber = (lastMatch?.matchNumber || 0) + 1;

      /* Create the match with all bracket metadata */
      const match = await matchMdl(prisma).create({
        data: {
          tournamentId,
          matchNumber,
          stage: 'finals',
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
          ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown',
          userAgent: request.headers.get('user-agent') || 'unknown',
          action: config.auditAction,
          targetId: match.id,
          targetType: config.auditTargetType,
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
        logger.warn('Failed to create audit log', { error: logError, tournamentId, action: config.auditAction });
      }

      return NextResponse.json(
        { message: 'Match created successfully', match },
        { status: 201 },
      );
    } catch (error) {
      logger.error('Failed to create match', { error, tournamentId });
      return NextResponse.json(
        { error: 'Failed to create match' },
        { status: 500 },
      );
    }
  }

  return { POST };
}
