/**
 * Debug-fill core logic.
 *
 * Shared admin/debugMode guard plus per-mode fillers that populate
 * qualification scores on tournaments created with `debugMode = true`.
 *
 * The fillers reuse production validators (via score-generators) and
 * production aggregation logic (via the EventTypeConfig from event-types/)
 * so generated data behaves identically to manually entered scores.
 */

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { createErrorResponse, createSuccessResponse } from '@/lib/error-handling';
import { resolveTournamentId } from '@/lib/tournament-identifier';
import { invalidate } from '@/lib/standings-cache';
import { invalidateOverallRankingsCache } from '@/lib/points/overall-ranking';
import { recalculateRanks } from '@/lib/ta/rank-calculation';
import { createAuditLog, AUDIT_ACTIONS } from '@/lib/audit-log';
import { getServerSideIdentifier } from '@/lib/request-utils';
import { createLogger } from '@/lib/logger';
import { bmConfig, mrConfig, gpConfig } from '@/lib/event-types';
import type { EventTypeConfig } from '@/lib/event-types/types';
import {
  generateBMScore,
  generateMRScore,
  generateGPRaces,
  generateTATimes,
} from './score-generators';
import { COURSES } from '@/lib/constants';

export type DebugMode = 'bm' | 'mr' | 'gp' | 'ta';

/**
 * Thrown when a per-mode filler refuses to run (e.g. confirmed qualification
 * lock, or a structural data issue like a GP match without an assigned cup).
 * Caught by `handleDebugFillRequest` and surfaced as 409 QUALIFICATION_LOCKED.
 */
export class DebugFillLockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DebugFillLockedError';
  }
}

interface FillResult {
  filled: number;
  skipped: number;
  total: number;
}

interface GuardSuccess {
  ok: true;
  tournamentId: string;
  userId: string | null;
}
interface GuardFailure {
  ok: false;
  response: NextResponse;
}

/**
 * Resolve the tournament, enforce admin auth, and ensure the tournament was
 * created with `debugMode = true`. Returns either a success object with the
 * resolved tournamentId or a NextResponse to short-circuit the route.
 *
 * Mode-specific lock check (e.g. bmQualificationConfirmed) is left to the
 * caller since TA uses `frozenStages` rather than per-mode flags.
 */
export async function debugFillGuards(rawId: string): Promise<GuardSuccess | GuardFailure> {
  const session = await auth();
  if (!session?.user || session.user.role !== 'admin') {
    return { ok: false, response: createErrorResponse('Forbidden', 403, 'FORBIDDEN') };
  }

  const tournamentId = await resolveTournamentId(rawId);
  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    select: { id: true, debugMode: true },
  });
  if (!tournament) {
    return { ok: false, response: createErrorResponse('Tournament not found', 404, 'NOT_FOUND') };
  }
  if (!tournament.debugMode) {
    return {
      ok: false,
      response: createErrorResponse(
        'Debug mode is not enabled for this tournament',
        403,
        'DEBUG_MODE_DISABLED',
      ),
    };
  }
  return { ok: true, tournamentId, userId: session.user.id ?? null };
}

/**
 * Recompute qualification standings for every player who appeared in any
 * 2P match (BM/MR/GP). Used after a bulk fill to update aggregate stats.
 *
 * One pass per player at the end is cheaper than re-aggregating after each
 * individual match update (especially for round-robin where a player is in
 * many matches).
 *
 * Concurrency note: this function reads `findMany` and then issues per-player
 * `updateMany`s. If a concurrent admin edits a score between the read and
 * the writes, the updated row is not reflected in the aggregate. This is
 * acceptable for a debug-only feature on an isolated test tournament — debug
 * fills should never run in parallel with manual entry. The next manual
 * score update via the qualification PUT factory recomputes correctly.
 */
// Minimal shape of a 2P match row needed for standings recomputation.
// All three modes (BM/MR/GP) include these columns; aggregatePlayerStats
// reads further mode-specific fields directly off the row, so we widen
// here with an index signature rather than enumerating every field.
interface TwoPMatchRow {
  player1Id: string;
  player2Id: string;
  isBye: boolean;
  [key: string]: unknown;
}

async function recalc2PStandings(
  config: EventTypeConfig,
  tournamentId: string,
): Promise<void> {
  // Prisma's per-model accessors are dynamically named (bMMatch / mRMatch / gPMatch).
  // The factory pattern in qualification-route.ts uses the same `any` cast.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const matchModel = (prisma as any)[config.matchModel];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const qualModel = (prisma as any)[config.qualificationModel];

  const matches: TwoPMatchRow[] = await matchModel.findMany({
    where: { tournamentId, stage: 'qualification', completed: true },
  });
  // Collect every player who appears as p1 or p2 in any completed match.
  // BYE matches still have a player1Id; that player still needs recalc.
  const playerIds = new Set<string>();
  for (const m of matches) {
    playerIds.add(m.player1Id);
    if (!m.isBye) playerIds.add(m.player2Id);
  }

  for (const playerId of playerIds) {
    const playerMatches = matches.filter(
      (m) => m.player1Id === playerId || m.player2Id === playerId,
    );
    const agg = config.aggregatePlayerStats(
      playerMatches,
      playerId,
      config.calculateMatchResult,
    );
    await qualModel.updateMany({
      where: { tournamentId, playerId },
      data: agg.qualificationData,
    });
  }
}

/** Fill empty BM qualification matches with random valid scores. */
export async function fillBMScores(tournamentId: string): Promise<FillResult> {
  const lockedTournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    select: { bmQualificationConfirmed: true },
  });
  if (lockedTournament?.bmQualificationConfirmed) {
    throw new DebugFillLockedError('BM qualification is confirmed (locked)');
  }

  const matches = await prisma.bMMatch.findMany({
    where: { tournamentId, stage: 'qualification' },
    select: { id: true, completed: true, isBye: true },
  });
  let filled = 0;
  let skipped = 0;
  for (const m of matches) {
    // Skip BYEs (auto-completed 4-0 at setup) and matches that already have a result.
    if (m.isBye || m.completed) {
      skipped++;
      continue;
    }
    const { score1, score2 } = generateBMScore();
    await prisma.bMMatch.update({
      where: { id: m.id },
      data: { score1, score2, completed: true },
    });
    filled++;
  }
  if (filled > 0) {
    await recalc2PStandings(bmConfig, tournamentId);
  }
  return { filled, skipped, total: matches.length };
}

/** Fill empty MR qualification matches with random valid scores + rounds array. */
export async function fillMRScores(tournamentId: string): Promise<FillResult> {
  const lockedTournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    select: { mrQualificationConfirmed: true },
  });
  if (lockedTournament?.mrQualificationConfirmed) {
    throw new DebugFillLockedError('MR qualification is confirmed (locked)');
  }

  const matches = await prisma.mRMatch.findMany({
    where: { tournamentId, stage: 'qualification' },
    select: { id: true, completed: true, isBye: true, assignedCourses: true },
  });
  let filled = 0;
  let skipped = 0;
  for (const m of matches) {
    if (m.isBye || m.completed) {
      skipped++;
      continue;
    }
    // assignedCourses is set at qualification setup; if missing, fall back to
    // the first 4 courses so the generator still produces 4 rounds.
    const courses =
      Array.isArray(m.assignedCourses) && m.assignedCourses.length > 0
        ? (m.assignedCourses as string[])
        : COURSES.slice(0, 4);
    const { score1, score2, rounds } = generateMRScore(courses);
    await prisma.mRMatch.update({
      where: { id: m.id },
      data: { score1, score2, rounds, completed: true },
    });
    filled++;
  }
  if (filled > 0) {
    await recalc2PStandings(mrConfig, tournamentId);
  }
  return { filled, skipped, total: matches.length };
}

/** Fill empty GP qualification matches with 5 races worth of random positions. */
export async function fillGPScores(tournamentId: string): Promise<FillResult> {
  const lockedTournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    select: { gpQualificationConfirmed: true },
  });
  if (lockedTournament?.gpQualificationConfirmed) {
    throw new DebugFillLockedError('GP qualification is confirmed (locked)');
  }

  const matches = await prisma.gPMatch.findMany({
    where: { tournamentId, stage: 'qualification' },
    select: { id: true, completed: true, isBye: true, cup: true },
  });
  let filled = 0;
  let skipped = 0;
  for (const m of matches) {
    if (m.isBye || m.completed) {
      skipped++;
      continue;
    }
    // GP qualification setup pre-assigns a cup to every match (gp-config
    // §7.4). A null cup here means the setup never ran or a row was
    // corrupted; refuse to silently substitute a default — that would
    // mask the underlying bug.
    if (!m.cup) {
      throw new DebugFillLockedError(
        `GP match ${m.id} has no assigned cup. Run qualification setup first.`,
      );
    }
    const races = generateGPRaces(m.cup);
    const points1 = races.reduce((s, r) => s + r.points1, 0);
    const points2 = races.reduce((s, r) => s + r.points2, 0);
    await prisma.gPMatch.update({
      where: { id: m.id },
      data: { cup: m.cup, races, points1, points2, completed: true },
    });
    filled++;
  }
  if (filled > 0) {
    await recalc2PStandings(gpConfig, tournamentId);
  }
  return { filled, skipped, total: matches.length };
}

/**
 * Fill empty TA qualification entries with 20 random course times.
 * Reuses recalculateRanks() to compute totalTime, courseScores, and
 * qualificationPoints — same as a normal admin time submission.
 */
export async function fillTATimes(tournamentId: string): Promise<FillResult> {
  // TA uses Tournament.frozenStages instead of a per-mode confirmed flag.
  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    select: { frozenStages: true },
  });
  const frozen = Array.isArray(tournament?.frozenStages)
    ? (tournament!.frozenStages as string[])
    : [];
  if (frozen.includes('qualification')) {
    throw new DebugFillLockedError('TA qualification is frozen');
  }

  const entries = await prisma.tTEntry.findMany({
    where: { tournamentId, stage: 'qualification' },
    select: { id: true, times: true },
  });
  let filled = 0;
  let skipped = 0;
  for (const e of entries) {
    const existing = (e.times ?? null) as Record<string, string> | null;
    // Skip entries that already have any per-course times. Partial fills
    // would cascade through recalculateRanks() — see project memory
    // `project_ta_recalculate_ranks.md`: a partial `times` map causes
    // totalTime to be recomputed as null and silently overwrite a prior
    // value. Refuse to merge into a partially-populated entry.
    const hasAnyTimes = existing !== null && Object.keys(existing).length > 0;
    if (hasAnyTimes) {
      skipped++;
      continue;
    }
    const newTimes = generateTATimes();
    await prisma.tTEntry.update({
      where: { id: e.id },
      data: { times: newTimes },
    });
    filled++;
  }
  if (filled > 0) {
    await recalculateRanks(tournamentId, 'qualification', prisma);
  }
  return { filled, skipped, total: entries.length };
}

/**
 * Single entry point used by all 4 debug-fill route handlers. Performs the
 * shared guards, dispatches to the per-mode filler, invalidates caches, and
 * records an audit log entry. The caller just imports this and exposes POST.
 */
export async function handleDebugFillRequest(
  rawId: string,
  mode: DebugMode,
  request: { headers: Headers },
): Promise<NextResponse> {
  const logger = createLogger('debug-fill-api');
  const guard = await debugFillGuards(rawId);
  if (!guard.ok) return guard.response;
  const { tournamentId, userId } = guard;

  try {
    let result: FillResult;
    switch (mode) {
      case 'bm':
        result = await fillBMScores(tournamentId);
        break;
      case 'mr':
        result = await fillMRScores(tournamentId);
        break;
      case 'gp':
        result = await fillGPScores(tournamentId);
        break;
      case 'ta':
        result = await fillTATimes(tournamentId);
        break;
    }

    /* Invalidate caches so subsequent GET reflects the new scores */
    try {
      await invalidate(tournamentId, 'qualification');
    } catch (err) {
      logger.warn('Failed to invalidate standings cache', { error: err, tournamentId });
    }
    invalidateOverallRankingsCache(tournamentId);

    /* Audit log: best-effort, fire-and-forget via .catch() */
    try {
      const ip = await getServerSideIdentifier();
      const ua = request.headers.get('user-agent') || 'unknown';
      createAuditLog({
        userId: userId ?? undefined,
        ipAddress: ip,
        userAgent: ua,
        action: AUDIT_ACTIONS.DEBUG_FILL_SCORES,
        targetId: tournamentId,
        targetType: 'Tournament',
        details: { mode, ...result },
      }).catch((err) => logger.warn('Failed to write debug-fill audit log', { error: err, tournamentId, mode }));
    } catch (err) {
      logger.warn('Failed to write debug-fill audit log', { error: err, tournamentId, mode });
    }

    return createSuccessResponse({ mode, ...result });
  } catch (err) {
    if (err instanceof DebugFillLockedError) {
      return createErrorResponse(err.message, 409, 'QUALIFICATION_LOCKED');
    }
    logger.error('debug-fill failed', { error: err, tournamentId, mode });
    return createErrorResponse('Failed to debug-fill scores', 500, 'INTERNAL_ERROR');
  }
}
