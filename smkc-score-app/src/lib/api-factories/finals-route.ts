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
import { createErrorResponse, createSuccessResponse, handleValidationError, handleRateLimitError } from '@/lib/error-handling';
import { checkRateLimit } from '@/lib/rate-limit';
import { getClientIdentifier } from '@/lib/request-utils';
import { resolveTournamentId } from '@/lib/tournament-identifier';

/**
 * Bracket size inference thresholds.
 * 8-player bracket = 17 matches, 16-player bracket = 31 matches.
 * Threshold of 20 distinguishes between the two (>20 means 16-player).
 */
const BRACKET_SIZE_THRESHOLD = 20;

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
  /** Ordering for qualification standings to determine seeding */
  qualificationOrderBy: Array<Record<string, 'asc' | 'desc'>>;
  /** GET response style: 'grouped' (BM), 'simple' (MR), 'paginated' (GP) */
  getStyle: 'grouped' | 'simple' | 'paginated';
  /** Database field names for score storage in PUT updates */
  putScoreFields: { dbField1: string; dbField2: string };
  /** Additional body fields to include in PUT update data (e.g. 'rounds' for MR) */
  putAdditionalFields?: string[];
  /** Number of wins required to complete a finals match. Defaults to 3. */
  targetWins?: number;
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
    const { id } = await params;
    const tournamentId = await resolveTournamentId(id);

    // Defensive: verify tournament exists before querying matches
    const tournament = await prisma.tournament.findUnique({
      where: { id: tournamentId },
    });
    if (!tournament) {
      return createErrorResponse('Tournament not found', 404, 'NOT_FOUND');
    }

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
          { page, limit, include: { player1: true, player2: true } },
        );

        /* Infer bracket size from total match count:
         * 8-player bracket = 17 matches, 16-player bracket = 31 matches.
         * Use count > 20 as threshold to distinguish.
         * Use result.meta.total from paginate() to avoid an extra count query. */
        const bracketSize = (result.meta.total ?? 0) > BRACKET_SIZE_THRESHOLD ? 16 : 8;

        const bracketStructure = result.data.length > 0
          ? generateBracketStructure(bracketSize)
          : [];

        return createSuccessResponse({
          ...result,
          bracketStructure,
          bracketSize,
          roundNames,
        });
      }

      /* Shared fetch for 'grouped' and 'simple' styles */
      const matches = await model(prisma).findMany({
        where: { tournamentId, stage: 'finals' },
        include: { player1: true, player2: true },
        orderBy: { matchNumber: 'asc' },
      });

      /* Infer bracket size from match count:
       * 8-player bracket = 17 matches, 16-player bracket = 31 matches.
       * Use count > 20 as threshold to distinguish. */
      const bracketSize = matches.length > BRACKET_SIZE_THRESHOLD ? 16 : 8;

      const bracketStructure = matches.length > 0
        ? generateBracketStructure(bracketSize)
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

        return createSuccessResponse({
          matches,
          winnersMatches,
          losersMatches,
          grandFinalMatches,
          bracketStructure,
          bracketSize,
          roundNames,
        });
      }

      /* 'simple' style */
      return createSuccessResponse({
        matches,
        bracketStructure,
        bracketSize,
        roundNames,
      });
    } catch (error) {
      logger.error(config.getErrorMessage, { error, tournamentId });
      return createErrorResponse(config.getErrorMessage, 500, 'INTERNAL_ERROR');
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
        return createErrorResponse('Forbidden', 403, 'FORBIDDEN');
      }
    }

    /* Rate limit: prevent abuse on bracket creation */
    const postClientIp = getClientIdentifier(request);
    const postRateResult = await checkRateLimit('general', postClientIp);
    if (!postRateResult.success) {
      return handleRateLimitError(postRateResult.retryAfter);
    }

    const { id } = await params;
    const tournamentId = await resolveTournamentId(id);

    try {
      /* Defense-in-depth: always sanitize user input */
      const body = sanitizeInput(await request.json());
      const { topN = 8 } = body;

      /* Support 8-player and 16-player brackets (§4.2) */
      if (topN !== 8 && topN !== 16) {
        return handleValidationError('Only 8-player and 16-player brackets are supported', 'topN');
      }

      const qualifications = await qualModel(prisma).findMany({
        where: { tournamentId },
        include: { player: true },
        orderBy: config.qualificationOrderBy,
        take: topN,
      });

      if (qualifications.length < topN) {
        return handleValidationError(
          `Not enough players qualified. Need ${topN}, found ${qualifications.length}`,
          'qualifications',
        );
      }

      const bracketStructure = generateBracketStructure(topN);

      /* Delete existing finals matches first to avoid unique-constraint violations
       * when recreating a bracket (e.g., "reset" scenario in TC-504).
       * If creation fails afterward the tournament will have no finals matches,
       * but this is unavoidable without a true transaction. */
      await model(prisma).deleteMany({
        where: { tournamentId, stage: 'finals' },
      });

      const seededPlayers = qualifications.map(
        (q: { playerId: string; player: unknown }, index: number) => ({
          seed: index + 1,
          playerId: q.playerId,
          player: q.player,
        }),
      );

      /*
       * Bulk-insert bracket matches (issue #420). Replaces a sequential
       * for-loop of N create() calls with a single createMany() — for an
       * 8-player bracket that's 17 round-trips collapsed into 1, and 31
       * for a 16-player bracket. createMany on D1 doesn't return the
       * inserted rows, so we re-fetch with includes after insertion to
       * preserve the existing response shape (player1/player2 relations).
       */
      const matchPlans = bracketStructure.map((bracketMatch) => {
        const player1 = bracketMatch.player1Seed
          ? seededPlayers.find((p: { seed: number }) => p.seed === bracketMatch.player1Seed)
          : null;
        const player2 = bracketMatch.player2Seed
          ? seededPlayers.find((p: { seed: number }) => p.seed === bracketMatch.player2Seed)
          : null;
        return {
          bracketMatch,
          player1,
          player2,
          data: {
            tournamentId,
            matchNumber: bracketMatch.matchNumber,
            stage: 'finals',
            round: bracketMatch.round,
            player1Id: player1?.playerId || seededPlayers[0].playerId,
            player2Id: player2?.playerId || player1?.playerId || seededPlayers[0].playerId,
            completed: false,
          },
        };
      });

      await model(prisma).createMany({ data: matchPlans.map((p) => p.data) });

      const insertedMatches = await model(prisma).findMany({
        where: { tournamentId, stage: 'finals' },
        include: { player1: true, player2: true },
        orderBy: { matchNumber: 'asc' },
      });

      // Map by matchNumber so we can attach the bracket metadata that's not
      // stored in the DB (hasPlayer1/hasPlayer2/seed) to each fetched row.
      const insertedByNumber = new Map<number, (typeof insertedMatches)[number]>(
        insertedMatches.map((m: { matchNumber: number }) => [m.matchNumber, m]),
      );
      const createdMatches = matchPlans
        .map((p) => {
          const match = insertedByNumber.get(p.bracketMatch.matchNumber);
          if (!match) return null;
          return {
            ...match,
            hasPlayer1: !!p.player1,
            hasPlayer2: !!p.player2,
            player1Seed: p.bracketMatch.player1Seed,
            player2Seed: p.bracketMatch.player2Seed,
          };
        })
        .filter((m): m is NonNullable<typeof m> => m !== null);

      return createSuccessResponse({
        message: 'Finals bracket created',
        matches: createdMatches,
        seededPlayers,
        bracketStructure,
      }, 'Finals bracket created', { status: 201 });
    } catch (error) {
      logger.error('Failed to create finals', { error, tournamentId });
      return createErrorResponse(config.postErrorMessage, 500, 'INTERNAL_ERROR');
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
        return createErrorResponse('Forbidden', 403, 'FORBIDDEN');
      }
    }

    /* Rate limit: prevent abuse on finals score update */
    const putClientIp = getClientIdentifier(request);
    const putRateResult = await checkRateLimit('scoreInput', putClientIp);
    if (!putRateResult.success) {
      return handleRateLimitError(putRateResult.retryAfter);
    }

    const { id } = await params;
    const tournamentId = await resolveTournamentId(id);

    try {
      /* Defense-in-depth: always sanitize user input */
      const body = sanitizeInput(await request.json());
      const { matchId, score1, score2 } = body;

      if (!matchId || score1 === undefined || score2 === undefined) {
        return handleValidationError('matchId, score1, and score2 are required', 'request');
      }

      const match = await model(prisma).findUnique({
        where: { id: matchId, tournamentId },
        include: { player1: true, player2: true },
      });

      if (!match) {
        return createErrorResponse('Finals match not found', 404, 'NOT_FOUND');
      }

      /* Defensive: reject non-finals stage to prevent cross-stage bracket mutation.
       * Qualification matches should never trigger bracket advancement logic. */
      if (match.stage !== 'finals') {
        return createErrorResponse('Finals match not found', 404, 'NOT_FOUND');
      }

      const targetWins = config.targetWins ?? 3;
      const player1ReachedTarget = score1 >= targetWins;
      const player2ReachedTarget = score2 >= targetWins;

      if (player1ReachedTarget === player2ReachedTarget) {
        return handleValidationError(`Match must have a winner (first to ${targetWins})`, 'score');
      }

      const winnerId = player1ReachedTarget ? match.player1Id : match.player2Id;
      const loserId = player1ReachedTarget ? match.player2Id : match.player1Id;

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

      /* Infer bracket size from total finals match count:
       * 8-player bracket = 17 matches, 16-player bracket = 31 matches.
       * Threshold of 20 distinguishes between the two (>20 means 16-player).
       * This ensures correct bracket routing for both sizes in PUT handler. */
      const totalFinalsMatches = await model(prisma).count({
        where: { tournamentId, stage: 'finals' },
      });
      const bracketSize = totalFinalsMatches > BRACKET_SIZE_THRESHOLD ? 16 : 8;

      /* Bracket progression: advance winner and loser to next matches */
      const bracketStructure = generateBracketStructure(bracketSize);
      const matchNumber = Number(match.matchNumber ?? updatedMatch.matchNumber);
      const currentBracketMatch = bracketStructure.find(
        (b) => b.matchNumber === matchNumber,
      );

      if (!currentBracketMatch) {
        return createSuccessResponse({ match: updatedMatch });
      }

      const updateRoutedMatch = async (
        targetMatchNumber: number,
        position: 1 | 2,
        playerId: string,
      ) => {
        try {
          await model(prisma).updateMany({
            where: {
              tournamentId,
              matchNumber: targetMatchNumber,
              stage: 'finals',
            },
            data: position === 1 ? { player1Id: playerId } : { player2Id: playerId },
          });
        } catch {
          /* Missing future bracket slots are tolerated for partially generated brackets. */
        }
      };

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
          await updateRoutedMatch(currentBracketMatch.winnerGoesTo, position, winnerId);
        } else {
          await updateRoutedMatch(currentBracketMatch.winnerGoesTo, currentBracketMatch.position || 1, winnerId);
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

        let loserPosition: 1 | 2 = 1;
        if (currentBracketMatch.round === 'winners_qf') {
          /* 16-player: losers from QF enter L_R2 at position 2.
           * 8-player: uses parity-based calculation ((matchNumber-1)%2 + 1). */
          loserPosition = bracketSize === 16 ? 2 : (((matchNumber - 1) % 2) + 1) as 1 | 2;
        } else if (currentBracketMatch.round === 'winners_sf') {
          loserPosition = 1;
        } else if (currentBracketMatch.round === 'winners_final') {
          loserPosition = 2;
        }

        if (nextLoserMatch) {
          await model(prisma).update({
            where: { id: nextLoserMatch.id },
            data:
              loserPosition === 1
                ? { player1Id: loserId }
                : { player2Id: loserId },
          });
          await updateRoutedMatch(currentBracketMatch.loserGoesTo, loserPosition, loserId);
        } else {
          await updateRoutedMatch(currentBracketMatch.loserGoesTo, loserPosition, loserId);
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
          } else {
            await model(prisma).updateMany({
              where: {
                tournamentId,
                stage: 'finals',
                round: 'grand_final_reset',
              },
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

      return createSuccessResponse({
        match: updatedMatch,
        winnerId,
        loserId,
        isComplete,
        champion,
      });
    } catch (error) {
      logger.error('Failed to update finals match', { error, tournamentId });
      return createErrorResponse('Failed to update match', 500, 'INTERNAL_ERROR');
    }
  }

  return { GET, POST, PUT };
}
