/**
 * Qualification Route Factory
 *
 * Generates GET/POST/PUT handlers for qualification API routes.
 * Takes an EventTypeConfig and returns route handlers that use the
 * config's scoring rules, model names, and behavior settings.
 *
 * This eliminates ~300 lines of duplicated code across BM, MR, and GP routes
 * while preserving identical API response shapes for each event type.
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { createAuditLog } from '@/lib/audit-log';
import { getServerSideIdentifier } from '@/lib/rate-limit';
import { sanitizeInput } from '@/lib/sanitize';
import { createLogger } from '@/lib/logger';
import { EventTypeConfig } from '@/lib/event-types/types';

/**
 * Create qualification route handlers from an event type configuration.
 *
 * @param config - Event type configuration (BM, MR, or GP)
 * @returns Object with GET, POST, PUT handler functions
 */
export function createQualificationHandlers(config: EventTypeConfig) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const qualModel = (p: any) => p[config.qualificationModel];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const matchModel = (p: any) => p[config.matchModel];

  /**
   * GET handler: Fetch qualification standings and matches for a tournament.
   */
  async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
  ) {
    const logger = createLogger(config.loggerName);
    const { id: tournamentId } = await params;

    try {
      const qualifications = await qualModel(prisma).findMany({
        where: { tournamentId },
        include: { player: true },
        orderBy: config.qualificationOrderBy,
      });

      const matches = await matchModel(prisma).findMany({
        where: { tournamentId, stage: 'qualification' },
        include: { player1: true, player2: true },
        orderBy: { matchNumber: 'asc' },
      });

      return NextResponse.json({ qualifications, matches });
    } catch (error) {
      logger.error(`Failed to fetch ${config.eventDisplayName} data`, { error, tournamentId });
      return NextResponse.json(
        { error: `Failed to fetch ${config.eventDisplayName} data` },
        { status: 500 },
      );
    }
  }

  /**
   * POST handler: Setup qualification groups and generate round-robin matches.
   * Auth is always checked when postRequiresAuth is true.
   * Audit logging is performed when auditAction is configured.
   */
  async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
  ) {
    const logger = createLogger(config.loggerName);

    /* Auth check - uses let for proper scoping (not var) */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let currentSession: any = null;
    if (config.postRequiresAuth) {
      const session = await auth();
      if (!session?.user || session.user.role !== 'admin') {
        return NextResponse.json(
          { error: 'Forbidden' },
          { status: 403 },
        );
      }
      currentSession = session;
    }

    const { id: tournamentId } = await params;

    try {
      const body = sanitizeInput(await request.json());
      const { players } = body;

      if (!players || !Array.isArray(players) || players.length === 0) {
        return NextResponse.json(
          { error: 'Players array is required' },
          { status: 400 },
        );
      }

      /* Clear existing qualification data for fresh setup */
      await qualModel(prisma).deleteMany({ where: { tournamentId } });
      await matchModel(prisma).deleteMany({ where: { tournamentId, stage: 'qualification' } });

      /* Create qualification records for each player */
      const qualifications = await Promise.all(
        players.map((p: { playerId: string; group: string; seeding?: number }) =>
          qualModel(prisma).create({
            data: { tournamentId, playerId: p.playerId, group: p.group, seeding: p.seeding },
          }),
        ),
      );

      /* Generate round-robin matches within each group */
      const groups = [...new Set(players.map((p: { group: string }) => p.group))];
      let matchNumber = 1;

      for (const group of groups) {
        const groupPlayers = players.filter((p: { group: string }) => p.group === group);
        for (let i = 0; i < groupPlayers.length; i++) {
          for (let j = i + 1; j < groupPlayers.length; j++) {
            await matchModel(prisma).create({
              data: {
                tournamentId,
                matchNumber,
                stage: 'qualification',
                player1Id: groupPlayers[i].playerId,
                player2Id: groupPlayers[j].playerId,
              },
            });
            matchNumber++;
          }
        }
      }

      /* Audit logging if configured */
      if (config.auditAction && currentSession) {
        try {
          const ip = await getServerSideIdentifier();
          const userAgent = request.headers.get('user-agent') || 'unknown';
          await createAuditLog({
            userId: currentSession.user.id,
            ipAddress: ip,
            userAgent,
            action: config.auditAction,
            targetId: tournamentId,
            targetType: 'Tournament',
            details: { mode: 'qualification', playerCount: players.length },
          });
        } catch (logError) {
          logger.warn('Failed to create audit log', {
            error: logError,
            tournamentId,
            action: config.auditAction,
          });
        }
      }

      return NextResponse.json(
        { message: config.setupCompleteMessage, qualifications },
        { status: 201 },
      );
    } catch (error) {
      logger.error(`Failed to setup ${config.eventDisplayName}`, { error, tournamentId });
      return NextResponse.json(
        { error: `Failed to setup ${config.eventDisplayName}` },
        { status: 500 },
      );
    }
  }

  /**
   * PUT handler: Update a match score and recalculate both players' standings.
   */
  async function PUT(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
  ) {
    const logger = createLogger(config.loggerName);

    /* Auth check for PUT endpoint */
    if (config.putRequiresAuth) {
      const session = await auth();
      if (!session?.user || session.user.role !== 'admin') {
        return NextResponse.json(
          { error: 'Forbidden' },
          { status: 403 },
        );
      }
    }

    const { id: tournamentId } = await params;

    try {
      const body = await request.json();
      const parseResult = config.parsePutBody(body);

      if (!parseResult.valid) {
        return NextResponse.json({ error: parseResult.error }, { status: 400 });
      }

      const putData = parseResult.data!;
      const { match, score1OrPoints1, score2OrPoints2 } = await config.updateMatch(prisma, putData);
      const { result1, result2 } = config.calculateMatchResult(score1OrPoints1, score2OrPoints2);

      /* Fetch all completed matches for both players to recalculate standings */
      const player1Matches = await matchModel(prisma).findMany({
        where: {
          tournamentId,
          stage: 'qualification',
          completed: true,
          OR: [{ player1Id: match.player1Id }, { player2Id: match.player1Id }],
        },
      });

      const player2Matches = await matchModel(prisma).findMany({
        where: {
          tournamentId,
          stage: 'qualification',
          completed: true,
          OR: [{ player1Id: match.player2Id }, { player2Id: match.player2Id }],
        },
      });

      /* Aggregate stats and update qualification records */
      const p1 = config.aggregatePlayerStats(
        player1Matches, match.player1Id, config.calculateMatchResult,
      );
      const p2 = config.aggregatePlayerStats(
        player2Matches, match.player2Id, config.calculateMatchResult,
      );

      await qualModel(prisma).updateMany({
        where: { tournamentId, playerId: match.player1Id },
        data: p1.qualificationData,
      });

      await qualModel(prisma).updateMany({
        where: { tournamentId, playerId: match.player2Id },
        data: p2.qualificationData,
      });

      return NextResponse.json({ match, result1, result2 });
    } catch (error) {
      logger.error('Failed to update match', { error, tournamentId });
      return NextResponse.json(
        { error: 'Failed to update match' },
        { status: 500 },
      );
    }
  }

  return { GET, POST, PUT };
}
