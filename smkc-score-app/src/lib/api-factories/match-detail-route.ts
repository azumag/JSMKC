/**
 * Match Detail Route Factory
 *
 * Generates GET/PUT handlers for individual match API routes.
 * Supports two response styles:
 * - 'structured': Uses error-handling helpers (BM pattern)
 * - 'raw': Uses raw NextResponse.json (MR/GP pattern)
 *
 * Eliminates duplicated code across BM, MR, and GP match detail routes
 * while preserving identical API response shapes for each event type.
 */

import { NextRequest, NextResponse } from 'next/server';
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
 * @property responseStyle - 'structured' (BM) or 'raw' (MR/GP)
 * @property getErrorMessage - Error message for GET 500 response (raw style)
 * @property getLogMessage - Log message for GET errors (raw style, defaults to getErrorMessage)
 * @property putErrorMessage - Error message for PUT 500 response (raw style)
 * @property includeSuccessInGetErrors - Whether to include success:false in GET error responses (raw style)
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
  responseStyle: 'structured' | 'raw';
  getErrorMessage?: string;
  getLogMessage?: string;
  putErrorMessage?: string;
  includeSuccessInGetErrors?: boolean;
  /** Whether PUT endpoint requires admin authentication */
  putRequiresAuth?: boolean;
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

  const getErrMsg = config.getErrorMessage || 'Failed to fetch match';
  const getLogMsg = config.getLogMessage || getErrMsg;
  const putErrMsg = config.putErrorMessage || 'Failed to update match';

  /**
   * GET handler: Fetch a single match by matchId with player details.
   */
  async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string; matchId: string }> },
  ) {
    const logger = createLogger(config.loggerName);
    const { matchId } = await params;

    try {
      const match = await model(prisma).findUnique({
        where: { id: matchId },
        include: { player1: true, player2: true },
      });

      if (!match) {
        if (config.responseStyle === 'structured') {
          return handleValidationError('Match not found', 'matchId');
        }
        if (config.includeSuccessInGetErrors) {
          return NextResponse.json(
            { success: false, error: 'Match not found' },
            { status: 404 },
          );
        }
        return NextResponse.json(
          { error: 'Match not found' },
          { status: 404 },
        );
      }

      if (config.responseStyle === 'structured') {
        return createSuccessResponse(match);
      }
      return NextResponse.json(match);
    } catch (error) {
      if (config.responseStyle === 'structured') {
        return handleDatabaseError(error, 'fetch match');
      }

      logger.error(getLogMsg, { error, matchId });

      if (config.includeSuccessInGetErrors) {
        return NextResponse.json(
          { success: false, error: getErrMsg },
          { status: 500 },
        );
      }
      return NextResponse.json(
        { error: getErrMsg },
        { status: 500 },
      );
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
        if (config.responseStyle === 'structured') {
          return createErrorResponse('Forbidden', 403, 'FORBIDDEN');
        }
        return NextResponse.json(
          { success: false, error: 'Forbidden' },
          { status: 403 },
        );
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
        if (config.responseStyle === 'structured') {
          return handleValidationError(msg, 'scores');
        }
        return NextResponse.json(
          { success: false, error: msg },
          { status: 400 },
        );
      }

      /* Version is mandatory to enable optimistic locking */
      if (typeof version !== 'number') {
        const msg = 'version is required and must be a number';
        if (config.responseStyle === 'structured') {
          return handleValidationError(msg, 'version');
        }
        return NextResponse.json(
          { success: false, error: msg },
          { status: 400 },
        );
      }

      const result = await config.updateMatchScore(
        prisma, matchId, version, val1, val2, completed, detail,
      );

      /* Re-fetch the updated match with player relations for the response */
      const updatedMatch = await model(prisma).findUnique({
        where: { id: matchId },
        include: { player1: true, player2: true },
      });

      if (config.responseStyle === 'structured') {
        return createSuccessResponse({
          match: updatedMatch,
          version: result.version,
        });
      }
      return NextResponse.json({
        success: true,
        data: updatedMatch,
        version: result.version,
      });
    } catch (error) {
      logger.error(putErrMsg, { error, matchId });

      if (error instanceof OptimisticLockError) {
        if (config.responseStyle === 'structured') {
          return createErrorResponse(
            'The match was modified by another user. Please refresh and try again.',
            409,
            'VERSION_CONFLICT',
            { currentVersion: error.currentVersion },
          );
        }
        return NextResponse.json(
          {
            success: false,
            error: 'Version conflict',
            message: 'The match was modified by another user. Please refresh and try again.',
            currentVersion: error.currentVersion,
          },
          { status: 409 },
        );
      }

      if (config.responseStyle === 'structured') {
        return handleDatabaseError(error, 'update match');
      }
      return NextResponse.json(
        { success: false, error: putErrMsg },
        { status: 500 },
      );
    }
  }

  return { GET, PUT };
}
