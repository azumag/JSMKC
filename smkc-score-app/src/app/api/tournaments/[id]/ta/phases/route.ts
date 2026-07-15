/**
 * TA Finals Phase API Route
 *
 * Manages the three-phase elimination finals for Time Attack:
 * - Phase 1: Qualification ranks 17-24, 8→4 players, single elimination per course
 * - Phase 2: Phase 1 survivors + ranks 13-16, 8→4 players, single elimination
 * - Phase 3: Phase 2 survivors + ranks 1-12, 16→1 player, life-based elimination
 *
 * Endpoints:
 * - GET:  Fetch phase status, entries, rounds, and available courses
 * - POST: Promote players to phases, start rounds, or submit round results
 *
 * All POST operations require admin authentication and are audit-logged.
 *
 * CRITICAL: Logger is created INSIDE each handler function (not at module level)
 * to ensure proper test mocking per the project's mock architecture pattern.
 */

import { NextRequest } from 'next/server';
import { PLAYER_PUBLIC_SELECT } from '@/lib/prisma-selects';
import prisma from '@/lib/prisma';
import { getClientIdentifier, getUserAgent } from '@/lib/request-utils';
import { sanitizeInput } from '@/lib/sanitize';
import { requireAdminSession } from '@/lib/api-auth';
import { z } from 'zod';
import { createLogger } from '@/lib/logger';
import { retryDbRead } from '@/lib/db-read-retry';
import { createSuccessResponse, createErrorResponse, handleValidationError } from '@/lib/error-handling';
import {
  promoteToPhase1,
  promoteToPhase2,
  promoteToPhase3,
  getPhaseStatus,
  startPhaseRound,
  submitRoundResults,
  submitSuddenDeathResults,
  changeSuddenDeathCourse,
  cancelPhaseRound,
  undoLastPhaseRound,
  cancelLastSubmittedPhaseRound,
  resetPhase,
  PhaseResetConflictError,
  type PhaseContext,
  type RoundResultInput,
} from '@/lib/ta/finals-phase-manager';
import { getAvailableCourses, getPlayedCoursesWithSuddenDeath } from '@/lib/ta/course-selection';
import { checkStageFrozen } from '@/lib/ta/freeze-check';
import { RETRY_PENALTY_MS } from '@/lib/constants';
import { resolveTournamentId } from '@/lib/tournament-identifier';
import { resolveAuditUserId } from '@/lib/audit-log';
import { readTournamentArchive } from '@/lib/tournament-archive';
import { buildPhase3RulesDto } from '@/lib/ta/phase-rules-dto';
import { TA_HANDICAP_SECONDS } from '@/lib/ta/battle-royale';
import { TA_ROUND_LIFE_LOSS_MIN, TA_ROUND_LIFE_LOSS_MAX } from '@/lib/ta/battle-royale-constants';
import { normalizeTaRoundResults } from '@/lib/ta/round-result';
import { attachLivesAfterToRounds, replayPhase3Lives, type Phase3RoundLike } from '@/lib/ta/phase3-life-replay';
import type { ArchivedTaRules } from '@/lib/tournament-archive';
import type { TaPhaseResponse } from '@/lib/ta/phase-api-types';

function normalizePhaseRound<T extends { results: unknown; eliminatedIds?: unknown }>(round: T) {
  return {
    ...round,
    results: normalizeTaRoundResults(round.results),
    eliminatedIds: Array.isArray(round.eliminatedIds)
      ? round.eliminatedIds.filter((value): value is string => typeof value === 'string')
      : [],
  };
}

export type PhaseEntryForDisplay = {
  playerId: string;
  eliminated: boolean;
  lives: number;
  rank: number | null;
  totalTime: number | null;
};

export type PhaseRoundForDisplay = {
  roundNumber: number;
  results: Array<{ playerId: string; timeMs: number }>;
  eliminatedIds: string[];
};

function compareNullableNumber(a: number | null, b: number | null) {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a - b;
}

export function sortPhaseEntriesForDisplay<T extends PhaseEntryForDisplay>(
  entries: T[],
  rounds: PhaseRoundForDisplay[],
): T[] {
  const eliminationMeta = new Map<string, { roundNumber: number; timeMs: number; index: number }>();

  for (const round of rounds) {
    const timeByPlayer = new Map(round.results.map((result) => [result.playerId, result.timeMs]));
    round.eliminatedIds.forEach((playerId, index) => {
      eliminationMeta.set(playerId, {
        roundNumber: round.roundNumber,
        timeMs: timeByPlayer.get(playerId) ?? Number.POSITIVE_INFINITY,
        index,
      });
    });
  }

  return [...entries].sort((a, b) => {
    if (a.eliminated !== b.eliminated) return a.eliminated ? 1 : -1;

    if (!a.eliminated && !b.eliminated) {
      if (a.lives !== b.lives) return b.lives - a.lives;
      const rankCompare = compareNullableNumber(a.rank, b.rank);
      if (rankCompare !== 0) return rankCompare;
      return compareNullableNumber(a.totalTime, b.totalTime);
    }

    const aMeta = eliminationMeta.get(a.playerId);
    const bMeta = eliminationMeta.get(b.playerId);
    // Entries marked eliminated without matching round history are legacy/orphaned data;
    // keep them behind all round-backed eliminations instead of inventing placement.
    const aRound = aMeta?.roundNumber ?? -1;
    const bRound = bMeta?.roundNumber ?? -1;
    if (aRound !== bRound) return bRound - aRound;
    // eliminatedIds is the authoritative same-round order: processPhase3Result
    // (finals-phase-manager.ts) builds it by iterating results already sorted
    // through comparePhase3CourseResults/resolvedOrder — the full sudden-death
    // chain (life-loss/bronze/revival ties, issue #2773) when one resolved this
    // round. This MUST be checked before raw time: a bronze race's two
    // contestants need not have equal times (detectPhase3BronzeTargets doesn't
    // require it), so falling back to raw time first — as this used to — silently
    // discards the resolved outcome whenever the pair's main-course times merely
    // happen to differ, which is the common case, not an edge case (reported via
    // manual replica testing: a bronze-race loser who was faster on the main
    // course still showed 3rd, ahead of the winner).
    if ((aMeta?.index ?? Number.POSITIVE_INFINITY) !== (bMeta?.index ?? Number.POSITIVE_INFINITY)) {
      return (aMeta?.index ?? Number.POSITIVE_INFINITY) - (bMeta?.index ?? Number.POSITIVE_INFINITY);
    }
    if ((aMeta?.timeMs ?? Number.POSITIVE_INFINITY) !== (bMeta?.timeMs ?? Number.POSITIVE_INFINITY)) {
      return (aMeta?.timeMs ?? Number.POSITIVE_INFINITY) - (bMeta?.timeMs ?? Number.POSITIVE_INFINITY);
    }
    const rankCompare = compareNullableNumber(a.rank, b.rank);
    if (rankCompare !== 0) return rankCompare;
    return compareNullableNumber(a.totalTime, b.totalTime);
  });
}

/** Valid phase names for URL query parameters and request bodies */
const PhaseSchema = z.enum(['phase1', 'phase2', 'phase3']);
type PhaseName = z.infer<typeof PhaseSchema>;

function summarizeArchivedPhase(entries: unknown[], phase: PhaseName) {
  const phaseEntries = entries.filter((entry) => (entry as { stage?: unknown }).stage === phase);
  if (phaseEntries.length === 0) return null;
  const activeEntry = phaseEntries.find((entry) => (entry as { eliminated?: unknown }).eliminated !== true);
  const active = phaseEntries.filter((entry) => (entry as { eliminated?: unknown }).eliminated !== true).length;
  const winner =
    phase === 'phase3' && active === 1
      ? ((activeEntry as { player?: { nickname?: string } } | undefined)?.player?.nickname ?? null)
      : null;
  return {
    total: phaseEntries.length,
    active,
    eliminated: phaseEntries.length - active,
    ...(phase === 'phase3' ? { winner } : {}),
  };
}

function getRoundResultPlayerIds(rounds: unknown[], phase: PhaseName) {
  const playerIds = new Set<string>();
  for (const round of rounds) {
    if ((round as { phase?: unknown }).phase !== phase) continue;
    const results = (round as { results?: unknown }).results;
    if (Array.isArray(results)) {
      for (const result of results) {
        const playerId = (result as { playerId?: unknown }).playerId;
        if (typeof playerId === 'string') playerIds.add(playerId);
      }
    }
    const eliminatedIds = (round as { eliminatedIds?: unknown }).eliminatedIds;
    if (Array.isArray(eliminatedIds)) {
      for (const playerId of eliminatedIds) {
        if (typeof playerId === 'string') playerIds.add(playerId);
      }
    }
  }
  return playerIds;
}

/**
 * Coerces the untyped archive JSON round rows (TTPhaseRoundArchiveRow is a
 * `{ [k: string]: unknown }` bag) into the shape replayPhase3Lives expects.
 *
 * A results entry with a missing/non-string playerId (only possible in
 * malformed legacy archive data — the live write path always zod-validates
 * playerId) is dropped entirely rather than kept as an inert placeholder.
 * This can shift which real players land in a round's bottom half by one
 * slot versus the pre-refactor inline version, which kept such entries in
 * the sorted array (just never applied a life change for them). Since such
 * an entry was never a genuine race participant, treating it as absent is
 * the more correct interpretation, not merely an implementation shortcut.
 *
 * Sudden-death sub-rounds are intentionally NOT included here: the archive
 * creation query (readTournamentArchive callers) never fetches
 * TTPhaseSuddenDeathRound rows, so a boundary-tied archived round falls back
 * to raw-time order — a pre-existing archived-history limitation, not a
 * regression introduced by this replay.
 */
function normalizeArchivedPhase3Rounds(rounds: unknown[]): Phase3RoundLike[] {
  return rounds
    .filter((round) => (round as { phase?: unknown }).phase === 'phase3')
    .map((round) => {
      const results = (round as { results?: unknown }).results;
      const eliminatedIds = (round as { eliminatedIds?: unknown }).eliminatedIds;
      return {
        roundNumber: (round as { roundNumber?: number }).roundNumber ?? 0,
        results: Array.isArray(results)
          ? results
              .map((result) => ({
                playerId: (result as { playerId?: unknown }).playerId,
                timeMs: (result as { timeMs?: unknown }).timeMs,
              }))
              .filter((result): result is { playerId: string; timeMs: number } => typeof result.playerId === 'string')
          : [],
        eliminatedIds: Array.isArray(eliminatedIds)
          ? eliminatedIds.filter((id): id is string => typeof id === 'string')
          : [],
        livesReset: (round as { livesReset?: unknown }).livesReset === true,
        // TA battle royale rounds may configure a non-default lifeLoss (see
        // startPhaseRound); replayPhase3Lives falls back to 1 itself for
        // rounds archived before that column existed (or any other
        // non-numeric value here).
        lifeLoss:
          typeof (round as { lifeLoss?: unknown }).lifeLoss === 'number'
            ? (round as { lifeLoss?: number }).lifeLoss
            : undefined,
      };
    });
}

function replayArchivedPhase3Lives(rounds: unknown[], playerIds: Set<string>, rules: ArchivedTaRules) {
  const { livesByPlayer, eliminated } = replayPhase3Lives(normalizeArchivedPhase3Rounds(rounds), playerIds, rules);
  return { livesByPlayer, eliminated };
}

function getArchivedPhaseEntries(entries: unknown[], rounds: unknown[], phase: PhaseName, rules: ArchivedTaRules) {
  const phaseEntries = entries.filter((entry) => (entry as { stage?: unknown }).stage === phase);
  if (phaseEntries.length > 0) return phaseEntries;

  const playerIds = getRoundResultPlayerIds(rounds, phase);
  if (playerIds.size === 0) return phaseEntries;

  const sourceByPlayerId = new Map(
    entries
      .map((entry) => [(entry as { playerId?: unknown }).playerId, entry] as const)
      .filter(([playerId]) => typeof playerId === 'string'),
  );
  const eliminated = new Set<string>();
  const livesByPlayer = new Map<string, number>();

  if (phase === 'phase3') {
    const replay = replayArchivedPhase3Lives(rounds, playerIds, rules);
    replay.eliminated.forEach((playerId) => eliminated.add(playerId));
    replay.livesByPlayer.forEach((lives, playerId) => livesByPlayer.set(playerId, lives));
  } else {
    for (const round of rounds) {
      if ((round as { phase?: unknown }).phase !== phase) continue;
      const eliminatedIds = (round as { eliminatedIds?: unknown }).eliminatedIds;
      if (!Array.isArray(eliminatedIds)) continue;
      eliminatedIds.forEach((playerId) => {
        if (typeof playerId === 'string') eliminated.add(playerId);
      });
    }
  }

  return [...playerIds].map((playerId) => {
    const source = (sourceByPlayerId.get(playerId) ?? {}) as Record<string, unknown>;
    return {
      ...source,
      id: `${String(source.id ?? playerId)}-${phase}`,
      playerId,
      stage: phase,
      lives: phase === 'phase3' ? (livesByPlayer.get(playerId) ?? rules.initialLives) : 0,
      eliminated: eliminated.has(playerId),
      player: source.player ?? { id: playerId, name: playerId, nickname: playerId },
    };
  });
}

async function getArchivedPhaseResponse(id: string, phase?: PhaseName) {
  const archive = await readTournamentArchive(id);
  if (!archive) return null;

  const entries = archive.modes.ta.entries ?? [];
  const rounds = archive.modes.ta.phaseRounds ?? [];
  const storedRules = archive.modes.ta.rules;
  const fallback = buildPhase3RulesDto(false).phase3Rules;
  const rules: ArchivedTaRules = storedRules ?? {
    mode: 'standard',
    ...fallback,
    allowedHandicapSeconds: [...TA_HANDICAP_SECONDS],
    retryAppliesHandicap: false,
  };
  const phase1Entries = getArchivedPhaseEntries(entries, rounds, 'phase1', rules);
  const phase2Entries = getArchivedPhaseEntries(entries, rounds, 'phase2', rules);
  const phase3Entries = getArchivedPhaseEntries(entries, rounds, 'phase3', rules);
  const response: Record<string, unknown> = {
    taMode: rules.mode,
    taBattleRoyaleMode: rules.mode === 'battle_royale',
    phase3Rules: {
      initialLives: rules.initialLives,
      lifeResetThresholds: [...rules.lifeResetThresholds],
      survivorsNeeded: rules.survivorsNeeded,
      handicapEnabled: rules.handicapEnabled,
      retryAppliesHandicap: rules.retryAppliesHandicap,
    },
    phaseStatus: {
      phase1: summarizeArchivedPhase(phase1Entries, 'phase1'),
      phase2: summarizeArchivedPhase(phase2Entries, 'phase2'),
      phase3: summarizeArchivedPhase(phase3Entries, 'phase3'),
      currentPhase: 'completed',
    },
    archived: true,
  };

  if (phase) {
    const phaseEntries = phase === 'phase1' ? phase1Entries : phase === 'phase2' ? phase2Entries : phase3Entries;
    const phaseRounds = rounds
      .filter((round) => (round as { phase?: unknown }).phase === phase)
      .map((round) =>
        normalizePhaseRound(
          round as { results: unknown; eliminatedIds?: unknown; roundNumber: number; livesReset?: boolean | null },
        ),
      );
    const playedCourses = phaseRounds
      .map((round) => (round as { course?: unknown }).course)
      .filter((course): course is string => typeof course === 'string');
    response.entries = sortPhaseEntriesForDisplay(phaseEntries as never[], phaseRounds as never[]);
    response.rounds =
      phase === 'phase3'
        ? attachLivesAfterToRounds(
            phaseRounds,
            (phaseEntries as { playerId: string }[]).map((entry) => entry.playerId),
            rules,
          )
        : phaseRounds;
    response.availableCourses = getAvailableCourses(playedCourses);
    response.playedCourses = playedCourses;
  }

  return response;
}

/**
 * POST request body schema.
 * Uses discriminated union on "action" field to validate action-specific fields.
 */
const PostRequestSchema = z.discriminatedUnion('action', [
  // Promote players to a phase (triggers the corresponding promoteToPhaseN function)
  z.object({ action: z.literal('promote_phase1') }),
  z.object({ action: z.literal('promote_phase2') }),
  z.object({ action: z.literal('promote_phase3') }),

  // Start a new round: selects a random course and creates a TTPhaseRound record.
  // Optional `course` allows admin to manually specify a course abbreviation (e.g. "MC1")
  // instead of using random selection. Must be a valid abbreviation in the current cycle.
  // Optional `tvNumber` (1-4) assigns a broadcast TV screen to the round.
  // Optional `lifeLoss` overrides how many lives phase3's bottom half loses this
  // round (default 1); restricted to TA battle royale phase3 rounds below.
  z.object({
    action: z.literal('start_round'),
    phase: PhaseSchema,
    course: z.string().optional(),
    tvNumber: z.number().int().min(1).max(4).nullable().optional(),
    lifeLoss: z.number().int().min(TA_ROUND_LIFE_LOSS_MIN).max(TA_ROUND_LIFE_LOSS_MAX).optional(),
  }),

  // Cancel an unsubmitted round: deletes the TTPhaseRound record to free the course
  z.object({
    action: z.literal('cancel_round'),
    phase: PhaseSchema,
    roundNumber: z.number().int().positive(),
  }),

  // Undo the last submitted round: clears results and restores player state
  z.object({
    action: z.literal('undo_round'),
    phase: PhaseSchema,
  }),

  // Cancel the last submitted round entirely: restores player state (same as
  // undo_round) but deletes the round record so its course returns to the
  // 20-course pool, instead of keeping it open for re-submission. Use this
  // when the last course/round itself was the mistake, not just the times
  // entered for it — see cancelLastSubmittedPhaseRound's doc comment.
  z.object({
    action: z.literal('cancel_last_round'),
    phase: PhaseSchema,
  }),

  // Reset (undo) a phase promotion: deletes the entire stage roster and its
  // round history so the admin can re-promote after fixing the mistake that
  // caused an incorrect promotion (see resetPhase's doc comment). The field
  // is named `phase`, same as every other action above, even though
  // resetPhase's own parameter is named `stage` internally (it maps 1:1 onto
  // the TTEntry.stage column it operates on) — only the API's external
  // request shape is unified here so callers don't have to remember a
  // one-off field name for this action.
  z.object({
    action: z.literal('reset_phase'),
    phase: PhaseSchema,
  }),

  // Submit results for a round: triggers elimination processing.
  // Optional `tvNumber` per result records which TV screen the player used (for history display).
  z.object({
    action: z.literal('submit_results'),
    phase: PhaseSchema,
    roundNumber: z.number().int().positive(),
    results: z
      .array(
        z.object({
          playerId: z.string().cuid(),
          timeMs: z.number().min(0).max(RETRY_PENALTY_MS),
          isRetry: z.boolean().optional(),
          tvNumber: z.number().int().min(1).max(4).nullable().optional(),
        }),
      )
      .min(1),
  }),

  z.object({
    action: z.literal('submit_sudden_death'),
    phase: PhaseSchema,
    suddenDeathRoundId: z.string().cuid(),
    results: z
      .array(
        z.object({
          playerId: z.string().cuid(),
          timeMs: z.number().min(0).max(RETRY_PENALTY_MS),
          isRetry: z.boolean().optional(),
        }),
      )
      .min(2),
  }),

  z.object({
    action: z.literal('change_sudden_death_course'),
    phase: PhaseSchema,
    suddenDeathRoundId: z.string().cuid(),
    course: z.string(),
  }),
]);

/**
 * GET /api/tournaments/[id]/ta/phases
 *
 * Fetches the current state of all finals phases.
 * Optionally accepts a `phase` query parameter to filter entries and rounds.
 *
 * Response:
 * - phaseStatus: Status summary for all three phases
 * - entries: TTEntry records for the requested phase (with player info)
 * - rounds: TTPhaseRound records for the requested phase
 * - availableCourses: Courses not yet played in the current 20-course cycle
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const logger = createLogger('ta-phases-api');
  const { id } = await params;
  let tournamentId = id;

  try {
    tournamentId = await retryDbRead(() => resolveTournamentId(id), {
      onRetry: ({ attempt, error }) =>
        logger.warn('Retrying TA phase tournament resolve', {
          attempt,
          id,
          error: error instanceof Error ? error.message : error,
        }),
    });

    // Parse optional phase filter from query params early (no async needed)
    const { searchParams } = new URL(request.url);
    const phaseParam = searchParams.get('phase');
    const phase = phaseParam ? PhaseSchema.safeParse(phaseParam) : null;

    if (phaseParam && !phase?.success) {
      return handleValidationError('Invalid phase parameter. Must be one of: phase1, phase2, phase3');
    }

    const tournament = await retryDbRead(() => prisma.tournament.findUnique({ where: { id: tournamentId } }), {
      onRetry: ({ attempt, error }) =>
        logger.warn('Retrying TA tournament read', {
          attempt,
          tournamentId,
          error: error instanceof Error ? error.message : error,
        }),
    });

    if (!tournament) {
      const archived = await getArchivedPhaseResponse(id, phase?.success ? phase.data : undefined);
      if (archived) {
        return createSuccessResponse(archived);
      }
      return createErrorResponse('Tournament not found', 404);
    }

    const phaseStatus = await retryDbRead(() => getPhaseStatus(prisma, tournamentId), {
      onRetry: ({ attempt, error }) =>
        logger.warn('Retrying TA phase status read', {
          attempt,
          tournamentId,
          error: error instanceof Error ? error.message : error,
        }),
    });

    const response: TaPhaseResponse = {
      phaseStatus,
      ...buildPhase3RulesDto(tournament.taBattleRoyaleMode === true),
    };

    if (phase?.success) {
      const phaseValue = phase.data;

      /*
       * Keep these phase-detail reads sequential even though Promise.all would
       * reduce happy-path latency. Preview/production D1 concurrent fan-out
       * has repeatedly produced request-hung failures for this endpoint, so the
       * latency trade-off is intentional in favor of stability.
       *
       * Each read uses its own retryDbRead boundary and avoids piling multiple
       * reads into the same request cycle, which reduces the risk of hung
       * requests under load.
       */
      const entries = await retryDbRead(
        () =>
          prisma.tTEntry.findMany({
            where: { tournamentId, stage: phaseValue },
            include: { player: { select: PLAYER_PUBLIC_SELECT } },
            orderBy: [{ eliminated: 'asc' }, { lives: 'desc' }, { totalTime: 'asc' }],
          }),
        {
          onRetry: ({ attempt, error }) =>
            logger.warn('Retrying TA phase entry read', {
              attempt,
              tournamentId,
              phase: phaseValue,
              error: error instanceof Error ? error.message : error,
            }),
        },
      );
      const rounds = await retryDbRead(
        () =>
          prisma.tTPhaseRound.findMany({
            where: { tournamentId, phase: phaseValue },
            include: {
              suddenDeathRounds: {
                orderBy: { sequence: 'asc' },
              },
            },
            orderBy: { roundNumber: 'asc' },
          }),
        {
          onRetry: ({ attempt, error }) =>
            logger.warn('Retrying TA phase round read', {
              attempt,
              tournamentId,
              phase: phaseValue,
              error: error instanceof Error ? error.message : error,
            }),
        },
      );
      const playedCourses = await retryDbRead(() => getPlayedCoursesWithSuddenDeath(prisma, tournamentId, phaseValue), {
        onRetry: ({ attempt, error }) =>
          logger.warn('Retrying TA phase course read', {
            attempt,
            tournamentId,
            phase: phaseValue,
            error: error instanceof Error ? error.message : error,
          }),
      });

      // End of the D1 read section; the remaining work only normalizes and sorts in memory.
      const normalizedRounds = rounds.map(normalizePhaseRound);

      response.entries = sortPhaseEntriesForDisplay(entries, normalizedRounds);
      response.rounds =
        phaseValue === 'phase3'
          ? attachLivesAfterToRounds(
              normalizedRounds,
              entries.map((entry: { playerId: string }) => entry.playerId),
              response.phase3Rules,
            )
          : normalizedRounds;
      response.availableCourses = getAvailableCourses(playedCourses);
      response.playedCourses = playedCourses;
    }

    return createSuccessResponse(response);
  } catch (err) {
    logger.error('Failed to fetch phase data', {
      error: err instanceof Error ? err.message : err,
      stack: err instanceof Error ? err.stack : undefined,
      tournamentId,
    });
    const { searchParams } = new URL(request.url);
    const phase = PhaseSchema.safeParse(searchParams.get('phase'));
    const archived = await getArchivedPhaseResponse(id, phase.success ? phase.data : undefined);
    if (archived) {
      return createSuccessResponse(archived);
    }
    return createErrorResponse('Internal server error', 500);
  }
}

/**
 * POST /api/tournaments/[id]/ta/phases
 *
 * Action-based mutation endpoint for finals phase management.
 * All actions require admin authentication.
 *
 * Actions:
 * - promote_phase1: Promote qualification ranks 17-24 to Phase 1
 * - promote_phase2: Promote Phase 1 survivors + ranks 13-16 to Phase 2
 * - promote_phase3: Promote Phase 2 survivors + ranks 1-12 to Phase 3
 * - start_round: Select random course and create a new round
 * - submit_results: Submit player times and trigger elimination
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const logger = createLogger('ta-phases-api');
  const { id } = await params;
  const tournamentId = await resolveTournamentId(id);

  // Require admin authentication
  const { error: authError, session } = await requireAdminSession();
  if (authError) return authError;

  try {
    // Parse and validate request body
    const body = await request.json();
    const sanitizedBody = sanitizeInput(body);
    const parsed = PostRequestSchema.safeParse(sanitizedBody);

    if (!parsed.success) {
      return handleValidationError('Invalid request');
    }

    // Validate tournament exists
    const tournament = await prisma.tournament.findUnique({
      where: { id: tournamentId },
    });
    if (!tournament) {
      return createErrorResponse('Tournament not found', 404);
    }

    // Build context for audit logging and phase operations
    const context: PhaseContext = {
      tournamentId,
      userId: resolveAuditUserId(session),
      ipAddress: getClientIdentifier(request),
      userAgent: getUserAgent(request),
      taBattleRoyaleMode: tournament.taBattleRoyaleMode,
    };

    const action = parsed.data.action;

    if (
      tournament.taBattleRoyaleMode &&
      (action === 'promote_phase1' ||
        action === 'promote_phase2' ||
        ('phase' in parsed.data && (parsed.data.phase === 'phase1' || parsed.data.phase === 'phase2')))
    ) {
      return createErrorResponse('TA battle royale mode uses Phase 3 only', 400);
    }

    // === Promotion Actions ===
    if (action === 'promote_phase1') {
      const result = await promoteToPhase1(prisma, context);
      return createSuccessResponse(result);
    }

    if (action === 'promote_phase2') {
      const result = await promoteToPhase2(prisma, context);
      return createSuccessResponse(result);
    }

    if (action === 'promote_phase3') {
      if (tournament.taBattleRoyaleMode) {
        const participantCount = await prisma.tTEntry.count({
          where: { tournamentId, stage: 'qualification' },
        });
        if (participantCount < 2) {
          return createErrorResponse(
            'At least two players are required for TA battle royale',
            400,
            'MINIMUM_PARTICIPANTS',
          );
        }
      }
      const result = await promoteToPhase3(prisma, context);
      return createSuccessResponse(result);
    }

    // === Round Management Actions ===
    if (action === 'start_round') {
      const { phase, course, tvNumber, lifeLoss } = parsed.data;
      // Prevent starting rounds in a frozen phase (admin locked after completion)
      const freezeError = await checkStageFrozen(prisma, tournamentId, phase);
      if (freezeError) return freezeError;
      // A non-default lifeLoss only makes sense for TA battle royale Phase 3
      // (docs/ta-battle-royale-operations.ja.md): standard TA keeps a fixed
      // 1-life-per-round rule, and phase1/2 have no life system at all.
      if (lifeLoss !== undefined && lifeLoss !== 1 && !(phase === 'phase3' && tournament.taBattleRoyaleMode)) {
        return createErrorResponse(
          'Custom lifeLoss is only allowed for TA battle royale Phase 3 rounds',
          400,
          'INVALID_LIFE_LOSS',
        );
      }
      // Pass optional manual course; undefined = random selection (default behaviour)
      const result = await startPhaseRound(prisma, context, phase, course, tvNumber ?? null, lifeLoss);
      return createSuccessResponse(result);
    }

    if (action === 'cancel_round') {
      const { phase, roundNumber } = parsed.data;
      // Prevent cancelling rounds in a frozen phase
      const freezeError = await checkStageFrozen(prisma, tournamentId, phase);
      if (freezeError) return freezeError;
      const result = await cancelPhaseRound(prisma, context, phase, roundNumber);
      return createSuccessResponse(result);
    }

    if (action === 'undo_round') {
      const { phase } = parsed.data;
      // Prevent undoing rounds in a frozen phase
      const freezeError = await checkStageFrozen(prisma, tournamentId, phase);
      if (freezeError) return freezeError;
      const result = await undoLastPhaseRound(prisma, context, phase);
      return createSuccessResponse(result);
    }

    if (action === 'cancel_last_round') {
      const { phase } = parsed.data;
      // Prevent cancelling rounds in a frozen phase
      const freezeError = await checkStageFrozen(prisma, tournamentId, phase);
      if (freezeError) return freezeError;
      const result = await cancelLastSubmittedPhaseRound(prisma, context, phase);
      return createSuccessResponse(result);
    }

    if (action === 'reset_phase') {
      const { phase } = parsed.data;
      // Same frozen-stage guard as the other phase mutations above: a stage
      // an admin has explicitly locked should not be resettable either.
      const freezeError = await checkStageFrozen(prisma, tournamentId, phase);
      if (freezeError) return freezeError;
      const result = await resetPhase(prisma, context, phase);
      return createSuccessResponse(result);
    }

    if (action === 'submit_results') {
      const { phase, roundNumber, results } = parsed.data;
      // Prevent submitting results in a frozen phase
      const freezeError = await checkStageFrozen(prisma, tournamentId, phase);
      if (freezeError) return freezeError;

      const roundResults: RoundResultInput[] = results;
      const result = await submitRoundResults(prisma, context, phase, roundNumber, roundResults);
      return createSuccessResponse(result);
    }

    if (action === 'submit_sudden_death') {
      const { phase, suddenDeathRoundId, results } = parsed.data;
      const freezeError = await checkStageFrozen(prisma, tournamentId, phase);
      if (freezeError) return freezeError;
      const result = await submitSuddenDeathResults(prisma, context, phase, suddenDeathRoundId, results);
      return createSuccessResponse(result);
    }

    if (action === 'change_sudden_death_course') {
      const { phase, suddenDeathRoundId, course } = parsed.data;
      const freezeError = await checkStageFrozen(prisma, tournamentId, phase);
      if (freezeError) return freezeError;
      const result = await changeSuddenDeathCourse(prisma, context, phase, suddenDeathRoundId, course);
      return createSuccessResponse(result);
    }

    // Should not reach here due to discriminated union validation
    return handleValidationError('Unknown action');
  } catch (err) {
    const internalMessage = err instanceof Error ? err.message : 'Unknown error';
    logger.error('Phase operation failed', {
      error: internalMessage,
      tournamentId,
    });

    // resetPhase's "reset while a later phase already exists" guard is a
    // distinct conflict (409), not a generic 400 validation failure — mapped
    // via instanceof (same pattern as OptimisticLockError / DebugFillLockedError)
    // rather than string-matching, since the message is guard-specific.
    if (err instanceof PhaseResetConflictError) {
      return createErrorResponse(err.message, 409, 'PHASE_RESET_CONFLICT');
    }

    // Expose known business logic errors (thrown by our code with descriptive messages)
    // but hide unexpected/system errors to prevent information leakage.
    // Business logic errors (e.g., "Round 3 not found", "No active players")
    // start with recognizable patterns; Prisma/system errors do not.
    const isBusinessError =
      err instanceof Error &&
      (internalMessage.startsWith('Round ') ||
        internalMessage.startsWith('No active') ||
        internalMessage.startsWith('Invalid player') ||
        internalMessage.startsWith('Missing results') ||
        internalMessage.startsWith('Duplicate player') ||
        internalMessage.includes('already been submitted') ||
        internalMessage.includes('cannot be cancelled') ||
        internalMessage.includes('No submitted rounds') ||
        internalMessage.includes('already promoted') ||
        internalMessage.includes('Promote players first') ||
        internalMessage.startsWith('Tie detected') ||
        internalMessage.includes('sudden-death') ||
        internalMessage.includes('Sudden-death') ||
        internalMessage.startsWith('Unresolved sudden-death') ||
        internalMessage.startsWith('Missing sudden-death') ||
        // Manual course override validation errors (start_round with course param)
        internalMessage.startsWith('Invalid course abbreviation') ||
        internalMessage.startsWith('Course "') ||
        internalMessage.startsWith('Course ') ||
        // resetPhase: stage has no entries to reset (nothing to do)
        internalMessage.includes('entries to reset'));

    return createErrorResponse(
      isBusinessError ? internalMessage : 'Internal server error',
      isBusinessError ? 400 : 500,
    );
  }
}
