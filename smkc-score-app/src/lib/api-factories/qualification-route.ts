/**
 * Qualification Route Factory
 *
 * Generates GET/POST/PUT/PATCH handlers for qualification API routes.
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
import { checkRateLimit } from '@/lib/rate-limit';
import { getClientIdentifier, getServerSideIdentifier } from '@/lib/request-utils';
import { sanitizeInput } from '@/lib/sanitize';
import { createLogger } from '@/lib/logger';
import { createErrorResponse, createSuccessResponse, handleValidationError, handleRateLimitError } from '@/lib/error-handling';
import { EventTypeConfig } from '@/lib/event-types/types';
import { CupMismatchError } from '@/lib/event-types/gp-config';
import { resolveTournamentId } from '@/lib/tournament-identifier';
import { checkQualificationConfirmed } from '@/lib/qualification-confirmed-check';
import { invalidate } from '@/lib/standings-cache';
import {
  generateRoundRobinSchedule,
  getByeMatchData,
  BREAK_PLAYER_ID,
} from '@/lib/round-robin';
import { COURSES, TOTAL_MR_RACES } from '@/lib/constants';

/**
 * Shuffle an array using the Fisher-Yates algorithm.
 * Returns a new array (does not mutate the original).
 *
 * Used by course assignment to generate a random course order at setup time.
 * This is a cryptographically-weak shuffle (Math.random), which is acceptable
 * for tournament course ordering since fairness only requires unpredictability
 * at the start of each event, not cryptographic security.
 */
function fisherYatesShuffle<T>(arr: readonly T[]): T[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * Generate a shuffled course list for MR match assignment (§10.5).
 *
 * All 20 courses are shuffled once at qualification setup time.
 * If there are more than 5 matches (> 20 courses needed), the list wraps
 * using modulo indexing — the first few courses appear twice, which is
 * unavoidable when there are more matches than distinct courses.
 *
 * @returns Array of 20 shuffled course abbreviations
 */
function generateShuffledCourseList(): string[] {
  return fisherYatesShuffle(COURSES);
}

/**
 * Extract 4 consecutive courses from the shuffled list for a single match.
 * Uses modulo wrapping so the list extends infinitely if match count > 5.
 *
 * @param shuffled - The pre-shuffled course list (20 items)
 * @param matchIndex - Zero-based index of the match in the overall sequence
 * @returns Array of TOTAL_MR_RACES (4) course abbreviations
 */
function getAssignedCourses(shuffled: string[], matchIndex: number): string[] {
  return Array.from({ length: TOTAL_MR_RACES }, (_, i) =>
    shuffled[(matchIndex * TOTAL_MR_RACES + i) % shuffled.length]
  );
}

/**
 * Create qualification route handlers from an event type configuration.
 *
 * @param config - Event type configuration (BM, MR, or GP)
 * @returns Object with GET, POST, PUT, PATCH handler functions
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
    const { id } = await params;
    const tournamentId = await resolveTournamentId(id);

    try {
      const [qualifications, matches, tournament] = await Promise.all([
        qualModel(prisma).findMany({
          where: { tournamentId },
          include: { player: true },
          orderBy: config.qualificationOrderBy,
        }),
        matchModel(prisma).findMany({
          where: { tournamentId, stage: 'qualification' },
          include: { player1: true, player2: true },
          orderBy: { matchNumber: 'asc' },
        }),
        prisma.tournament.findUnique({
          where: { id: tournamentId },
          select: { qualificationConfirmed: true },
        }),
      ]);

      /* Wrap in standard success response format for API consistency (#274) */
      return createSuccessResponse({
        qualifications,
        matches,
        qualificationConfirmed: tournament?.qualificationConfirmed ?? false,
      });
    } catch (error) {
      logger.error(`Failed to fetch ${config.eventDisplayName} data`, { error, tournamentId });
      return createErrorResponse(`Failed to fetch ${config.eventDisplayName} data`, 500, 'INTERNAL_ERROR');
    }
  }

  /**
   * POST handler: Setup qualification groups and generate round-robin matches.
   *
   * Uses the circle method (サークル方式) for balanced scheduling:
   * - Day-numbered rounds ensure each player plays once per day
   * - 1P/2P sides are balanced within ±1 for each player
   * - Odd-numbered groups get BREAK/BYE matches auto-completed with fixed scores
   *
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
        return createErrorResponse('Forbidden', 403, 'FORBIDDEN');
      }
      currentSession = session;
    }

    /* Rate limit: prevent abuse on qualification setup endpoint */
    const clientIp = getClientIdentifier(request);
    const rateResult = await checkRateLimit('general', clientIp);
    if (!rateResult.success) {
      return handleRateLimitError(rateResult.retryAfter);
    }

    const { id } = await params;
    const tournamentId = await resolveTournamentId(id);

    try {
      const body = sanitizeInput(await request.json());
      const { players } = body;

      if (!players || !Array.isArray(players) || players.length === 0) {
        return handleValidationError('Players array is required', 'players');
      }

      /*
       * Delete existing qualification records and matches first to avoid
       * unique-constraint violations on re-setup (e.g. グループ編集). Without
       * this, the create calls below collide with existing rows on
       * MR/BM/GP-Qualification @@unique([tournamentId, playerId]) and
       * @@unique([tournamentId, matchNumber, stage]) and the request fails with
       * "Failed to setup ${eventDisplayName}" (matches finals-route.ts pattern
       * from commit 7c7e57d / TC-504). D1 has no interactive transactions, so
       * if creation fails afterward the tournament is left without
       * qualifications — but the alternative (always failing on re-setup)
       * is worse.
       */
      await matchModel(prisma).deleteMany({
        where: { tournamentId, stage: 'qualification' },
      });
      await qualModel(prisma).deleteMany({
        where: { tournamentId },
      });

      /* Create qualification records for each player */
      const qualifications = await Promise.all(
        players.map((p: { playerId: string; group: string; seeding?: number }) =>
          qualModel(prisma).create({
            data: { tournamentId, playerId: p.playerId, group: p.group, seeding: p.seeding },
          }),
        ),
      );

      /*
       * Generate round-robin matches using the circle method.
       * Each group gets its own schedule with Day-numbered rounds.
       * BYE matches (odd-numbered groups) are auto-completed with fixed scores.
       */
      const groups = [...new Set(players.map((p: { group: string }) => p.group))];
      let matchNumber = 1;
      const byeData = getByeMatchData(config.eventTypeCode);

      /*
       * §10.5 course assignment: generate one shuffled course list for the entire
       * tournament at setup time. Courses are assigned sequentially (4 per match)
       * so each match has its own pre-determined course card.
       * Only applies when config.assignCoursesRandomly is true (MR only).
       */
      const shuffledCourses = config.assignCoursesRandomly ? generateShuffledCourseList() : null;
      /*
       * §7.4 cup assignment: shuffle the cup list once and distribute cyclically.
       * Each match gets one cup (modulo wrapping when matches > cups).
       * Only applies when config.assignCupRandomly is true (GP only).
       */
      const shuffledCups = config.assignCupRandomly && config.cupList
        ? fisherYatesShuffle(config.cupList)
        : null;
      // matchSequenceIndex tracks the overall match number across all groups
      // for consistent sequential course assignment from the shared list.
      let matchSequenceIndex = 0;
      /*
       * Track players who receive BYE matches so their qualification stats
       * can be updated immediately after setup (BYE = auto-completed win).
       * Without this, BYE wins would only appear in standings after the player's
       * first real match is submitted via PUT (which triggers a full recalculation).
       */
      const byeRecipientIds: Set<string> = new Set();

      for (const group of groups) {
        /*
         * Sort players by seeding within each group before generating the schedule.
         * The circle method fixes the first player as the "anchor" (position 0),
         * so placing the top-seeded player first ensures seeding-aware match ordering
         * per requirements §10.4. Players without seeding are placed last.
         */
        const groupPlayers = players
          .filter((p: { group: string }) => p.group === group)
          .sort((a: { seeding?: number }, b: { seeding?: number }) => {
            const sa = a.seeding ?? Infinity;
            const sb = b.seeding ?? Infinity;
            return sa - sb;
          });
        const playerIds = groupPlayers.map((p: { playerId: string }) => p.playerId);
        const schedule = generateRoundRobinSchedule(playerIds);

        for (const m of schedule.matches) {
          /*
           * For BYE matches, ensure real player is player1 and BREAK is player2.
           * The round-robin module already guarantees this, but we enforce it
           * here as a safety check for correct score assignment.
           */
          const p1Id = m.isBye
            ? (m.player1Id === BREAK_PLAYER_ID ? m.player2Id : m.player1Id)
            : m.player1Id;
          const p2Id = m.isBye ? BREAK_PLAYER_ID : m.player2Id;

          /*
           * §10.5: Assign 4 pre-determined courses to this match from the shuffled list.
           * BYE matches are auto-completed immediately (§10.2) and don't actually play
           * the courses, so skip assignment for BYE matches.
           */
          const isRealMatch = !m.isBye;
          const assignedCourses = shuffledCourses && isRealMatch
            ? getAssignedCourses(shuffledCourses, matchSequenceIndex)
            : undefined;

          /* §7.4: Pick a cup from the shuffled list for this match (GP only) */
          const assignedCup = shuffledCups && isRealMatch
            ? shuffledCups[matchSequenceIndex % shuffledCups.length]
            : undefined;

          await matchModel(prisma).create({
            data: {
              tournamentId,
              matchNumber,
              stage: 'qualification',
              player1Id: p1Id,
              player2Id: p2Id,
              player1Side: 1,
              player2Side: 2,
              roundNumber: m.day,
              isBye: m.isBye,
              /* Pre-assigned courses for the match (undefined for BM/GP without course assignment) */
              ...(assignedCourses ? { assignedCourses } : {}),
              /* Pre-assigned cup for the match (undefined for BM/MR without cup assignment) */
              ...(assignedCup ? { cup: assignedCup } : {}),
              /* Auto-complete BYE matches with fixed scores (§10.2) */
              ...(m.isBye ? { completed: true, ...byeData } : {}),
            },
          });

          if (m.isBye) {
            byeRecipientIds.add(p1Id);
          } else {
            matchSequenceIndex++;
          }

          matchNumber++;
        }
      }

      /*
       * Update qualification stats for BYE recipients immediately.
       * BYE matches are auto-completed on creation, so the player's win
       * must be reflected in standings right away — not deferred until
       * their first real match is submitted via PUT.
       * Use Promise.all for parallel execution to reduce latency.
       */
      await Promise.all([...byeRecipientIds].map(async (playerId) => {
        const byeMatches = await matchModel(prisma).findMany({
          where: {
            tournamentId,
            stage: 'qualification',
            completed: true,
            OR: [{ player1Id: playerId }, { player2Id: playerId }],
          },
        });
        const stats = config.aggregatePlayerStats(
          byeMatches,
          playerId,
          config.calculateMatchResult,
        );
        await qualModel(prisma).updateMany({
          where: { tournamentId, playerId },
          data: stats.qualificationData,
        });
      }));

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

      return createSuccessResponse(
        { message: config.setupCompleteMessage, qualifications },
        config.setupCompleteMessage,
        { status: 201 }
      );
    } catch (error) {
      logger.error(`Failed to setup ${config.eventDisplayName}`, { error, tournamentId });
      return createErrorResponse(`Failed to setup ${config.eventDisplayName}`, 500, 'INTERNAL_ERROR');
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
        return createErrorResponse('Forbidden', 403, 'FORBIDDEN');
      }
    }

    /* Rate limit: prevent abuse on score update endpoint */
    const putClientIp = getClientIdentifier(request);
    const putRateResult = await checkRateLimit('scoreInput', putClientIp);
    if (!putRateResult.success) {
      return handleRateLimitError(putRateResult.retryAfter);
    }

    const { id } = await params;
    const tournamentId = await resolveTournamentId(id);

    try {
      /* Block score edits when qualification is confirmed (admin locked results) */
      const lockError = await checkQualificationConfirmed(prisma, tournamentId);
      if (lockError) return lockError;

      /* Defense-in-depth: always sanitize user input */
      const body = sanitizeInput(await request.json());
      const parseResult = config.parsePutBody(body);

      if (!parseResult.valid) {
        return handleValidationError(parseResult.error!, 'scores');
      }

      const putData = { ...parseResult.data!, tournamentId };
      const { match, score1OrPoints1, score2OrPoints2 } = await config.updateMatch(prisma, putData);
      const { result1, result2 } = config.calculateMatchResult(score1OrPoints1, score2OrPoints2);

      /* Fetch all completed matches for player1 to recalculate standings */
      const player1Matches = await matchModel(prisma).findMany({
        where: {
          tournamentId,
          stage: 'qualification',
          completed: true,
          OR: [{ player1Id: match.player1Id }, { player2Id: match.player1Id }],
        },
      });

      /* Aggregate stats and update player1's qualification record */
      const p1 = config.aggregatePlayerStats(
        player1Matches, match.player1Id, config.calculateMatchResult,
      );

      await qualModel(prisma).updateMany({
        where: { tournamentId, playerId: match.player1Id },
        data: p1.qualificationData,
      });

      /*
       * Skip player2 recalculation for BYE matches.
       * BREAK player has no qualification record, so aggregation is unnecessary.
       */
      if (!match.isBye) {
        const player2Matches = await matchModel(prisma).findMany({
          where: {
            tournamentId,
            stage: 'qualification',
            completed: true,
            OR: [{ player1Id: match.player2Id }, { player2Id: match.player2Id }],
          },
        });

        const p2 = config.aggregatePlayerStats(
          player2Matches, match.player2Id, config.calculateMatchResult,
        );

        await qualModel(prisma).updateMany({
          where: { tournamentId, playerId: match.player2Id },
          data: p2.qualificationData,
        });
      }

      return createSuccessResponse({ match, result1, result2 });
    } catch (error) {
      // Surface cup validation errors (§7.1/§7.4) as 400 rather than 500
      if (error instanceof CupMismatchError) {
        return handleValidationError(error.message, 'cup');
      }
      logger.error('Failed to update match', { error, tournamentId });
      return createErrorResponse('Failed to update match', 500, 'INTERNAL_ERROR');
    }
  }

  /**
   * PATCH handler: Handles two operations distinguished by request body fields:
   *
   * 1. TV number assignment (matchId + tvNumber):
   *    Assigns a broadcast TV stream number to a qualification match.
   *    Used by commentators/admin to designate which matches appear on air.
   *
   * 2. Rank override (qualificationId + rankOverride):
   *    Manually overrides the automatic rank for a qualification entry.
   *    Used for emergency adjustments (player withdrawal, equipment failure).
   *    Stores audit trail (rankOverrideBy, rankOverrideAt) for accountability.
   *    Passing rankOverride=null clears a previously set override.
   */
  async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
  ) {
    const logger = createLogger(config.loggerName);

    const session = await auth();
    if (!session?.user || session.user.role !== 'admin') {
      return createErrorResponse('Forbidden', 403, 'FORBIDDEN');
    }

    /* Rate limit: prevent abuse on admin update endpoints */
    const patchClientIp = getClientIdentifier(request);
    const patchRateResult = await checkRateLimit('general', patchClientIp);
    if (!patchRateResult.success) {
      return handleRateLimitError(patchRateResult.retryAfter);
    }

    const { id } = await params;
    const tournamentId = await resolveTournamentId(id);

    try {
      const body = sanitizeInput(await request.json());
      const { matchId, tvNumber, qualificationId, rankOverride } = body;

      /*
       * Reject ambiguous requests that supply both qualificationId and matchId.
       * The two operations are mutually exclusive; accepting both silently would
       * mask caller bugs and make the API contract unclear.
       */
      if (qualificationId !== undefined && matchId !== undefined) {
        return handleValidationError('Provide either qualificationId or matchId, not both', 'body');
      }

      /* Route to rank override path when qualificationId is present */
      if (qualificationId !== undefined) {
        if (typeof qualificationId !== 'string' || !qualificationId) {
          return handleValidationError('qualificationId is required', 'qualificationId');
        }

        /*
         * rankOverride must be a positive integer or null (null clears the override).
         * Fractional ranks are rejected because standings use integer positions (1, 2, 3...).
         */
        if (rankOverride !== null && rankOverride !== undefined &&
            (typeof rankOverride !== 'number' || rankOverride < 1 || !Number.isInteger(rankOverride))) {
          return handleValidationError('rankOverride must be a positive integer or null', 'rankOverride');
        }

        /*
         * Verify the qualification entry belongs to this tournament before updating.
         * Prevents IDOR: without this check an admin could modify records in other tournaments.
         */
        const qualification = await qualModel(prisma).update({
          where: { id: qualificationId, tournamentId },
          data: {
            rankOverride: rankOverride ?? null,
            rankOverrideBy: rankOverride != null ? session.user.id : null,
            rankOverrideAt: rankOverride != null ? new Date() : null,
          },
        });

        // Invalidate standings cache so the rank change takes effect immediately
        await invalidate(tournamentId, 'qualification');

        logger.info('Rank override updated', {
          tournamentId,
          qualificationId,
          rankOverride,
          adminId: session.user.id,
        });

        return createSuccessResponse({ qualification });
      }

      /* TV number assignment path (original behavior) */
      if (!matchId) {
        return handleValidationError('matchId is required', 'matchId');
      }

      /* tvNumber must be a positive integer or null (to remove assignment) */
      if (tvNumber !== null && tvNumber !== undefined &&
          (typeof tvNumber !== 'number' || tvNumber < 1 || !Number.isInteger(tvNumber))) {
        return handleValidationError('tvNumber must be a positive integer or null', 'tvNumber');
      }

      /*
       * Verify the match exists and belongs to this tournament before updating.
       * Prevents IDOR: an admin could otherwise modify matches in other tournaments
       * by guessing/enumerating matchIds.
       */
      const existingMatch = await matchModel(prisma).findFirst({
        where: { id: matchId, tournamentId },
      });
      if (!existingMatch) {
        return createErrorResponse('Match not found', 404, 'NOT_FOUND');
      }

      const match = await matchModel(prisma).update({
        where: { id: matchId, tournamentId },
        data: { tvNumber: tvNumber ?? null },
        include: { player1: true, player2: true },
      });

      return createSuccessResponse({ match });
    } catch (error) {
      logger.error('Failed to update', { error, tournamentId });
      return createErrorResponse('Failed to update', 500, 'INTERNAL_ERROR');
    }
  }

  return { GET, POST, PUT, PATCH };
}
