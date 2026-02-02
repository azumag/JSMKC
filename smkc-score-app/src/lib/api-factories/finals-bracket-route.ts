/**
 * Finals Bracket Route Factory
 *
 * Generates GET/POST handlers for finals bracket API routes.
 * Takes a FinalsBracketConfig and returns route handlers that use the
 * config's model names, logger name, and event code.
 *
 * This eliminates duplicated code across BM and MR bracket routes
 * while preserving identical API response shapes for each event type.
 *
 * GET: Fetch current bracket state (matches + qualified players)
 * POST: Generate a new double-elimination bracket from qualification results
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { generateDoubleEliminationBracket, BracketPlayer } from '@/lib/tournament/double-elimination';
import { createAuditLog, AUDIT_ACTIONS } from '@/lib/audit-log';
import { createLogger } from '@/lib/logger';

/**
 * Configuration for a finals bracket route handler.
 *
 * Captures the differences between BM and MR bracket endpoints
 * so the factory can produce correct behavior for each event type.
 */
export interface FinalsBracketConfig {
  /** Prisma model name for match records (e.g., 'bMMatch') */
  matchModel: string;
  /** Prisma model name for qualification records (e.g., 'bMQualification') */
  qualificationModel: string;
  /** Logger instance name (e.g., 'bm-bracket-api') */
  loggerName: string;
  /** Event code passed to bracket generator (e.g., 'BM' or 'MR') */
  eventCode: 'BM' | 'MR';
}

/**
 * Create finals bracket route handlers from a bracket configuration.
 *
 * @param config - Finals bracket configuration (BM or MR)
 * @returns Object with GET and POST handler functions
 */
export function createFinalsBracketHandlers(config: FinalsBracketConfig) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const matchMdl = (p: any) => p[config.matchModel];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const qualMdl = (p: any) => p[config.qualificationModel];

  /**
   * GET handler: Fetch current bracket state including all finals matches
   * and qualified players with their rankings.
   */
  async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
  ) {
    const logger = createLogger(config.loggerName);
    const { id: tournamentId } = await params;

    try {
      /* Fetch all finals matches ordered by match number for bracket display */
      const matches = await matchMdl(prisma).findMany({
        where: { tournamentId, stage: 'finals' },
        include: { player1: true, player2: true },
        orderBy: { matchNumber: 'asc' },
      });

      /* Fetch qualification standings for player seedings */
      const qualifications = await qualMdl(prisma).findMany({
        where: { tournamentId },
        include: { player: true },
        orderBy: [{ score: 'desc' }, { points: 'desc' }],
      });

      /* Map to BracketPlayer interface for the bracket generator */
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const players: BracketPlayer[] = qualifications.map((q: any, index: number) => ({
        playerId: q.playerId,
        playerName: q.player.name,
        playerNickname: q.player.nickname,
        qualifyingRank: index + 1,
        losses: 0,
        points: q.points,
      }));

      return NextResponse.json({
        matches,
        players,
        totalPlayers: players.length,
      });
    } catch (error) {
      logger.error('Failed to fetch bracket', { error, tournamentId });
      return NextResponse.json(
        { error: 'Failed to fetch bracket' },
        { status: 500 },
      );
    }
  }

  /**
   * POST handler: Generate a new double-elimination bracket from qualification results.
   * Requires admin authentication. Creates bracket structure with
   * winners bracket, losers bracket, and grand final positions.
   */
  async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
  ) {
    const logger = createLogger(config.loggerName);
    const session = await auth();

    /* Admin authentication required for bracket generation */
    if (!session?.user || session.user.role !== 'admin') {
      return NextResponse.json(
        { error: 'Unauthorized: Admin access required' },
        { status: 401 },
      );
    }

    const { id: tournamentId } = await params;

    try {
      /* Fetch qualification standings for seeding */
      const qualifications = await qualMdl(prisma).findMany({
        where: { tournamentId },
        include: { player: true },
        orderBy: [{ score: 'desc' }, { points: 'desc' }],
      });

      if (qualifications.length === 0) {
        return NextResponse.json(
          { error: 'No qualification results found' },
          { status: 400 },
        );
      }

      /* Map to BracketPlayer format with qualifying rank based on standing position */
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const players: BracketPlayer[] = qualifications.map((q: any, index: number) => ({
        playerId: q.playerId,
        playerName: q.player.name,
        playerNickname: q.player.nickname,
        qualifyingRank: index + 1,
        losses: 0,
        points: q.points,
      }));

      /* Generate the complete double-elimination bracket structure */
      const bracket = generateDoubleEliminationBracket(players, config.eventCode);

      const bracketData = {
        winnerBracket: bracket.winnerBracket,
        loserBracket: bracket.loserBracket,
        grandFinal: bracket.grandFinal,
        totalPlayers: players.length,
      };

      /* Record audit log for bracket generation (security and accountability) */
      try {
        await createAuditLog({
          userId: session.user.id,
          ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown',
          userAgent: request.headers.get('user-agent') || 'unknown',
          action: AUDIT_ACTIONS.CREATE_BRACKET,
          targetId: tournamentId,
          targetType: 'Tournament',
          details: {
            tournamentId,
            bracketSize: players.length,
            winnerCount: bracket.winnerBracket.length,
            loserCount: bracket.loserBracket.length,
          },
        });
      } catch (logError) {
        /* Audit log failure is non-critical but should be logged for security tracking */
        logger.warn('Failed to create audit log', { error: logError, tournamentId, action: 'CREATE_BRACKET' });
      }

      return NextResponse.json(bracketData);
    } catch (error) {
      logger.error('Failed to generate bracket', { error, tournamentId });
      return NextResponse.json(
        { error: 'Failed to generate bracket' },
        { status: 500 },
      );
    }
  }

  return { GET, POST };
}
