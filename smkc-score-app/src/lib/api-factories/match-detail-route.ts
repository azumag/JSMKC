/**
 * Match Detail Route Factory
 *
 * Generates GET/PUT handlers for individual match API routes.
 * Uses structured responses (error-handling helpers) for consistent
 * API response format across all game modes (BM, MR, GP).
 *
 * Eliminates duplicated code across BM, MR, and GP match detail routes
 * while preserving identical API response shapes for each event type.
 */

import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { OptimisticLockError } from '@/lib/optimistic-locking';
import { sanitizeInput } from '@/lib/sanitize';
import {
  createErrorResponse,
  createSuccessResponse,
  handleValidationError,
  handleDatabaseError,
} from '@/lib/error-handling';
import { createLogger } from '@/lib/logger';

/**
 * Configuration for the match detail route factory.
 *
 * @property matchModel - Prisma model key (e.g., 'bMMatch', 'mRMatch', 'gPMatch')
 * @property loggerName - Logger service name (e.g., 'bm-match-api')
 * @property scoreFields - Score field names in the request body
 * @property detailField - Detail field name ('rounds' for BM/MR, 'races' for GP)
 * @property updateMatchScore - Optimistic locking update function
 * @property sanitizeBody - Whether to apply sanitizeInput to the request body
 * @property putRequiresAuth - Whether PUT endpoint requires admin authentication
 * @property validateScores - Optional score validation function
 */
export interface MatchDetailConfig {
  matchModel: string;
  loggerName: string;
  scoreFields: { field1: string; field2: string };
  detailField: string;
  updateMatchScore: (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    prisma: any,
    matchId: string,
    version: number,
    val1: number,
    val2: number,
    completed: boolean,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    detail?: any,
  ) => Promise<{ version: number }>;
  sanitizeBody?: boolean;
  /** Whether PUT endpoint requires admin authentication */
  putRequiresAuth?: boolean;
  /**
   * Optional score validation function called before updateMatchScore.
   * Receives the two score values from the request body.
   * Return { isValid: false, error: string } to reject the request with 400.
   * If omitted, no score validation is performed on the admin PUT path.
   */
  validateScores?: (val1: number, val2: number) => { isValid: boolean; error?: string };
}

/**
 * Create match detail route handlers from a configuration object.
 *
 * @param config - Match detail route configuration
 * @returns Object with GET and PUT handler functions
 */
export function createMatchDetailHandlers(config: MatchDetailConfig) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const model = (p: any) => p[config.matchModel];

  /**
   * GET handler: Fetch a single match by matchId with player details.
   */
  async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string; matchId: string }> },
  ) {
    const { matchId } = await params;

    try {
      const match = await model(prisma).findUnique({
        where: { id: matchId },
        include: { player1: true, player2: true },
      });

      if (!match) {
        return createErrorResponse('Match not found', 404, 'NOT_FOUND');
      }

      return createSuccessResponse(match);
    } catch (error) {
      return handleDatabaseError(error, 'fetch match');
    }
  }

  /**
   * PUT handler: Update match score with optimistic locking.
   * Requires version number for conflict detection.
   */
  async function PUT(
    request: NextRequest,
    { params }: { params: Promise<{ id: string; matchId: string }> },
  ) {
    const logger = createLogger(config.loggerName);

    /* Auth check for PUT endpoint */
    if (config.putRequiresAuth) {
      const session = await auth();
      if (!session?.user || session.user.role !== 'admin') {
        return createErrorResponse('Forbidden', 403, 'FORBIDDEN');
      }
    }

    const { matchId } = await params;

    try {
      let body = await request.json();

      if (config.sanitizeBody) {
        body = sanitizeInput(body);
      }

      const val1 = body[config.scoreFields.field1];
      const val2 = body[config.scoreFields.field2];
      const { completed, version } = body;
      const detail = body[config.detailField];

      /* Both score fields are required for any match update */
      if (val1 === undefined || val2 === undefined) {
        const msg = `${config.scoreFields.field1} and ${config.scoreFields.field2} are required`;
        return handleValidationError(msg, 'scores');
      }

      /* Version is mandatory to enable optimistic locking */
      if (typeof version !== 'number') {
        return handleValidationError('version is required and must be a number', 'version');
      }

      /* Optional score validation (e.g. BM: sum must be 4, no ties) */
      if (config.validateScores) {
        const scoreValidation = config.validateScores(val1, val2);
        if (!scoreValidation.isValid) {
          return handleValidationError(scoreValidation.error ?? 'Invalid scores', 'scores');
        }
      }

      const result = await config.updateMatchScore(
        prisma, matchId, version, val1, val2, completed, detail,
      );

      /* Re-fetch the updated match with player relations for the response */
      const updatedMatch = await model(prisma).findUnique({
        where: { id: matchId },
        include: { player1: true, player2: true },
      });

      return createSuccessResponse({
        match: updatedMatch,
        version: result.version,
      });
    } catch (error) {
      logger.error('Failed to update match', { error, matchId });

      if (error instanceof OptimisticLockError) {
        return createErrorResponse(
          'The match was modified by another user. Please refresh and try again.',
          409,
          'VERSION_CONFLICT',
          { currentVersion: error.currentVersion },
        );
      }

      return handleDatabaseError(error, 'update match');
    }
  }

  return { GET, PUT };
}
