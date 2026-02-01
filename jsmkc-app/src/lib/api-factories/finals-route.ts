/**
 * Finals Route Factory
 *
 * Generates GET/POST/PUT handlers for double-elimination finals API routes.
 * Eliminates ~400 lines of duplicated bracket logic across BM, MR, and GP
 * finals while preserving each event type's unique response shape and
 * score field mapping.
 *
 * GET styles:
 *   - 'grouped' (BM): matches split into winners/losers/grandFinal arrays
 *   - 'simple'  (MR): flat matches array with bracket metadata
 *   - 'paginated' (GP): paginated matches with bracket metadata
 *
 * POST: Creates an 8-player double-elimination bracket from qualification standings.
 * PUT:  Updates a match score and auto-advances players through the bracket.
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { generateBracketStructure, roundNames } from '@/lib/double-elimination';
import { paginate } from '@/lib/pagination';
import { sanitizeInput } from '@/lib/sanitize';
import { createLogger } from '@/lib/logger';

/**
 * Configuration for a finals route handler set.
 *
 * Each event type (BM, MR, GP) supplies its own config to produce
 * handlers with the correct Prisma model, score fields, and response shape.
 */
export interface FinalsConfig {
  /** Prisma model name for match records (e.g. 'bMMatch') */
  matchModel: string;
  /** Prisma model name for qualification records (e.g. 'bMQualification') */
  qualificationModel: string;
  /** Logger service name for structured logging */
  loggerName: string;
  /** Whether to sanitize PUT request body with sanitizeInput */
  sanitizePutBody?: boolean;
  /** Whether to sanitize POST request body with sanitizeInput */
  sanitizePostBody?: boolean;
  /** Ordering for qualification standings to determine seeding */
  qualificationOrderBy: Array<Record<string, 'asc' | 'desc'>>;
  /** GET response style: 'grouped' (BM), 'simple' (MR), 'paginated' (GP) */
  getStyle: 'grouped' | 'simple' | 'paginated';
  /** Database field names for score storage in PUT updates */
  putScoreFields: { dbField1: string; dbField2: string };
  /** Additional body fields to include in PUT update data (e.g. 'rounds' for MR) */
  putAdditionalFields?: string[];
  /** Error message returned when GET fails */
  getErrorMessage: string;
  /** Error message returned when POST fails */
  postErrorMessage: string;
  /** Whether POST endpoint requires admin authentication */
  postRequiresAuth?: boolean;
  /** Whether PUT endpoint requires admin authentication */
  putRequiresAuth?: boolean;
}

/**
 * Create GET/POST/PUT handlers for a finals route from configuration.
 *
 * @param config - Event-type-specific finals configuration
 * @returns Object with GET, POST, PUT Next.js route handler functions
 */
export function createFinalsHandlers(config: FinalsConfig) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const model = (p: any) => p[config.matchModel];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const qualModel = (p: any) => p[config.qualificationModel];

  /**
   * GET handler: Fetch finals bracket data for a tournament.
   * Response shape depends on config.getStyle.
   */
  async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
  ) {
    const logger = createLogger(config.loggerName);
    const { id: tournamentId } = await params;

    try {
      if (config.getStyle === 'paginated') {
        const { searchParams } = new URL(request.url);
        const page = Number(searchParams.get('page')) || 1;
        const limit = Number(searchParams.get('limit')) || 50;

        const modelInstance = model(prisma);
        const result = await paginate(
          {
            findMany: modelInstance.findMany.bind(modelInstance),
            count: modelInstance.count.bind(modelInstance),
          },
          { tournamentId, stage: 'finals' },
          { matchNumber: 'asc' },
          { page, limit },
        );

        const bracketStructure = result.data.length > 0
          ? generateBracketStructure(8)
          : [];

        return NextResponse.json({
          ...result,
          bracketStructure,
          roundNames,
        });
      }

      /* Shared fetch for 'grouped' and 'simple' styles */
      const matches = await model(prisma).findMany({
        where: { tournamentId, stage: 'finals' },
        include: { player1: true, player2: true },
        orderBy: { matchNumber: 'asc' },
      });

      const bracketStructure = matches.length > 0
        ? generateBracketStructure(8)
        : [];

      if (config.getStyle === 'grouped') {
        const winnersMatches = matches.filter(
          (m: { round?: string }) => m.round?.startsWith('winners_') || false,
        );
        const losersMatches = matches.filter(
          (m: { round?: string }) => m.round?.startsWith('losers_') || false,
        );
        const grandFinalMatches = matches.filter(
          (m: { round?: string }) => m.round?.startsWith('grand_final') || false,
        );

        return NextResponse.json({
          matches,
          winnersMatches,
          losersMatches,
          grandFinalMatches,
          bracketStructure,
          roundNames,
        });
      }

      /* 'simple' style */
      return NextResponse.json({
        matches,
        bracketStructure,
        roundNames,
      });
    } catch (error) {
      logger.error(config.getErrorMessage, { error, tournamentId });
      return NextResponse.json(
        { error: config.getErrorMessage },
        { status: 500 },
      );
    }
  }

  /**
   * POST handler: Create a double-elimination finals bracket from qualification standings.
   * Takes the top N players (default 8) and seeds them into the bracket.
   */
  async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
  ) {
    const logger = createLogger(config.loggerName);

    /* Auth check for POST endpoint */
    if (config.postRequiresAuth) {
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
      const rawBody = await request.json();
      const body = config.sanitizePostBody ? sanitizeInput(rawBody) : rawBody;
      const { topN = 8 } = body;

      if (topN !== 8) {
        return NextResponse.json(
          { error: 'Currently only 8-player brackets are supported' },
          { status: 400 },
        );
      }

      const qualifications = await qualModel(prisma).findMany({
        where: { tournamentId },
        include: { player: true },
        orderBy: config.qualificationOrderBy,
        take: topN,
      });

      if (qualifications.length < topN) {
        return NextResponse.json(
          {
            error: `Not enough players qualified. Need ${topN}, found ${qualifications.length}`,
          },
          { status: 400 },
        );
      }

      await model(prisma).deleteMany({
        where: { tournamentId, stage: 'finals' },
      });

      const bracketStructure = generateBracketStructure(topN);

      const seededPlayers = qualifications.map(
        (q: { playerId: string; player: unknown }, index: number) => ({
          seed: index + 1,
          playerId: q.playerId,
          player: q.player,
        }),
      );

      const createdMatches = [];
      for (const bracketMatch of bracketStructure) {
        const player1 = bracketMatch.player1Seed
          ? seededPlayers.find((p: { seed: number }) => p.seed === bracketMatch.player1Seed)
          : null;
        const player2 = bracketMatch.player2Seed
          ? seededPlayers.find((p: { seed: number }) => p.seed === bracketMatch.player2Seed)
          : null;

        const match = await model(prisma).create({
          data: {
            tournamentId,
            matchNumber: bracketMatch.matchNumber,
            stage: 'finals',
            round: bracketMatch.round,
            player1Id: player1?.playerId || seededPlayers[0].playerId,
            player2Id: player2?.playerId || seededPlayers[1].playerId,
            completed: false,
          },
          include: { player1: true, player2: true },
        });

        createdMatches.push({
          ...match,
          hasPlayer1: !!player1,
          hasPlayer2: !!player2,
          player1Seed: bracketMatch.player1Seed,
          player2Seed: bracketMatch.player2Seed,
        });
      }

      return NextResponse.json({
        message: 'Finals bracket created',
        matches: createdMatches,
        seededPlayers,
        bracketStructure,
      });
    } catch (error) {
      logger.error('Failed to create finals', { error, tournamentId });
      return NextResponse.json(
        { error: config.postErrorMessage },
        { status: 500 },
      );
    }
  }

  /**
   * PUT handler: Update a finals match result and advance players through the bracket.
   * Handles winner/loser advancement, grand final reset logic, and tournament completion.
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
      const rawBody = await request.json();
      const body = config.sanitizePutBody ? sanitizeInput(rawBody) : rawBody;
      const { matchId, score1, score2 } = body;

      if (!matchId || score1 === undefined || score2 === undefined) {
        return NextResponse.json(
          { error: 'matchId, score1, and score2 are required' },
          { status: 400 },
        );
      }

      const match = await model(prisma).findUnique({
        where: { id: matchId },
        include: { player1: true, player2: true },
      });

      if (!match || match.stage !== 'finals') {
        return NextResponse.json(
          { error: 'Finals match not found' },
          { status: 404 },
        );
      }

      /* Determine winner/loser: best of 5, first to 3 */
      const winnerId = score1 >= 3 ? match.player1Id : score2 >= 3 ? match.player2Id : null;
      const loserId = score1 >= 3 ? match.player2Id : score2 >= 3 ? match.player1Id : null;

      if (!winnerId) {
        return NextResponse.json(
          { error: 'Match must have a winner (best of 5: first to 3)' },
          { status: 400 },
        );
      }

      /* Build update data with configurable score field names */
      const updateData: Record<string, unknown> = {
        [config.putScoreFields.dbField1]: score1,
        [config.putScoreFields.dbField2]: score2,
        completed: true,
      };

      if (config.putAdditionalFields) {
        for (const field of config.putAdditionalFields) {
          if (body[field] !== undefined) {
            updateData[field] = body[field] || null;
          }
        }
      }

      const updatedMatch = await model(prisma).update({
        where: { id: matchId },
        data: updateData,
        include: { player1: true, player2: true },
      });

      /* Bracket progression: advance winner and loser to next matches */
      const bracketStructure = generateBracketStructure(8);
      const currentBracketMatch = bracketStructure.find(
        (b) => b.matchNumber === match.matchNumber,
      );

      if (!currentBracketMatch) {
        return NextResponse.json({ match: updatedMatch });
      }

      /* Advance winner to next match */
      if (currentBracketMatch.winnerGoesTo) {
        const nextWinnerMatch = await model(prisma).findFirst({
          where: {
            tournamentId,
            stage: 'finals',
            matchNumber: currentBracketMatch.winnerGoesTo,
          },
        });

        if (nextWinnerMatch) {
          const position = currentBracketMatch.position || 1;
          await model(prisma).update({
            where: { id: nextWinnerMatch.id },
            data:
              position === 1 ? { player1Id: winnerId } : { player2Id: winnerId },
          });
        }
      }

      /* Move loser to losers bracket */
      if (currentBracketMatch.loserGoesTo && loserId) {
        const nextLoserMatch = await model(prisma).findFirst({
          where: {
            tournamentId,
            stage: 'finals',
            matchNumber: currentBracketMatch.loserGoesTo,
          },
        });

        if (nextLoserMatch) {
          let loserPosition: 1 | 2 = 1;
          if (currentBracketMatch.round === 'winners_qf') {
            loserPosition = (((match.matchNumber - 1) % 2) + 1) as 1 | 2;
          } else if (currentBracketMatch.round === 'winners_sf') {
            loserPosition = 1;
          } else if (currentBracketMatch.round === 'winners_final') {
            loserPosition = 2;
          }

          await model(prisma).update({
            where: { id: nextLoserMatch.id },
            data:
              loserPosition === 1
                ? { player1Id: loserId }
                : { player2Id: loserId },
          });
        }
      }

      /* Grand Final: if losers champion wins, populate the reset match */
      if (currentBracketMatch.round === 'grand_final' && loserId) {
        const winnerFromLosers = match.player2Id === winnerId;

        if (winnerFromLosers) {
          const resetMatch = await model(prisma).findFirst({
            where: {
              tournamentId,
              stage: 'finals',
              round: 'grand_final_reset',
            },
          });

          if (resetMatch) {
            await model(prisma).update({
              where: { id: resetMatch.id },
              data: {
                player1Id: winnerId,
                player2Id: loserId,
              },
            });
          }
        }
      }

      /* Check if the tournament is complete */
      let isComplete = false;
      let champion = null;

      if (currentBracketMatch.round === 'grand_final') {
        const winnerWasFromWinners = match.player1Id === winnerId;
        if (winnerWasFromWinners) {
          isComplete = true;
          champion = winnerId;
        }
      } else if (currentBracketMatch.round === 'grand_final_reset') {
        isComplete = true;
        champion = winnerId;
      }

      return NextResponse.json({
        match: updatedMatch,
        winnerId,
        loserId,
        isComplete,
        champion,
      });
    } catch (error) {
      logger.error('Failed to update finals match', { error, tournamentId });
      return NextResponse.json(
        { error: 'Failed to update match' },
        { status: 500 },
      );
    }
  }

  return { GET, POST, PUT };
}
