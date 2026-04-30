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
import { PLAYER_PUBLIC_SELECT } from '@/lib/prisma-selects';
import prisma from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { OptimisticLockError } from '@/lib/optimistic-locking';
import { sanitizeInput } from '@/lib/sanitize';
import {
  createErrorResponse,
  createSuccessResponse,
  handleValidationError,
  handleDatabaseError,
  handleRateLimitError,
} from '@/lib/error-handling';
import { createLogger } from '@/lib/logger';
import { checkRateLimit } from '@/lib/rate-limit';
import { getClientIdentifier } from '@/lib/request-utils';
import { checkQualificationConfirmed } from '@/lib/qualification-confirmed-check';
import { resolveTournamentId } from '@/lib/tournament-identifier';
import { invalidate as invalidateStandingsCache } from '@/lib/standings-cache';
import { invalidateOverallRankingsCache } from '@/lib/points/overall-ranking';
import { retryDbRead } from '@/lib/db-read-retry';
import { recalculatePlayerStats, type RecalculateStatsConfig } from './score-report-helpers';

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
  /** Whether GET endpoint requires authentication (player or admin). Defaults to false for backward compatibility. */
  getRequiresAuth?: boolean;
  /**
   * Optional score validation function called before updateMatchScore.
   * Receives the two score values from the request body.
   * Return { isValid: false, error: string } to reject the request with 400.
   * If omitted, no score validation is performed on the admin PUT path.
   * Applied only to qualification matches; see validateFinalsScores for finals.
   */
  validateScores?: (val1: number, val2: number) => { isValid: boolean; error?: string };
  /**
   * Optional score validation function for finals matches (stage !== 'qualification').
   * If omitted, no validation is performed on finals scores.
   * BM finals use best-of-9 (max score = 5) which differs from qualification (max 4, sum = 4).
   */
  validateFinalsScores?: (
    val1: number,
    val2: number,
    context?: { round?: string | null; stage?: string | null }
  ) => { isValid: boolean; error?: string };
  /**
   * Optional finals validator that needs match context such as the bracket round.
   * When provided, it takes precedence over validateFinalsScores for finals-stage
   * matches so routes can enforce round-specific target wins.
   */
  validateFinalsScoresWithMatch?: (
    val1: number,
    val2: number,
    match: { stage?: string | null; round?: string | null },
  ) => { isValid: boolean; error?: string };
  /**
   * Optional qualification-stats recalculation config. When provided, a
   * successful qualification-stage PUT also refreshes the per-player
   * qualification record (wins/ties/losses/points) for both players in the
   * updated match. Without this hook, admin score corrections for single
   * matches leave the qualification table stale, which then propagates into
   * standings and overall-ranking calculations (#TC-402: GP manual-total
   * admin edits left all gPQualification rows at 0).
   */
  recalcStatsConfig?: RecalculateStatsConfig;
  /** Mode identifier for qualification lock check ('bm' | 'mr' | 'gp') */
  qualMode: 'bm' | 'mr' | 'gp';
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
   *
   * Authentication: if getRequiresAuth is set, requires session auth (admin or player).
   * If not set, returns match data without authentication (backward-compatible default).
   */
  async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string; matchId: string }> },
  ) {
    const { id: identifier, matchId } = await params;

    /* Optional auth check for GET endpoint */
    if (config.getRequiresAuth) {
      const session = await auth();
      if (!session?.user) {
        return createErrorResponse('Unauthorized', 401, 'UNAUTHORIZED');
      }
    }

    try {
      const [tournamentId, match] = await retryDbRead(
        () => Promise.all([
          resolveTournamentId(identifier),
          model(prisma).findUnique({
            where: { id: matchId },
            include: { player1: { select: PLAYER_PUBLIC_SELECT }, player2: { select: PLAYER_PUBLIC_SELECT } },
          }),
        ]),
      );

      if (!match || ('tournamentId' in match && match.tournamentId && match.tournamentId !== tournamentId)) {
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
   *
   * Authentication: admin only. Players should use the score report endpoint
   * to submit their own match results.
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

    /* Rate limit: prevent abuse on match score update */
    const clientIp = getClientIdentifier(request);
    const rateResult = await checkRateLimit('scoreInput', clientIp);
    if (!rateResult.success) {
      return handleRateLimitError(rateResult.retryAfter);
    }

    const { id: identifier, matchId } = await params;

    try {
      const tournamentId = await resolveTournamentId(identifier);
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

      /* Block qualification score edits when confirmed.
       * Fetch match stage + tournamentId to check the lock. This read is reused
       * by the stage-aware validation below so there's no wasted DB call. */
      const matchMeta = await model(prisma).findUnique({
        where: { id: matchId },
        select: { stage: true, round: true, tournamentId: true },
      });
      if (!matchMeta || (matchMeta.tournamentId && matchMeta.tournamentId !== tournamentId)) {
        return createErrorResponse('Match not found', 404, 'NOT_FOUND');
      }
      if (matchMeta?.stage === 'qualification') {
        const lockError = await checkQualificationConfirmed(prisma, matchMeta.tournamentId, config.qualMode);
        if (lockError) return lockError;
      }

      /* Stage-aware score validation: qualification and bracket matches have different rules.
       * BM qualification: 4 rounds, sum=4, max=4; BM playoff/finals: first-to-N.
       * Only fetch stage when a separate finals validator exists; otherwise use
       * the single validateScores for all stages (avoids an extra DB read). */
      if (config.validateFinalsScores || config.validateFinalsScoresWithMatch) {
        /* Reuse matchMeta already fetched above to avoid extra DB read */
        const matchForStage = matchMeta;
        // Bracket matches use finals-style validation for both playoff and finals stages.
        const isBracketMatch = matchForStage?.stage === 'finals' || matchForStage?.stage === 'playoff';
        const validator = isBracketMatch
          ? config.validateFinalsScoresWithMatch
            ? () => config.validateFinalsScoresWithMatch!(val1, val2, matchForStage)
            : config.validateFinalsScores
              ? () => config.validateFinalsScores!(val1, val2, matchForStage)
              : null
          : config.validateScores
            ? () => config.validateScores!(val1, val2)
            : null;
        if (validator) {
          const scoreValidation = validator();
          if (!scoreValidation.isValid) {
            return handleValidationError(scoreValidation.error ?? 'Invalid scores', 'scores');
          }
        }
      } else if (config.validateScores) {
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
        include: { player1: { select: PLAYER_PUBLIC_SELECT }, player2: { select: PLAYER_PUBLIC_SELECT } },
      });

      /* Mirror the qualification-route PUT flow: after a successful
       * qualification-stage match update, refresh both players' aggregated
       * stats so standings, H2H tiebreakers, and overall-ranking stay in
       * sync. Skipped for finals matches (no qualification record exists)
       * and when no recalc config is supplied. */
      if (
        config.recalcStatsConfig &&
        updatedMatch &&
        matchMeta?.stage === 'qualification'
      ) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const um = updatedMatch as any;
        try {
          await recalculatePlayerStats(config.recalcStatsConfig, matchMeta.tournamentId, um.player1Id);
          if (um.player2Id) {
            await recalculatePlayerStats(config.recalcStatsConfig, matchMeta.tournamentId, um.player2Id);
          }
        } catch (recalcErr) {
          logger.error('Failed to recalculate qualification stats after match update', {
            error: recalcErr,
            matchId,
            player1Id: um.player1Id,
            player2Id: um.player2Id,
          });
          /* Don't fail the PUT just because the recalc hiccuped — the match
           * update already committed. Log and move on; a subsequent score
           * edit or a POST /overall-ranking will reconcile. */
        }
      }

      /* Cache busting after a successful score write:
       *   - standings-cache: per-stage standings rendered to the API
       *   - overall-rankings cache: cross-mode tournament total
       * Both are best-effort; if either invalidate throws we still return
       * success and let TTL eventually catch up. */
      if (matchMeta?.tournamentId) {
        try {
          await invalidateStandingsCache(matchMeta.tournamentId);
        } catch (invalidateErr) {
          logger.warn('Failed to invalidate standings cache after match update', {
            error: invalidateErr,
            tournamentId: matchMeta.tournamentId,
          });
        }
        invalidateOverallRankingsCache(matchMeta.tournamentId);
      }

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
