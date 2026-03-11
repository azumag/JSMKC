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
import { checkRateLimit, getServerSideIdentifier } from '@/lib/rate-limit';
import { getClientIdentifier } from '@/lib/request-utils';
import { sanitizeInput } from '@/lib/sanitize';
import { createLogger } from '@/lib/logger';
import { createErrorResponse, handleValidationError, handleRateLimitError } from '@/lib/error-handling';
import { EventTypeConfig } from '@/lib/event-types/types';
import { CupMismatchError } from '@/lib/event-types/gp-config';
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

    const { id: tournamentId } = await params;

    try {
      const body = sanitizeInput(await request.json());
      const { players } = body;

      if (!players || !Array.isArray(players) || players.length === 0) {
        return handleValidationError('Players array is required', 'players');
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
           * BYE matches receive courses too (for record consistency), but the courses
           * are not actually played since BYE is auto-completed immediately.
           */
          const assignedCourses = shuffledCourses
            ? getAssignedCourses(shuffledCourses, matchSequenceIndex)
            : undefined;

          /* §7.4: Pick a cup from the shuffled list for this match (GP only) */
          const assignedCup = shuffledCups
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
          }

          matchNumber++;
          matchSequenceIndex++;
        }
      }

      /*
       * Update qualification stats for BYE recipients immediately.
       * BYE matches are auto-completed on creation, so the player's win
       * must be reflected in standings right away — not deferred until
       * their first real match is submitted via PUT.
       */
      for (const playerId of byeRecipientIds) {
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

    const { id: tournamentId } = await params;

    try {
      const body = await request.json();
      const parseResult = config.parsePutBody(body);

      if (!parseResult.valid) {
        return handleValidationError(parseResult.error!, 'scores');
      }

      const putData = parseResult.data!;
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

      return NextResponse.json({ match, result1, result2 });
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
   * PATCH handler: Assign TV number to a qualification match.
   *
   * Used by commentators/admin to designate which matches appear on
   * broadcast TV streams. Only qualification matches support this.
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

    /* Rate limit: prevent abuse on TV assignment endpoint */
    const patchClientIp = getClientIdentifier(request);
    const patchRateResult = await checkRateLimit('general', patchClientIp);
    if (!patchRateResult.success) {
      return handleRateLimitError(patchRateResult.retryAfter);
    }

    const { id: tournamentId } = await params;

    try {
      const body = sanitizeInput(await request.json());
      const { matchId, tvNumber } = body;

      if (!matchId) {
        return handleValidationError('matchId is required', 'matchId');
      }

      /* tvNumber must be a positive integer or null (to remove assignment) */
      if (tvNumber !== null && tvNumber !== undefined &&
          (typeof tvNumber !== 'number' || tvNumber < 1 || !Number.isInteger(tvNumber))) {
        return handleValidationError('tvNumber must be a positive integer or null', 'tvNumber');
      }

      /*
       * Verify the match belongs to this tournament before updating.
       * Prevents IDOR: an admin could otherwise modify matches in other tournaments
       * by guessing/enumerating matchIds.
       */
      const match = await matchModel(prisma).update({
        where: { id: matchId, tournamentId },
        data: { tvNumber: tvNumber ?? null },
        include: { player1: true, player2: true },
      });

      return NextResponse.json({ match });
    } catch (error) {
      logger.error('Failed to update TV number', { error, tournamentId });
      return createErrorResponse('Failed to update TV number', 500, 'INTERNAL_ERROR');
    }
  }

  return { GET, POST, PUT, PATCH };
}
