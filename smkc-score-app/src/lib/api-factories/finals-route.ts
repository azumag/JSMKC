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
import { Prisma } from '@prisma/client';
import { PLAYER_PUBLIC_SELECT } from '@/lib/prisma-selects';
import prisma from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { generateBracketStructure, generatePlayoffStructure, roundNames } from '@/lib/double-elimination';
import { selectFinalsEntrantsByGroup } from '@/lib/finals-group-selection';
import type { ScorePointsEntry } from '@/lib/ranking-utils';
import { getGpFinalsMaxCups, getMrFinalsMaxRounds, resolveFinalsMatchTargetWins } from '@/lib/finals-target-wins';
import { paginate } from '@/lib/pagination';
import { sanitizeInput } from '@/lib/sanitize';
import { createLogger } from '@/lib/logger';
import {
  createErrorResponse,
  createSuccessResponse,
  handleValidationError,
  handleRateLimitError,
  handleAuthzError,
} from '@/lib/error-handling';
import { checkRateLimit } from '@/lib/rate-limit';
import { getClientIdentifier } from '@/lib/request-utils';
import { resolveTournament, resolveTournamentId } from '@/lib/tournament-identifier';
import { computeQualificationRanks } from '@/lib/server-ranking';
import { invalidateOverallRankingsCache } from '@/lib/points/overall-ranking';
import { COURSES, CUPS, MAX_TV_NUMBER } from '@/lib/constants';
import { getArchivedFinalsPayload, readTournamentArchive } from '@/lib/tournament-archive';
import { executeD1Batch } from '@/lib/d1-batch';
import { buildAuditLogData, createAuditLog, resolveAuditUserId, AUDIT_ACTIONS } from '@/lib/audit-log';
import {
  getFinalsSlotStatus,
  isFinalsSlotConfirmed,
  serializeFinalsSlots,
  type SlotStatusMatch,
} from '@/lib/finals-slot-status';
import type { BracketMatch } from '@/types/bracket';
import {
  getFinalsSeedSnapshotField,
  isCompleteFinalsSeedSnapshot,
  parseFinalsSeedSnapshot,
  resolveFinalsSeedSnapshot,
  type FinalsSeedSnapshotEntry,
} from '@/lib/finals-seed-snapshot';

/**
 * Bracket size inference thresholds.
 * 8-player bracket = 17 matches, 16-player bracket = 31 matches.
 * Threshold of 20 distinguishes between the two (>20 means 16-player).
 */
const BRACKET_SIZE_THRESHOLD = 20;

/**
 * Pre-Bracket Playoff ("barrage") entrant count. Supports issue #454:
 * Top 24 qualifiers → Top 16 Upper Bracket, with 12 entrants from qualification
 * positions 13-24 competing for the 4 Upper-Bracket barrage seats.
 */
const TOP24_QUALIFIER_COUNT = 24;
const PLAYOFF_ENTRANT_COUNT = 12;
const PLAYOFF_R2_UPPER_SEED_COUNT = 4;
const TOP24_SUPPORTED_GROUP_COUNT = 3;

/**
 * Quoted D1 table name for each finals match model, used only by the
 * `swapSlots` raw-SQL path (issue #3017 §6). Selected from this static map —
 * never built from request input — so `Prisma.raw()` embedding it in a
 * `Prisma.sql` template stays safe from injection. Mirrors the
 * `QUALIFICATION_MATCH_INSERT_SQL` static-map pattern in qualification-route.ts.
 */
const SLOT_SWAP_TABLE_NAME: Record<string, string> = {
  bMMatch: '"BMMatch"',
  mRMatch: '"MRMatch"',
  gPMatch: '"GPMatch"',
};

type QualificationConfirmedField = 'bmQualificationConfirmed' | 'mrQualificationConfirmed' | 'gpQualificationConfirmed';
function getQualificationConfirmedField(eventTypeCode: 'bm' | 'mr' | 'gp'): QualificationConfirmedField {
  return `${eventTypeCode}QualificationConfirmed` as QualificationConfirmedField;
}

interface FinalsMatchResult {
  winnerId?: string;
  loserId?: string;
  completed?: boolean;
  updateData?: Record<string, unknown>;
}

interface FinalsMatchResultError {
  error: string;
  field?: string;
}

interface SeededFinalsPlayer {
  /** Structural bracket slot used when generating the match rows. */
  seed: number;
  /** Qualification seed, preserved when a barrage winner enters another slot. */
  originalSeed?: number;
  playerId: string;
  player: PublicFinalsPlayer;
  qualificationRankLabel?: string;
}

interface PublicFinalsPlayer {
  id: string;
  name?: string | null;
  nickname?: string | null;
  country?: string | null;
  noCamera?: boolean;
}

interface Top24FinalsPreviewMatch extends Record<string, unknown> {
  matchNumber: number;
  round?: string | null;
  completed?: boolean;
}

/* score/points (ScorePointsEntry) are present on the underlying Prisma row for
 * all of BM/MR/GP; declared here so selectFinalsEntrantsByGroup's 3+-group
 * bucket tiebreak can read them. See qualification-combined-ranking.md §2-§3. */
interface Top24FinalsQualification extends QualificationRankLabelInput, ScorePointsEntry {
  group: string;
  player: PublicFinalsPlayer | null;
}

interface SafeErrorLogFields {
  errorName: string;
  errorCode?: string;
}

export interface QualificationRankLabelInput {
  playerId: string;
  group?: string | null;
  _rank: number;
}

/**
 * Builds the playerId -> qualification rank label map used by finals seed UI.
 *
 * Labels are assigned after grouping by `group` and ordering by computed
 * `_rank`: grouped rows become `A1`, `B2`, etc.; ungrouped rows become `1`,
 * `2`, etc. When rows in the same group have the same `_rank`, the original
 * input order is kept so tied players receive deterministic adjacent labels.
 */
export function buildQualificationRankLabelMap(qualifications: QualificationRankLabelInput[]): Map<string, string> {
  const orderedQualifications = qualifications
    .map((qualification, index) => ({ qualification, index }))
    .sort((a, b) => {
      const groupCompare = (a.qualification.group ?? '').localeCompare(b.qualification.group ?? '');
      if (groupCompare !== 0) return groupCompare;

      return a.qualification._rank - b.qualification._rank || a.index - b.index;
    });
  const rankByPlayerId = new Map<string, string>();
  const groupCounts = new Map<string, number>();

  for (const { qualification: q } of orderedQualifications) {
    const group = q.group ?? '';
    const rank = (groupCounts.get(group) ?? 0) + 1;
    groupCounts.set(group, rank);
    rankByPlayerId.set(q.playerId, group ? `${group}${rank}` : `${rank}`);
  }

  return rankByPlayerId;
}

function isPublicFinalsPlayer(value: unknown): value is PublicFinalsPlayer {
  return Boolean(value && typeof value === 'object' && typeof (value as { id?: unknown }).id === 'string');
}

function getSafeErrorLogFields(error: unknown): SafeErrorLogFields {
  const errorLike = error && typeof error === 'object' ? (error as { name?: unknown; code?: unknown }) : null;
  const errorName =
    error instanceof Error
      ? error.name
      : typeof error === 'string'
        ? 'StringError'
        : errorLike && typeof errorLike.name === 'string'
          ? errorLike.name
          : 'UnknownError';

  /* Do not log Error objects or messages here. Prisma errors can embed SQL
   * fragments or parameter values in `message`/`meta`; the preview fallback only
   * needs a coarse error class plus Prisma-style code to route investigation. */
  return {
    errorName,
    ...(errorLike && typeof errorLike.code === 'string' ? { errorCode: errorLike.code } : {}),
  };
}

function fisherYatesShuffle<T>(arr: readonly T[]): T[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function getOrderedRounds(bracketStructure: Array<{ round: string }>): string[] {
  return [...new Set(bracketStructure.map((match) => match.round))];
}

function createMrRoundAssignments(
  bracketStructure: Array<{ round: string }>,
  stage: 'playoff' | 'finals',
  targetWinsByRound?: Map<string, number | null | undefined>,
): Map<string, string[]> {
  const shuffledCourses = fisherYatesShuffle(COURSES);
  const assignments = new Map<string, string[]>();
  let cursor = 0;

  for (const round of getOrderedRounds(bracketStructure)) {
    const roundsNeeded = getMrFinalsMaxRounds({ round, stage, targetWins: targetWinsByRound?.get(round) });
    const assignedCourses = Array.from(
      { length: roundsNeeded },
      (_, index) => shuffledCourses[(cursor + index) % shuffledCourses.length],
    );
    assignments.set(round, assignedCourses);
    cursor = (cursor + roundsNeeded) % shuffledCourses.length;
  }

  return assignments;
}

function createGpCupSequence(maxCups: number, preferredFirstCup?: string | null): string[] {
  if (maxCups <= 0) return [];
  const first =
    preferredFirstCup && CUPS.includes(preferredFirstCup as (typeof CUPS)[number]) ? preferredFirstCup : undefined;
  const sequence = first ? [first] : [];

  while (sequence.length < Math.min(maxCups, CUPS.length)) {
    const candidates = CUPS.filter((cup) => !sequence.includes(cup));
    sequence.push(...fisherYatesShuffle(candidates).slice(0, Math.min(candidates.length, maxCups - sequence.length)));
  }

  while (sequence.length < maxCups) {
    sequence.push(fisherYatesShuffle(CUPS)[0]);
  }

  return sequence;
}

function createGpRoundAssignments(
  bracketStructure: Array<{ matchNumber: number; round: string }>,
  stage: 'playoff' | 'finals',
): Map<string, string[]> {
  const assignments = new Map<string, string[]>();
  for (const round of getOrderedRounds(bracketStructure)) {
    const maxCups = getGpFinalsMaxCups({ round, stage });
    assignments.set(round, createGpCupSequence(maxCups));
  }
  return assignments;
}

/**
 * Assign a random starting Battle Course (1-4) to each round in the BM
 * bracket. All matches in the same round share the same starting course,
 * satisfying issue #671: "そのラウンドで使用される開始コースはどの試合も同じにしたい".
 */
function createBmRoundStartingCourses(bracketStructure: Array<{ round: string }>): Map<string, number> {
  const rounds = getOrderedRounds(bracketStructure);
  // Fisher-Yates over [1,2,3,4] then repeat cyclically across rounds so each
  // starting course appears roughly equally across the bracket.
  const base = fisherYatesShuffle([1, 2, 3, 4]);
  return new Map(rounds.map((round, index) => [round, base[index % 4]]));
}

/**
 * Normalize GP cup assignments for legacy finals/playoff rows. New rows store
 * a valid cup sequence in `assignedCups`: FT1 => 1 cup, FT2 => 3 cups,
 * FT3 => 5 cups. The first four entries are unique; only the fifth FT3 cup
 * may repeat. #3039 intentionally permits a different sequence per match,
 * so legacy repair fills only missing/invalid pending rows and never
 * coalesces valid individual assignments.
 */
interface CupNormalizationResult {
  repaired: boolean;
  assignmentsByMatch: Map<string, { cup: string; assignedCups: string[]; version: number }>;
}

function normalizeAssignedCupArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((cup): cup is string => typeof cup === 'string' && CUPS.includes(cup as (typeof CUPS)[number]));
}

function isValidGpCupSequence(sequence: string[], maxCups: number): boolean {
  if (sequence.length !== maxCups) return false;
  const uniqueWindow = sequence.slice(0, Math.min(maxCups, CUPS.length));
  return new Set(uniqueWindow).size === uniqueWindow.length;
}

async function normalizeRoundCupsToSingleSequence(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  modelInstance: any,
  tournamentId: string,
  stage: 'finals' | 'playoff',
  matches: Array<{
    id: string;
    cup?: string | null;
    assignedCups?: unknown;
    round?: string | null;
    completed?: boolean;
    targetWins?: number | null;
    version?: number;
  }>,
  logger?: ReturnType<typeof createLogger>,
): Promise<CupNormalizationResult> {
  const matchesByRound = new Map<
    string,
    Array<{
      id: string;
      cup?: string | null;
      assignedCups: string[];
      completed: boolean;
      targetWins?: number | null;
      version: number;
    }>
  >();

  for (const match of matches) {
    if (!match.round) continue;
    if (!matchesByRound.has(match.round)) {
      matchesByRound.set(match.round, []);
    }
    matchesByRound.get(match.round)!.push({
      id: match.id,
      cup: match.cup,
      assignedCups: normalizeAssignedCupArray(match.assignedCups),
      completed: match.completed === true,
      targetWins: match.targetWins,
      version: match.version ?? 0,
    });
  }

  const assignmentsByMatch = new Map<string, { cup: string; assignedCups: string[]; version: number }>();

  for (const [round, roundMatches] of matchesByRound) {
    const pendingMatches = roundMatches.filter((match) => !match.completed);
    if (pendingMatches.length === 0) continue;
    const firstCupCounts = new Map<string, number>();

    for (const match of pendingMatches) {
      const firstCup = match.assignedCups[0] ?? match.cup;
      if (firstCup && CUPS.includes(firstCup as (typeof CUPS)[number])) {
        firstCupCounts.set(firstCup, (firstCupCounts.get(firstCup) ?? 0) + 1);
      }
    }

    let preferredFirstCup: string | undefined;
    let preferredCount = 0;
    for (const [cup, count] of firstCupCounts) {
      if (count > preferredCount) {
        preferredFirstCup = cup;
        preferredCount = count;
      }
    }

    for (const match of pendingMatches) {
      const maxCups = getGpFinalsMaxCups({ round, stage, targetWins: match.targetWins });
      if (isValidGpCupSequence(match.assignedCups, maxCups) && match.cup === match.assignedCups[0]) continue;
      const assignedCups = isValidGpCupSequence(match.assignedCups, maxCups)
        ? match.assignedCups
        : createGpCupSequence(maxCups, match.cup ?? preferredFirstCup);
      assignmentsByMatch.set(match.id, { cup: assignedCups[0], assignedCups, version: match.version + 1 });
    }
  }

  /* Individual GP cup assignments must stay individual. Update only legacy
   * pending rows needing a backfill, never completed historical rows. */
  const writes: Array<Promise<{ id: string; count: number }>> = [];
  for (const [id, data] of assignmentsByMatch) {
    const match = Array.from(matchesByRound.values())
      .flat()
      .find((candidate) => candidate.id === id)!;
    writes.push(
      modelInstance
        .updateMany({
          where: { id, tournamentId, stage, completed: false, version: match.version },
          data: { cup: data.cup, assignedCups: data.assignedCups, version: { increment: 1 } },
        })
        .then((result: { count: number }) => ({ id, count: result.count })),
    );
  }

  const writeResults = await Promise.allSettled(writes);
  const failedWrites = writeResults.filter(
    (result): result is PromiseRejectedResult | PromiseFulfilledResult<{ id: string; count: number }> =>
      result.status === 'rejected' || result.value.count !== 1,
  );
  if (failedWrites.length > 0) {
    logger?.warn('Failed to backfill some GP assigned cup rounds', {
      failedWrites: failedWrites.length,
      totalWrites: writes.length,
      reasons: failedWrites.map((result) =>
        result.status === 'rejected'
          ? result.reason instanceof Error
            ? result.reason.message
            : String(result.reason)
          : `stale write (affected ${result.value.count} rows)`,
      ),
    });
  }

  const successfulAssignments = new Map(
    writeResults
      .filter(
        (result): result is PromiseFulfilledResult<{ id: string; count: number }> =>
          result.status === 'fulfilled' && result.value.count === 1,
      )
      .map((result) => [result.value.id, assignmentsByMatch.get(result.value.id)!]),
  );
  return { repaired: successfulAssignments.size > 0, assignmentsByMatch: successfulAssignments };
}

/**
 * MR counterpart of normalizeRoundCupsToSingleCup: every match in the same
 * round shares the same `assignedCourses` array (M1 courses == M2 courses
 * == M3 courses == M4 courses for a given round).
 *
 * Legacy states that need repair:
 *   1. All matches in a round have assignedCourses=[] / null (rows created
 *      before per-round course assignment — pre-#565 equivalent for MR).
 *   2. Mixed state: different arrays stored per match in the same round.
 *
 * Strategy:
 *   - Serialize each match's assignedCourses to a JSON key for tally.
 *   - Pick the most common non-empty array as canonical.
 *   - If no match in the round has a non-empty array, generate one via
 *     the same per-round creation path (createMrRoundAssignments) so the
 *     length matches getMrFinalsMaxRounds for that round.
 *   - Update every match in the round whose stored array doesn't match
 *     canonical — we per-row update because Prisma's JSON column equality
 *     filter is unreliable on D1 (SQLite stores JSON as text).
 *
 * Returns the per-round canonical course map alongside the `repaired` flag,
 * mirroring normalizeRoundCupsToSingleCup. Callers patch their in-memory
 * matches with the canonical arrays so they don't need a second findMany.
 */
interface CourseNormalizationResult {
  repaired: boolean;
  canonicalByRound: Map<string, string[]>;
  updatedMatchIds: Set<string>;
}

async function normalizeRoundCoursesToSingleSet(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  modelInstance: any,
  tournamentId: string,
  stage: 'finals' | 'playoff',
  matches: Array<{
    id: string;
    assignedCourses?: unknown;
    round?: string | null;
    completed?: boolean;
    version?: number;
    targetWins?: number | null;
  }>,
): Promise<CourseNormalizationResult> {
  /* Coerce stored value to a plain string[]. JSON columns on D1 come back
   * as arrays already via Prisma's serialization, but we handle null and
   * non-array shapes defensively. */
  const normalizeArray = (value: unknown): string[] => {
    if (!Array.isArray(value)) return [];
    return value.filter((entry): entry is string => typeof entry === 'string');
  };

  const matchesByRound = new Map<
    string,
    Array<{ id: string; courses: string[]; completed: boolean; version: number; targetWins?: number | null }>
  >();
  for (const match of matches) {
    if (!match.round) continue;
    const entry = {
      id: match.id,
      courses: normalizeArray(match.assignedCourses),
      completed: match.completed === true,
      version: match.version ?? 0,
      targetWins: match.targetWins,
    };
    if (!matchesByRound.has(match.round)) matchesByRound.set(match.round, []);
    matchesByRound.get(match.round)!.push(entry);
  }

  /* Collect rounds that need repair and the canonical array for each. */
  const canonicalByRound = new Map<string, string[]>();
  const roundsNeedingRegen = new Set<string>();

  for (const [round, roundMatches] of matchesByRound) {
    const pendingMatches = roundMatches.filter((match) => !match.completed);
    if (pendingMatches.length === 0) continue;
    const keyCounts = new Map<string, number>();
    const keyToArray = new Map<string, string[]>();
    for (const { courses } of pendingMatches) {
      if (courses.length === 0) continue;
      const key = JSON.stringify(courses);
      keyCounts.set(key, (keyCounts.get(key) ?? 0) + 1);
      if (!keyToArray.has(key)) keyToArray.set(key, courses);
    }

    const distinctNonEmpty = keyCounts.size;
    const matchesWithCourses = Array.from(keyCounts.values()).reduce((a, b) => a + b, 0);

    if (distinctNonEmpty === 1 && matchesWithCourses === pendingMatches.length) {
      /* Already normalized — skip this round. */
      continue;
    }

    if (distinctNonEmpty >= 1) {
      /* Pick the dominant array (most common serialization). */
      let dominantKey = '';
      let dominantCount = 0;
      for (const [key, count] of keyCounts) {
        if (count > dominantCount) {
          dominantKey = key;
          dominantCount = count;
        }
      }
      canonicalByRound.set(round, keyToArray.get(dominantKey)!);
    } else {
      /* No existing courses in this round — defer to a fresh shuffle below. */
      roundsNeedingRegen.add(round);
    }
  }

  /* Generate fresh per-round assignments for any rounds that are entirely
   * empty. Uses the same path as bracket creation so lengths respect the
   * per-round targetWins (getMrFinalsMaxRounds). */
  if (roundsNeedingRegen.size > 0) {
    const bracketStructure = Array.from(roundsNeedingRegen).map((round) => ({ round }));
    const targetWinsByRound = new Map(
      bracketStructure.map(({ round }) => [
        round,
        matchesByRound.get(round)?.find((match) => !match.completed)?.targetWins,
      ]),
    );
    const freshAssignments = createMrRoundAssignments(bracketStructure, stage, targetWinsByRound);
    for (const round of roundsNeedingRegen) {
      const fresh = freshAssignments.get(round);
      if (fresh) canonicalByRound.set(round, fresh);
    }
  }

  if (canonicalByRound.size === 0) {
    return { repaired: false, canonicalByRound: new Map(), updatedMatchIds: new Set() };
  }

  /* Per-row updates: Prisma's JSON column equality filter on D1 is
   * unreliable, so we compare in JS and write only when different. */
  let writes = 0;
  const updatedMatchIds = new Set<string>();
  for (const [round, canonical] of canonicalByRound) {
    const canonicalKey = JSON.stringify(canonical);
    const roundMatches = matchesByRound.get(round) ?? [];
    for (const { id, courses, completed, version } of roundMatches) {
      if (completed) continue;
      if (JSON.stringify(courses) === canonicalKey) continue;
      const result = await modelInstance.updateMany({
        where: { id, tournamentId, stage, completed: false, version },
        data: { assignedCourses: canonical, version: { increment: 1 } },
      });
      if (result.count === 1) {
        writes += 1;
        updatedMatchIds.add(id);
      }
    }
  }

  return { repaired: writes > 0, canonicalByRound, updatedMatchIds };
}

/**
 * BM counterpart of normalizeRoundCupsToSingleCup: every match in the same
 * bracket round must share one starting Battle Course (1–4). Fixes:
 *   1. Legacy rows created before #671 with startingCourseNumber = null.
 *   2. Divergent state caused by per-match admin overrides (a single PATCH
 *      could set one match in a round to a different value than its peers).
 *
 * Strategy mirrors the GP cup version: pick the most common non-null value
 * in each round; if the round is entirely null, draw a fresh value from a
 * Fisher-Yates shuffle of [1..4]. Then `updateMany` rows where the stored
 * value differs from canonical, scoped by tournament/stage/round.
 *
 * Returns the per-round canonical map plus a `repaired` flag so callers can
 * patch their in-memory matches without a refetch.
 */
interface BmStartingCourseNormalizationResult {
  repaired: boolean;
  canonicalByRound: Map<string, number>;
}

async function normalizeRoundStartingCoursesToSingleValue(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  modelInstance: any,
  tournamentId: string,
  stage: 'finals' | 'playoff',
  matches: Array<{ startingCourseNumber?: number | null; round?: string | null }>,
): Promise<BmStartingCourseNormalizationResult> {
  /* Tally per-round value occurrences. Null is treated as "no value yet". */
  const valueCountsByRound = new Map<string, Map<number, number>>();
  const roundsNeedingRepair = new Set<string>();

  for (const match of matches) {
    if (!match.round) continue;
    let counts = valueCountsByRound.get(match.round);
    if (!counts) {
      counts = new Map();
      valueCountsByRound.set(match.round, counts);
    }
    if (typeof match.startingCourseNumber === 'number') {
      counts.set(match.startingCourseNumber, (counts.get(match.startingCourseNumber) ?? 0) + 1);
    }
  }

  for (const [round, counts] of valueCountsByRound) {
    const distinctValues = counts.size;
    const totalWithValue = Array.from(counts.values()).reduce((a, b) => a + b, 0);
    const roundMatchCount = matches.filter((m) => m.round === round).length;
    /* Repair only genuine inconsistencies:
     *   - distinctValues > 1: matches in the round have different non-null values.
     *   - distinctValues === 1 && totalWithValue < roundMatchCount: one value exists
     *     but some matches still have null — fill the gaps with the dominant value.
     *
     * All-null rounds (distinctValues === 0) are intentionally skipped (#771).
     * New brackets are always created with values from createBmRoundStartingCourses,
     * so an all-null round is treated as an intentional admin clear via PATCH.
     * Re-filling would silently undo that clear (TC-525).
     *
     * LEGACY NOTE (#776): Brackets created before createBmRoundStartingCourses was
     * introduced are also all-null and cannot be distinguished from intentional clears.
     * Those legacy rounds stay unrepaired. To backfill them run on the production D1:
     *   SELECT tournamentId, round, COUNT(*) c FROM BMMatch
     *   WHERE stage IN ('finals','playoff') AND startingCourseNumber IS NULL
     *   GROUP BY tournamentId, round
     *   HAVING c = (SELECT COUNT(*) FROM BMMatch m2
     *               WHERE m2.tournamentId=BMMatch.tournamentId AND m2.round=BMMatch.round
     *               AND m2.stage IN ('finals','playoff'));
     * If meaningful data is found, apply a targeted one-time migration. */
    if (distinctValues > 1 || (distinctValues === 1 && totalWithValue < roundMatchCount)) {
      roundsNeedingRepair.add(round);
    }
  }

  if (roundsNeedingRepair.size === 0) {
    return { repaired: false, canonicalByRound: new Map() };
  }

  const shuffledFallback = fisherYatesShuffle([1, 2, 3, 4]);
  let cursor = 0;
  const canonicalByRound = new Map<string, number>();
  for (const round of roundsNeedingRepair) {
    const counts = valueCountsByRound.get(round) ?? new Map<number, number>();
    /* Most-common existing value wins; entirely-null rounds fall back to a
     * freshly shuffled course from [1..4] (cursor wraps modulo 4). */
    let dominant: number | undefined;
    let dominantCount = 0;
    for (const [value, count] of counts) {
      if (count > dominantCount) {
        dominant = value;
        dominantCount = count;
      }
    }
    canonicalByRound.set(round, dominant ?? shuffledFallback[cursor++ % shuffledFallback.length]);
  }

  for (const [round, value] of canonicalByRound) {
    /* OR condition catches both null rows (IS NULL) and disagreeing rows (!= value).
     * `NOT: { col: value }` alone silently skips null rows in SQL because
     * NOT(NULL = ?) evaluates to NULL (not TRUE) — so we combine with the
     * explicit null check to form `IS NULL OR col != value` (#753). */
    await modelInstance.updateMany({
      where: {
        tournamentId,
        stage,
        round,
        OR: [{ startingCourseNumber: null }, { NOT: { startingCourseNumber: value } }],
      },
      data: { startingCourseNumber: value },
    });
  }

  return { repaired: true, canonicalByRound };
}

interface SlotOverrideStamp {
  by: string;
  at: Date;
}

/** A finals/playoff match row shape sufficient for TBD detection and duplicate-placement scanning. */
interface SlotEditMatch extends SlotStatusMatch {
  id: string;
  isBye: boolean;
}

/**
 * Scans every other confirmed (non-TBD) slot in the stage for `playerId`,
 * excluding the slot currently being written into (`excludeMatchNumber`/
 * `excludeSlot`) — this also catches assigning the same player into both
 * slots of the match being edited, not just a different match.
 *
 * TBD slots are skipped: they hold no player ID until a real result
 * propagates in, so they can never be a genuine duplicate (issue #3017 §8,
 * #3036).
 *
 * This check is read-then-write, not enforced atomically in the same SQL
 * statement as `applySlotWrite`'s `assign` write: unlike `swapSlots` (whose
 * guard subquery only needs `id`+`version` equality), "no one else holds
 * this playerId" can only be evaluated correctly with the same TBD-vs-real
 * distinction this function makes above — and that distinction depends on
 * bracket routing structure that isn't representable as a plain SQL WHERE
 * clause (it isn't stored data; it's computed from bracket size). A naive
 * `NOT EXISTS` guard comparing raw `player1Id`/`player2Id` columns would
 * misclassify unresolved slots. So a narrow race remains: two `assign` requests
 * placing the same outsider player into two different matches within the
 * same request-handling window can both pass this check before either write
 * lands. Preventing it atomically isn't practical, so instead the `assign`
 * handler re-runs this same check against freshly-read data immediately
 * after its own write succeeds and warns (`duplicatePlacementWarning` on the
 * response + a `logger.warn`) if the race was lost — see the post-write
 * re-check in the `op === 'assign'` branch below. A resulting double-
 * placement is also visible in the bracket UI and self-correctable via
 * another slotEdit either way.
 */
function findDuplicatePlacementConflict(
  playerId: string,
  excludeMatchNumber: number,
  excludeSlot: 1 | 2,
  matches: SlotEditMatch[],
  bracketStructure: BracketMatch[],
): SlotEditMatch | null {
  for (const candidate of matches) {
    if (candidate.completed || candidate.isBye) continue;
    const status = getFinalsSlotStatus(candidate.matchNumber, matches, bracketStructure);
    const isExcluded = (slot: 1 | 2) => candidate.matchNumber === excludeMatchNumber && slot === excludeSlot;
    if (!status.player1 && candidate.player1Id === playerId && !isExcluded(1)) return candidate;
    if (!status.player2 && candidate.player2Id === playerId && !isExcluded(2)) return candidate;
  }
  return null;
}

interface ApplySlotWriteOptions {
  /** Present for manual slotEdit writes: requires this exact `version` (optimistic lock).
   * Omitted for automatic bracket advancement, which is authoritative — the upstream
   * match's own completion is the source of truth, not the destination row's version. */
  expectedVersion?: number;
  /** Manual-adjustment audit stamp to record on the row. Omit (or pass null) to clear
   * it — automatic advancement is never a "manual adjustment", so it always nulls
   * these fields even if the slot previously carried one (issue #3017 §9). */
  slotOverride?: SlotOverrideStamp | null;
}

/**
 * Writes a finals/playoff match's bracket slot(s) (player1Id/player2Id) via a
 * single conditional `updateMany`, always incrementing `version` and always
 * excluding completed rows from the WHERE clause so a completed downstream
 * match can never be clobbered.
 *
 * This is the sole write path for every place bracket slots are populated —
 * automatic winner/loser advancement, grand-final-reset prefill, and manual
 * slotEdit (assign/swap/swapSlots) — so version increments are consistent
 * across all of them and the two write kinds can detect each other's races:
 * a manual edit that read an older `version` gets rejected (0 rows affected)
 * if advancement already moved the slot, and vice versa.
 *
 * @returns the number of rows affected (0 if the target is missing, already
 *   completed, or — for a manual edit — the version no longer matches).
 */
async function applySlotWrite(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  modelInstance: any,
  where: { tournamentId?: string; matchNumber?: number; id?: string; stage?: string; round?: string },
  slotData: Record<string, unknown>,
  options: ApplySlotWriteOptions = {},
): Promise<number> {
  const versionWhere = options.expectedVersion !== undefined ? { version: options.expectedVersion } : {};
  const result = await modelInstance.updateMany({
    where: { ...where, completed: false, ...versionWhere },
    data: {
      ...slotData,
      version: { increment: 1 },
      slotOverrideBy: options.slotOverride ? options.slotOverride.by : null,
      slotOverrideAt: options.slotOverride ? options.slotOverride.at : null,
    },
  });
  return result.count;
}

type PlayoffReconcileChange = {
  id: string;
  version: number;
  side: 1 | 2;
  playerId: string;
};

type PlayoffReconcileGuard = { id: string; version: number };
type PlayoffCanonicalSlot = { id: string; version: number; side: 1 | 2; playerId: string };

/** Atomically place corrected barrage winners in their Upper opening slots.
 * Every source/result guard is in the same D1 batch as the write and audit so
 * a concurrent score/slot change produces zero writes rather than a partial
 * re-seed. */
async function applyAuditedPlayoffReconcileWrite(params: {
  tableName: string;
  tournamentId: string;
  eventTypeCode: 'bm' | 'mr' | 'gp';
  changes: PlayoffReconcileChange[];
  sources: PlayoffReconcileGuard[];
  protectedRows: PlayoffReconcileGuard[];
  canonicalSlots: PlayoffCanonicalSlot[];
  audit: Parameters<typeof buildAuditLogData>[0];
}): Promise<{ updated: number; audited: number }> {
  /* D1 allows at most 100 bound values per statement. Serialize the
   * server-derived guards once and expand them with json_each() so a four-slot
   * correction retains the same atomic validation without exceeding that cap. */
  const changesJson = JSON.stringify(params.changes);
  const sourcesJson = JSON.stringify(params.sources);
  const protectedRowsJson = JSON.stringify(params.protectedRows);
  const canonicalSlotsJson = JSON.stringify(params.canonicalSlots);
  const audit = buildAuditLogData(params.audit);
  const auditId = globalThis.crypto?.randomUUID?.() ?? `audit-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const updatedAt = new Date().toISOString();
  const details = audit.details === undefined ? null : JSON.stringify(audit.details);
  const [updated, audited] = await executeD1Batch([
    {
      sql: `WITH
          changes AS (
            SELECT json_extract(value, '$.id') AS "id",
              CAST(json_extract(value, '$.version') AS INTEGER) AS "version",
              CAST(json_extract(value, '$.side') AS INTEGER) AS "side",
              json_extract(value, '$.playerId') AS "playerId"
            FROM json_each(?)
          ),
          sources AS (
            SELECT json_extract(value, '$.id') AS "id", CAST(json_extract(value, '$.version') AS INTEGER) AS "version"
            FROM json_each(?)
          ),
          protectedRows AS (
            SELECT json_extract(value, '$.id') AS "id", CAST(json_extract(value, '$.version') AS INTEGER) AS "version"
            FROM json_each(?)
          ),
          canonicalSlots AS (
            SELECT json_extract(value, '$.id') AS "id", CAST(json_extract(value, '$.version') AS INTEGER) AS "version",
              CAST(json_extract(value, '$.side') AS INTEGER) AS "side",
              json_extract(value, '$.playerId') AS "playerId"
            FROM json_each(?)
          )
        UPDATE ${params.tableName}
        SET "player1Id" = COALESCE(
              (SELECT "playerId" FROM changes WHERE changes."id" = ${params.tableName}."id" AND changes."side" = 1),
              "player1Id"
            ),
            "player2Id" = COALESCE(
              (SELECT "playerId" FROM changes WHERE changes."id" = ${params.tableName}."id" AND changes."side" = 2),
              "player2Id"
            ),
            "slotOverrideBy" = NULL, "slotOverrideAt" = NULL,
            "version" = "version" + 1, "updatedAt" = ?
        WHERE "tournamentId" = ? AND "stage" = 'finals' AND "id" IN (SELECT "id" FROM changes)
          AND (SELECT COUNT(*) FROM ${params.tableName} source
               JOIN sources ON sources."id" = source."id" AND sources."version" = source."version"
               WHERE source."tournamentId" = ? AND source."stage" = 'playoff'
                 AND source."round" = 'playoff_r2' AND source."completed" = 1) = (SELECT COUNT(*) FROM sources)
          AND (SELECT COUNT(*) FROM ${params.tableName} target
               JOIN changes ON changes."id" = target."id" AND changes."version" = target."version"
               WHERE target."tournamentId" = ? AND target."stage" = 'finals' AND target."round" = 'winners_r1'
                 AND target."completed" = 0 AND COALESCE(target."isBye", 0) = 0) = (SELECT COUNT(*) FROM changes)
          AND (SELECT COUNT(*) FROM ${params.tableName} protected
               JOIN protectedRows ON protectedRows."id" = protected."id" AND protectedRows."version" = protected."version"
               WHERE protected."tournamentId" = ? AND protected."stage" = 'finals'
                 AND ${downstreamPristineSql(params.eventTypeCode, 'protected')}
                 AND protected."slotOverrideBy" IS NULL AND protected."slotOverrideAt" IS NULL) = (SELECT COUNT(*) FROM protectedRows)
          AND (SELECT COUNT(*) FROM ${params.tableName} canonical
               JOIN canonicalSlots ON canonicalSlots."id" = canonical."id" AND canonicalSlots."version" = canonical."version"
               WHERE canonical."tournamentId" = ? AND canonical."stage" = 'finals') = (SELECT COUNT(*) FROM canonicalSlots)
          AND NOT EXISTS (
            SELECT 1 FROM ${params.tableName} existing
            JOIN canonicalSlots ON existing."player1Id" = canonicalSlots."playerId"
            WHERE existing."tournamentId" = ? AND existing."stage" = 'finals'
              AND NOT EXISTS (
                SELECT 1 FROM canonicalSlots intended
                WHERE intended."id" = existing."id" AND intended."side" = 1
                  AND (
                    EXISTS (SELECT 1 FROM changes changed WHERE changed."id" = existing."id" AND changed."side" = 1)
                    OR existing."player1Id" = intended."playerId"
                  )
              )
            UNION ALL
            SELECT 1 FROM ${params.tableName} existing
            JOIN canonicalSlots ON existing."player2Id" = canonicalSlots."playerId"
            WHERE existing."tournamentId" = ? AND existing."stage" = 'finals'
              AND NOT EXISTS (
                SELECT 1 FROM canonicalSlots intended
                WHERE intended."id" = existing."id" AND intended."side" = 2
                  AND (
                    EXISTS (SELECT 1 FROM changes changed WHERE changed."id" = existing."id" AND changed."side" = 2)
                    OR existing."player2Id" = intended."playerId"
                  )
              )
          )`,
      values: [
        changesJson,
        sourcesJson,
        protectedRowsJson,
        canonicalSlotsJson,
        updatedAt,
        params.tournamentId,
        params.tournamentId,
        params.tournamentId,
        params.tournamentId,
        params.tournamentId,
        params.tournamentId,
        params.tournamentId,
      ],
    },
    {
      /* `INSERT ... WHERE changes() = N` would silently insert zero rows after
       * a guarded no-op, while leaving the preceding UPDATE committed.  The
       * primary key is NOT NULL, so deliberately make this statement fail in
       * that case; D1 batch then rolls both statements back. */
      sql: `INSERT INTO "AuditLog" ("id", "userId", "ipAddress", "userAgent", "action", "targetId", "targetType", "details")
        SELECT CASE WHEN changes() = ? THEN ? ELSE NULL END, ?, ?, ?, ?, ?, ?, ?`,
      values: [
        params.changes.length,
        auditId,
        audit.userId ?? null,
        audit.ipAddress,
        audit.userAgent,
        audit.action,
        audit.targetId ?? null,
        audit.targetType ?? null,
        details,
      ],
    },
  ]);
  return { updated, audited };
}

/** A slot may be reassigned only while it is truly pristine. Keeping a
 * participant report, a per-race/cup breakdown, or a non-zero entered score
 * while replacing that participant would attribute somebody else's result to
 * the new player. */
function downstreamMatchHasRecordedResult(match: Record<string, unknown>): boolean {
  if (match.completed === true || match.scoresConfirmed === true) return true;
  for (const field of ['score1', 'score2', 'points1', 'points2']) {
    if (typeof match[field] === 'number' && match[field] !== 0) return true;
  }
  for (const field of [
    'rounds',
    'races',
    'cupResults',
    'player1ReportedScore1',
    'player1ReportedScore2',
    'player2ReportedScore1',
    'player2ReportedScore2',
    'player1ReportedPoints1',
    'player1ReportedPoints2',
    'player2ReportedPoints1',
    'player2ReportedPoints2',
    'player1ReportedRaces',
    'player2ReportedRaces',
  ]) {
    const value = match[field];
    if (value === null || value === undefined) continue;
    if (Array.isArray(value) && value.length === 0) continue;
    if (typeof value === 'object' && !Array.isArray(value) && Object.keys(value as object).length === 0) continue;
    return true;
  }
  return false;
}

/** A GP cup label can be changed after a score-only result without destroying
 * it. Require an explicit choice only when per-cup/race detail exists. */
function hasGpCupDetails(match: Record<string, unknown>): boolean {
  for (const field of ['cupResults', 'races', 'player1ReportedRaces', 'player2ReportedRaces']) {
    const value = match[field];
    if (value === null || value === undefined) continue;
    if (Array.isArray(value) && value.length === 0) continue;
    if (typeof value === 'object' && !Array.isArray(value) && Object.keys(value as object).length === 0) continue;
    return true;
  }
  return false;
}

/**
 * Fire-and-forget audit log for the case where automatic bracket advancement
 * (an `applySlotWrite` call with no `slotOverride`) is about to overwrite a
 * slot that carries a manual adjustment. Callers that already fetched the
 * destination row (winner/loser advance, GF reset prefill) pass its current
 * `slotOverrideBy`/`slotOverrideAt` here; fallback paths that never fetched
 * the row (partially generated brackets, playoff advancement) skip this —
 * a manual edit landing in that narrow window is not worth an extra query.
 */
function logAutoAdvanceOverrideIfNeeded(
  previousRow: { slotOverrideBy?: string | null; slotOverrideAt?: Date | string | null } | null | undefined,
  targetType: string,
  targetId: string,
  extraDetails: Record<string, unknown>,
): void {
  if (!previousRow?.slotOverrideAt) return;
  createAuditLog({
    ipAddress: 'internal',
    userAgent: 'system:bracket-advancement',
    action: AUDIT_ACTIONS.AUTO_ADVANCE_OVERRODE_MANUAL_SLOT,
    targetType,
    targetId,
    details: {
      overriddenManualBy: previousRow.slotOverrideBy ?? null,
      overriddenManualAt: previousRow.slotOverrideAt,
      ...extraDetails,
    },
  }).catch(() => {
    /* fail-silent: audit logging must never affect bracket advancement */
  });
}

interface SwapSlotsWriteParams {
  tournamentId: string;
  /** Must match for both rows; guards against cross-stage collisions (issue #3021). */
  stage: string;
  round: string;
  idA: string;
  versionA: number;
  newPlayer1A: string;
  newPlayer2A: string;
  idB: string;
  versionB: number;
  newPlayer1B: string;
  newPlayer2B: string;
  slotOverride: SlotOverrideStamp;
}

/**
 * Atomically swaps player slots between two different finals/playoff
 * matches in the same round via a single CASE-expression UPDATE, guarded by
 * a duplicated-predicate existence subquery so the write is strictly
 * all-or-nothing (issue #3017 §6). Empirically verified against preview D1
 * (issue #3017 Step 0 — see the issue for the exact Case A–D results):
 * either both rows update and `version` increments once each, or neither
 * row is touched.
 *
 * The WHERE clause and the guard subquery deliberately repeat every
 * predicate (tournamentId/stage/round/completed/isBye/id+version) — a
 * mismatch between the two would let a row that fails the outer WHERE still
 * count toward the subquery's `= 2` check, producing a partial update.
 *
 * @returns 0 (no rows matched — stale version, completed, or BYE) or 2
 *   (both rows updated). Any other value indicates a broken invariant and
 *   is treated as a fatal error by the caller.
 */
async function applySwapSlotsWrite(tableName: string, params: SwapSlotsWriteParams): Promise<number> {
  const table = Prisma.raw(tableName);
  const affected = await prisma.$executeRaw(Prisma.sql`
    UPDATE ${table}
    SET
      "player1Id" = CASE "id"
        WHEN ${params.idA} THEN ${params.newPlayer1A}
        WHEN ${params.idB} THEN ${params.newPlayer1B}
        ELSE "player1Id" END,
      "player2Id" = CASE "id"
        WHEN ${params.idA} THEN ${params.newPlayer2A}
        WHEN ${params.idB} THEN ${params.newPlayer2B}
        ELSE "player2Id" END,
      "version" = "version" + 1,
      "slotOverrideBy" = ${params.slotOverride.by},
      "slotOverrideAt" = ${params.slotOverride.at},
      "updatedAt" = CURRENT_TIMESTAMP
    WHERE "tournamentId" = ${params.tournamentId}
      AND "stage" = ${params.stage}
      AND "round" = ${params.round}
      AND "completed" = 0 AND "isBye" = 0
      AND (
        ("id" = ${params.idA} AND "version" = ${params.versionA})
        OR ("id" = ${params.idB} AND "version" = ${params.versionB})
      )
      AND (
        SELECT COUNT(*) FROM ${table} g
        WHERE g."tournamentId" = ${params.tournamentId}
          AND g."stage" = ${params.stage}
          AND g."round" = ${params.round}
          AND g."completed" = 0 AND g."isBye" = 0
          AND (
            (g."id" = ${params.idA} AND g."version" = ${params.versionA})
            OR (g."id" = ${params.idB} AND g."version" = ${params.versionB})
          )
      ) = 2
  `);
  return Number(affected);
}

async function applyAuditedRoundTargetWinsWrite(
  tableName: string,
  params: {
    tournamentId: string;
    mode: 'bm' | 'mr' | 'gp';
    stage: string;
    round: string;
    targetWins: number;
    matches: Array<{ id: string; version: number }>;
    audit: Parameters<typeof buildAuditLogData>[0];
  },
): Promise<{ updated: number; audited: number }> {
  if (params.matches.length === 0) return { updated: 0, audited: 0 };
  const beforePredicates = params.matches.map(() => '("id" = ? AND "version" = ?)').join(' OR ');
  const afterPredicates = params.matches.map(() => '("id" = ? AND "version" = ?)').join(' OR ');
  const beforeValues = params.matches.flatMap((match) => [match.id, match.version]);
  const afterValues = params.matches.flatMap((match) => [match.id, match.version + 1]);
  const audit = buildAuditLogData(params.audit);
  const auditId = globalThis.crypto?.randomUUID?.() ?? `audit-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const settingId =
    globalThis.crypto?.randomUUID?.() ?? `round-setting-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const details = audit.details === undefined ? null : JSON.stringify(audit.details);
  const updatedAt = new Date().toISOString();
  const updateSql = `
    UPDATE ${tableName}
    SET "targetWins" = ?, "version" = "version" + 1, "updatedAt" = ?
    WHERE "tournamentId" = ?
      AND "stage" = ?
      AND "round" = ?
      AND "completed" = 0
      AND (${beforePredicates})
      AND (
        SELECT COUNT(*) FROM ${tableName} all_pending
        WHERE all_pending."tournamentId" = ?
          AND all_pending."stage" = ?
          AND all_pending."round" = ?
          AND all_pending."completed" = 0
      ) = ?
      AND (
        SELECT COUNT(*) FROM ${tableName} g
        WHERE g."tournamentId" = ?
          AND g."stage" = ?
          AND g."round" = ?
          AND g."completed" = 0
          AND (${beforePredicates})
      ) = ?`;
  const updateValues = [
    params.targetWins,
    updatedAt,
    params.tournamentId,
    params.stage,
    params.round,
    ...beforeValues,
    params.tournamentId,
    params.stage,
    params.round,
    params.matches.length,
    params.tournamentId,
    params.stage,
    params.round,
    ...beforeValues,
    params.matches.length,
  ];
  const insertAuditSql = `
    INSERT INTO "AuditLog" ("id", "userId", "ipAddress", "userAgent", "action", "targetId", "targetType", "details")
    SELECT ?, ?, ?, ?, ?, ?, ?, ?
    WHERE (
      SELECT COUNT(*) FROM ${tableName} all_pending
      WHERE all_pending."tournamentId" = ?
        AND all_pending."stage" = ?
        AND all_pending."round" = ?
        AND all_pending."completed" = 0
    ) = ?
    AND (
      SELECT COUNT(*) FROM ${tableName} g
      WHERE g."tournamentId" = ?
        AND g."stage" = ?
        AND g."round" = ?
        AND g."completed" = 0
        AND g."targetWins" = ?
      AND (${afterPredicates})
    ) = ?
    /* changes() is the immediately preceding UPDATE's row count in this
       D1 batch. It ties the audit to this request rather than accepting a
       stale retry that merely happens to observe the same post-state. */
    AND changes() = ?`;
  const insertAuditValues = [
    auditId,
    audit.userId ?? null,
    audit.ipAddress,
    audit.userAgent,
    audit.action,
    audit.targetId ?? null,
    audit.targetType ?? null,
    details,
    params.tournamentId,
    params.stage,
    params.round,
    params.matches.length,
    params.tournamentId,
    params.stage,
    params.round,
    params.targetWins,
    ...afterValues,
    params.matches.length,
    params.matches.length,
  ];
  const upsertSettingSql = `
    INSERT INTO "FinalsRoundSetting" ("id", "tournamentId", "mode", "stage", "round", "targetWins", "createdAt", "updatedAt")
    SELECT ?, ?, ?, ?, ?, ?, ?, ?
    WHERE changes() = 1
    ON CONFLICT ("tournamentId", "mode", "stage", "round")
    DO UPDATE SET "targetWins" = excluded."targetWins", "updatedAt" = excluded."updatedAt"`;
  const [updated, audited, settingUpdated] = await executeD1Batch([
    { sql: updateSql, values: updateValues },
    { sql: insertAuditSql, values: insertAuditValues },
    {
      sql: upsertSettingSql,
      values: [
        settingId,
        params.tournamentId,
        params.mode,
        params.stage,
        params.round,
        params.targetWins,
        updatedAt,
        updatedAt,
      ],
    },
  ]);
  return { updated, audited: audited && settingUpdated ? audited : 0 };
}

/** Atomically changes the MR course sequence on every still-pending match in
 * one round. Completed matches retain both their result and historical list. */
async function applyAuditedRoundCoursesWrite(
  tableName: string,
  params: {
    tournamentId: string;
    stage: string;
    round: string;
    courses: string[];
    matches: Array<{ id: string; version: number }>;
    audit: Parameters<typeof buildAuditLogData>[0];
  },
): Promise<{ updated: number; audited: number }> {
  if (params.matches.length === 0) return { updated: 0, audited: 0 };
  const beforePredicates = params.matches.map(() => '("id" = ? AND "version" = ?)').join(' OR ');
  const afterPredicates = params.matches.map(() => '("id" = ? AND "version" = ?)').join(' OR ');
  const beforeValues = params.matches.flatMap((match) => [match.id, match.version]);
  const afterValues = params.matches.flatMap((match) => [match.id, match.version + 1]);
  const audit = buildAuditLogData(params.audit);
  const auditId = globalThis.crypto?.randomUUID?.() ?? `audit-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const updatedAt = new Date().toISOString();
  const courses = JSON.stringify(params.courses);
  const details = audit.details === undefined ? null : JSON.stringify(audit.details);
  const updateSql = `
    UPDATE ${tableName}
    SET "assignedCourses" = ?, "version" = "version" + 1, "updatedAt" = ?
    WHERE "tournamentId" = ? AND "stage" = ? AND "round" = ? AND "completed" = 0
      AND (${beforePredicates})
      AND (SELECT COUNT(*) FROM ${tableName} all_pending
           WHERE all_pending."tournamentId" = ? AND all_pending."stage" = ?
             AND all_pending."round" = ? AND all_pending."completed" = 0) = ?
      AND (SELECT COUNT(*) FROM ${tableName} guarded
           WHERE guarded."tournamentId" = ? AND guarded."stage" = ?
             AND guarded."round" = ? AND guarded."completed" = 0
             AND (${beforePredicates})) = ?`;
  const insertAuditSql = `
    INSERT INTO "AuditLog" ("id", "userId", "ipAddress", "userAgent", "action", "targetId", "targetType", "details")
    SELECT ?, ?, ?, ?, ?, ?, ?, ?
    WHERE changes() = ?
      AND (SELECT COUNT(*) FROM ${tableName} verified
           WHERE verified."tournamentId" = ? AND verified."stage" = ? AND verified."round" = ?
             AND verified."completed" = 0 AND verified."assignedCourses" = ?
             AND (${afterPredicates})) = ?`;
  const [updated, audited] = await executeD1Batch([
    {
      sql: updateSql,
      values: [
        courses,
        updatedAt,
        params.tournamentId,
        params.stage,
        params.round,
        ...beforeValues,
        params.tournamentId,
        params.stage,
        params.round,
        params.matches.length,
        params.tournamentId,
        params.stage,
        params.round,
        ...beforeValues,
        params.matches.length,
      ],
    },
    {
      sql: insertAuditSql,
      values: [
        auditId,
        audit.userId ?? null,
        audit.ipAddress,
        audit.userAgent,
        audit.action,
        audit.targetId ?? null,
        audit.targetType ?? null,
        details,
        params.matches.length,
        params.tournamentId,
        params.stage,
        params.round,
        courses,
        ...afterValues,
        params.matches.length,
      ],
    },
  ]);
  return { updated, audited };
}

/** Atomically changes one GP match's displayed/assigned first cup. If detailed
 * cup data conflicts, clearing it is an explicit caller-selected action. */
async function applyAuditedMatchCupWrite(
  tableName: string,
  params: {
    tournamentId: string;
    matchId: string;
    expectedVersion: number;
    cup: string;
    assignedCups: string[];
    clearDetails: boolean;
    audit: Parameters<typeof buildAuditLogData>[0];
  },
): Promise<{ updated: number; audited: number }> {
  const audit = buildAuditLogData(params.audit);
  const auditId = globalThis.crypto?.randomUUID?.() ?? `audit-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const updatedAt = new Date().toISOString();
  const cups = JSON.stringify(params.assignedCups);
  const details = audit.details === undefined ? null : JSON.stringify(audit.details);
  const clear = params.clearDetails
    ? ', "cupResults" = NULL, "races" = NULL, "player1ReportedRaces" = NULL, "player2ReportedRaces" = NULL, "player1ReportedPoints1" = NULL, "player1ReportedPoints2" = NULL, "player2ReportedPoints1" = NULL, "player2ReportedPoints2" = NULL'
    : '';
  const updateSql = `UPDATE ${tableName}
    SET "cup" = ?, "assignedCups" = ?${clear}, "version" = "version" + 1, "updatedAt" = ?
    WHERE "id" = ? AND "tournamentId" = ? AND "version" = ?`;
  const insertAuditSql = `INSERT INTO "AuditLog" ("id", "userId", "ipAddress", "userAgent", "action", "targetId", "targetType", "details")
    SELECT ?, ?, ?, ?, ?, ?, ?, ?
    WHERE changes() = 1 AND EXISTS (SELECT 1 FROM ${tableName}
      WHERE "id" = ? AND "tournamentId" = ? AND "version" = ? AND "cup" = ? AND "assignedCups" = ?)`;
  const [updated, audited] = await executeD1Batch([
    {
      sql: updateSql,
      values: [params.cup, cups, updatedAt, params.matchId, params.tournamentId, params.expectedVersion],
    },
    {
      sql: insertAuditSql,
      values: [
        auditId,
        audit.userId ?? null,
        audit.ipAddress,
        audit.userAgent,
        audit.action,
        audit.targetId ?? null,
        audit.targetType ?? null,
        details,
        params.matchId,
        params.tournamentId,
        params.expectedVersion + 1,
        params.cup,
        cups,
      ],
    },
  ]);
  return { updated, audited };
}

type AtomicOverrideRoute = {
  id: string;
  version: number;
  player1Id: string | null;
  player2Id: string | null;
  previousPlayer1Id: string | null;
  previousPlayer2Id: string | null;
  previousSlotOverrideBy?: string | null;
  previousSlotOverrideAt?: Date | string | null;
  clearDetails?: boolean;
};

function downstreamPristineSql(eventTypeCode: 'bm' | 'mr' | 'gp', alias: string): string {
  const field = (name: string) => `${alias}${alias ? '.' : ''}\"${name}\"`;
  const scores =
    eventTypeCode === 'gp'
      ? `${field('points1')} = 0 AND ${field('points2')} = 0`
      : `${field('score1')} = 0 AND ${field('score2')} = 0`;
  const confirmed = eventTypeCode === 'mr' ? ` AND ${field('scoresConfirmed')} = 0` : '';
  const details =
    eventTypeCode === 'gp'
      ? ` AND (${field('races')} IS NULL OR ${field('races')} = '[]' OR ${field('races')} = '{}')
         AND (${field('cupResults')} IS NULL OR ${field('cupResults')} = '[]' OR ${field('cupResults')} = '{}')`
      : ` AND (${field('rounds')} IS NULL OR ${field('rounds')} = '[]' OR ${field('rounds')} = '{}')`;
  const reports =
    eventTypeCode === 'bm'
      ? ` AND ${field('player1ReportedScore1')} IS NULL AND ${field('player1ReportedScore2')} IS NULL
         AND ${field('player2ReportedScore1')} IS NULL AND ${field('player2ReportedScore2')} IS NULL`
      : ` AND ${field('player1ReportedPoints1')} IS NULL AND ${field('player1ReportedPoints2')} IS NULL
         AND ${field('player2ReportedPoints1')} IS NULL AND ${field('player2ReportedPoints2')} IS NULL
         AND ${field('player1ReportedRaces')} IS NULL AND ${field('player2ReportedRaces')} IS NULL`;
  return `${field('completed')} = 0 AND ${scores}${confirmed}${details}${reports}`;
}

/** D1 native `batch()` gives the correction, downstream slot routing, and its
 * success audit one atomic commit. */
async function applyAuditedOverrideWrite(params: {
  tableName: string;
  tournamentId: string;
  matchId: string;
  expectedVersion: number;
  scoreField1: string;
  scoreField2: string;
  score1: number;
  score2: number;
  winnerId: string;
  eventTypeCode: 'bm' | 'mr' | 'gp';
  clearSuddenDeathWinner: boolean;
  routes: AtomicOverrideRoute[];
  audit: Parameters<typeof buildAuditLogData>[0];
}): Promise<{ updated: number; audited: number }> {
  const audit = buildAuditLogData(params.audit);
  /* Web Crypto is present in the Worker. The deterministic fallback keeps
   * isolated Jest/runtime shims from turning an otherwise valid correction
   * into a 500; the DB only requires a unique string primary key. */
  const auditId = globalThis.crypto?.randomUUID?.() ?? `audit-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const details = audit.details === undefined ? null : JSON.stringify(audit.details);
  const updatedAt = new Date().toISOString();
  const clearSuddenDeath = params.clearSuddenDeathWinner ? ', "suddenDeathWinnerId" = NULL' : '';
  const downstreamGuard = params.routes.length
    ? ` AND (
      SELECT COUNT(*) FROM ${params.tableName} downstream
      WHERE downstream."tournamentId" = ?
        AND (${params.routes.map(() => `(downstream."id" = ? AND downstream."version" = ? AND ${downstreamPristineSql(params.eventTypeCode, 'downstream')})`).join(' OR ')})
    ) = ${params.routes.length}`
    : '';
  const updateSql = `
    UPDATE ${params.tableName}
    SET "${params.scoreField1}" = ?,
        "${params.scoreField2}" = ?,
        "completed" = 1,
        "winnerOverrideId" = ?${clearSuddenDeath},
        "version" = "version" + 1,
        "updatedAt" = ?
    WHERE "id" = ?
      AND "tournamentId" = ?
      AND "version" = ?${downstreamGuard}`;
  const insertAuditSql = `
    INSERT INTO "AuditLog" ("id", "userId", "ipAddress", "userAgent", "action", "targetId", "targetType", "details")
    SELECT ?, ?, ?, ?, ?, ?, ?, ?
    WHERE EXISTS (
      SELECT 1 FROM ${params.tableName}
      WHERE "id" = ?
        AND "tournamentId" = ?
        AND "version" = ?
        AND "winnerOverrideId" = ?
    )
    /* Only write a success audit when this batch's guarded UPDATE changed
       the match. A stale identical retry must produce neither mutation nor
       audit record. */
    AND changes() = 1`;
  const routeStatements = params.routes.map((route) => {
    const clear = route.clearDetails
      ? params.eventTypeCode === 'gp'
        ? ', "races" = NULL, "cupResults" = NULL, "suddenDeathWinnerId" = NULL'
        : ', "rounds" = NULL'
      : '';
    const reset = route.clearDetails
      ? params.eventTypeCode === 'gp'
        ? ', "points1" = 0, "points2" = 0, "completed" = 0, "winnerOverrideId" = NULL'
        : ', "score1" = 0, "score2" = 0, "completed" = 0, "winnerOverrideId" = NULL'
      : '';
    return {
      sql: `UPDATE ${params.tableName}
        SET "player1Id" = ?, "player2Id" = ?, "slotOverrideBy" = NULL, "slotOverrideAt" = NULL,
            "version" = "version" + 1, "updatedAt" = ?${reset}${clear}
        WHERE "id" = ? AND "tournamentId" = ? AND "version" = ?
          AND ${downstreamPristineSql(params.eventTypeCode, '')}
          AND EXISTS (SELECT 1 FROM ${params.tableName} source
            WHERE source."id" = ? AND source."tournamentId" = ?
              AND source."version" = ? AND source."winnerOverrideId" = ?)
          AND changes() = 1`,
      values: [
        route.player1Id,
        route.player2Id,
        updatedAt,
        route.id,
        params.tournamentId,
        route.version,
        params.matchId,
        params.tournamentId,
        params.expectedVersion + 1,
        params.winnerId,
      ],
    };
  });
  const [updated, ...rest] = await executeD1Batch([
    {
      sql: updateSql,
      values: [
        params.score1,
        params.score2,
        params.winnerId,
        updatedAt,
        params.matchId,
        params.tournamentId,
        params.expectedVersion,
        ...(params.routes.length
          ? [params.tournamentId, ...params.routes.flatMap((route) => [route.id, route.version])]
          : []),
      ],
    },
    ...routeStatements,
    {
      sql: insertAuditSql,
      values: [
        auditId,
        audit.userId ?? null,
        audit.ipAddress,
        audit.userAgent,
        audit.action,
        audit.targetId ?? null,
        audit.targetType ?? null,
        details,
        params.matchId,
        params.tournamentId,
        params.expectedVersion + 1,
        params.winnerId,
      ],
    },
  ]);
  const audited = rest.at(-1) ?? 0;
  const routed = rest.slice(0, -1);
  return { updated, audited: routed.every((count) => count === 1) ? audited : 0 };
}

/**
 * Configuration for a finals route handler set.
 *
 * Each event type (BM, MR, GP) supplies its own config to produce
 * handlers with the correct Prisma model, score fields, and response shape.
 */
export interface FinalsConfig {
  /** Event type code used to select the per-mode qualification confirmed flag (#696). */
  eventTypeCode: 'bm' | 'mr' | 'gp';
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
  /** Resolve number of wins required for a specific match. */
  getTargetWins?: (match: { round?: string | null; stage?: string | null; targetWins?: number | null }) => number;
  /** Error message returned when GET fails */
  getErrorMessage: string;
  /** Error message returned when POST fails */
  postErrorMessage: string;
  /** Whether POST endpoint requires admin authentication */
  postRequiresAuth?: boolean;
  /** Whether PUT endpoint requires admin authentication */
  putRequiresAuth?: boolean;
  /** Whether finals/playoff matches should receive shared MR course assignments */
  assignMrCoursesByRound?: boolean;
  /** Whether finals/playoff matches should receive shared GP cup assignments */
  assignGpCupByRound?: boolean;
  /** Whether BM bracket matches should receive a random shared starting course (1-4) per round */
  assignBmStartingCourseByRound?: boolean;
  /** Optional custom winner/loser resolution for event-specific score rules. */
  resolveMatchResult?: (
    match: Record<string, unknown>,
    score1: number,
    score2: number,
    body: Record<string, unknown>,
  ) => FinalsMatchResult | FinalsMatchResultError;
}

/**
 * Create GET/POST/PUT handlers for a finals route from configuration.
 *
 * @param config - Event-type-specific finals configuration
 * @returns Object with GET/POST/PUT Next.js route handler functions
 */
export function createFinalsHandlers(config: FinalsConfig) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const model = (p: any) => p[config.matchModel];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const qualModel = (p: any) => p[config.qualificationModel];

  /**
   * Detects the Top24 playoff/barrage group count (2 or 3) from the current
   * qualification rows, defaulting to 3 when detection is inconclusive or the
   * query fails. `generatePlayoffStructure()` and `generateBracketStructure(16,
   * ...)` both branch on this value (different seed→slot maps per group
   * count), so every caller that regenerates bracket structure for this
   * tournament must agree on it — otherwise the manual slot-edit PATCH
   * (`handleSlotEdit`, issue #3017) could compute TBD/confirmed slots
   * differently than the GET response the bracket UI is rendering from.
   */
  async function detectTop24GroupCount(tournamentId: string): Promise<2 | 3> {
    try {
      const qualificationGroups = await qualModel(prisma).findMany({
        where: { tournamentId },
        select: { group: true },
      });
      if (Array.isArray(qualificationGroups)) {
        const detectedGroupCount = new Set(
          (qualificationGroups as Array<{ group?: string | null }>).map((row) => row.group).filter(Boolean),
        ).size;
        if (detectedGroupCount === 2 || detectedGroupCount === 3) {
          return detectedGroupCount;
        }
      }
    } catch (error) {
      /* Called from multiple handlers (GET, PATCH), each with its own
       * request-scoped logger, so build one locally rather than threading
       * the caller's logger through this helper's signature. */
      createLogger(config.loggerName).warn(
        'Could not detect qualification group count for playoff layout; using three-group layout',
        { ...getSafeErrorLogFields(error), tournamentId, eventTypeCode: config.eventTypeCode },
      );
    }
    return 3;
  }

  function getQualificationMatchScoreFields(): { p1: string; p2: string } {
    return config.eventTypeCode === 'gp' ? { p1: 'points1', p2: 'points2' } : { p1: 'score1', p2: 'score2' };
  }

  /** A generated bracket snapshots its FT value. Legacy rows deliberately
   * retain the historical round-derived value until an admin changes it. */
  function getMatchTargetWins(match: { round?: string | null; stage?: string | null; targetWins?: unknown }): number {
    return resolveFinalsMatchTargetWins(match, config);
  }

  function getCompletedMatchWinner(
    match: Record<string, unknown>,
  ): { winnerId: string; winnerPlayer: PublicFinalsPlayer } | null {
    const score1 = Number(match[config.putScoreFields.dbField1]);
    const score2 = Number(match[config.putScoreFields.dbField2]);
    const explicitWinnerId =
      typeof match.winnerOverrideId === 'string' && match.winnerOverrideId.length > 0
        ? match.winnerOverrideId
        : score1 === score2 && typeof match.suddenDeathWinnerId === 'string'
          ? match.suddenDeathWinnerId
          : null;
    if (explicitWinnerId) {
      if (explicitWinnerId.length === 0) {
        return null;
      }

      const explicitWinnerPlayer =
        match.player1Id === explicitWinnerId
          ? match.player1
          : match.player2Id === explicitWinnerId
            ? match.player2
            : null;
      if (!isPublicFinalsPlayer(explicitWinnerPlayer)) {
        return null;
      }

      return {
        winnerId: explicitWinnerId,
        winnerPlayer: explicitWinnerPlayer,
      };
    }

    if (!Number.isFinite(score1) || !Number.isFinite(score2) || score1 === score2) {
      return null;
    }

    const winnerId = score1 > score2 ? match.player1Id : match.player2Id;
    if (typeof winnerId !== 'string' || winnerId.length === 0) {
      return null;
    }

    const winnerPlayer = match.player1Id === winnerId ? match.player1 : match.player2;
    if (!isPublicFinalsPlayer(winnerPlayer)) {
      return null;
    }

    return {
      winnerId,
      winnerPlayer,
    };
  }

  /** Read-only counterpart of the #3040 PATCH planner. It deliberately uses
   * the same generated structures, so operators see a stale/blocked state
   * before choosing the reconciliation action. */
  function buildUpperReconciliationPreview(
    playoffRows: Array<Record<string, unknown>>,
    finalsRows: Array<Record<string, unknown>>,
    groupCount: 2 | 3,
  ) {
    const playoffStructure = generatePlayoffStructure(PLAYOFF_ENTRANT_COUNT, groupCount);
    const upperStructure = generateBracketStructure(16, groupCount);
    const expectedVersions: Record<string, number> = {};
    const changes: Array<Record<string, unknown>> = [];
    const blockers: Array<Record<string, unknown>> = [];
    const canonical = new Set<string>();
    const r2Definitions = playoffStructure.filter((entry) => entry.round === 'playoff_r2');
    /* The finals GET returns both barrage rounds. Reconciliation is defined
     * only by the four R2 winners, so ignore the R1 rows rather than treating
     * a complete (eight-row) barrage as unavailable. */
    const r2MatchNumbers = new Set(r2Definitions.map((entry) => entry.matchNumber));
    const playoffR2Rows = playoffRows.filter((row) => row.round === 'playoff_r2');
    if (
      r2Definitions.length !== 4 ||
      playoffR2Rows.length !== 4 ||
      new Set(playoffR2Rows.map((row) => Number(row.matchNumber))).size !== 4 ||
      playoffR2Rows.some((row) => !r2MatchNumbers.has(Number(row.matchNumber)))
    ) {
      return { status: 'unavailable', changes, affectedMatches: [], blockers, expectedVersions };
    }
    for (const definition of r2Definitions) {
      const source = playoffR2Rows.find((row) => row.matchNumber === definition.matchNumber);
      const upperSeed = definition.advancesToUpperSeed;
      if (
        !source ||
        !source.completed ||
        typeof source.version !== 'number' ||
        typeof source.id !== 'string' ||
        typeof upperSeed !== 'number'
      ) {
        return { status: 'unavailable', changes, affectedMatches: [], blockers, expectedVersions: {} };
      }
      const winner = getCompletedMatchWinner(source);
      const opening = upperStructure.find(
        (entry) => entry.player1Seed === upperSeed || entry.player2Seed === upperSeed,
      );
      const target = opening && finalsRows.find((row) => row.matchNumber === opening.matchNumber);
      if (!winner || !opening || !target || typeof target.id !== 'string' || typeof target.version !== 'number') {
        return { status: 'unavailable', changes, affectedMatches: [], blockers, expectedVersions: {} };
      }
      expectedVersions[source.id] = source.version;
      const side: 1 | 2 = opening.player1Seed === upperSeed ? 1 : 2;
      canonical.add(`${target.id}:${side}`);
      const beforePlayerId = side === 1 ? target.player1Id : target.player2Id;
      if (beforePlayerId !== winner.winnerId) {
        changes.push({
          sourceMatchId: source.id,
          upperSeed,
          targetMatchId: target.id,
          targetMatchNumber: target.matchNumber,
          slot: side,
          beforePlayerId,
          afterPlayerId: winner.winnerId,
        });
      }
    }
    if (changes.length === 0) return { status: 'in_sync', changes, affectedMatches: [], blockers, expectedVersions };
    const affectedNumbers = new Set<number>();
    for (const change of changes) {
      const queue = [Number(change.targetMatchNumber)];
      while (queue.length) {
        const matchNumber = queue.shift()!;
        if (affectedNumbers.has(matchNumber)) continue;
        affectedNumbers.add(matchNumber);
        const definition = upperStructure.find((entry) => entry.matchNumber === matchNumber);
        if (definition?.winnerGoesTo) queue.push(definition.winnerGoesTo);
        if (definition?.loserGoesTo) queue.push(definition.loserGoesTo);
        if (definition?.round === 'grand_final') {
          const reset = finalsRows.find((row) => row.round === 'grand_final_reset');
          if (reset) queue.push(Number(reset.matchNumber));
        }
      }
    }
    const affectedMatches = finalsRows
      .filter((row) => affectedNumbers.has(Number(row.matchNumber)))
      .map((row) => {
        const reasons = [
          ...(downstreamMatchHasRecordedResult(row) ? ['DOWNSTREAM_MATCH_STARTED'] : []),
          ...(row.slotOverrideBy || row.slotOverrideAt ? ['MANUAL_SLOT_OVERRIDE'] : []),
        ];
        if (typeof row.id === 'string' && typeof row.version === 'number') expectedVersions[row.id] = row.version;
        if (reasons.length) blockers.push({ matchId: row.id, matchNumber: row.matchNumber, round: row.round, reasons });
        return { id: row.id, matchNumber: row.matchNumber, round: row.round, reasons };
      });
    return { status: blockers.length ? 'blocked' : 'stale', changes, affectedMatches, blockers, expectedVersions };
  }

  /** Resolve each completed playoff_r2 winner and its group-specific Upper slot. */
  function resolvePlayoffWinners(
    playoffStructure: ReturnType<typeof generatePlayoffStructure>,
    r2Matches: Top24FinalsPreviewMatch[],
    options: {
      requireWinner: boolean;
      tournamentId: string;
      logger: ReturnType<typeof createLogger>;
    },
  ) {
    const resolvedWinners: Array<{
      upperSeed: number;
      winner: { winnerId: string; winnerPlayer: PublicFinalsPlayer };
    }> = [];

    for (const bracketMatch of playoffStructure.filter((match) => match.round === 'playoff_r2')) {
      if (!bracketMatch.advancesToUpperSeed) continue;
      const dbMatch = r2Matches.find((match) => match.matchNumber === bracketMatch.matchNumber);
      if (!dbMatch?.completed) continue;

      const winner = getCompletedMatchWinner(dbMatch);
      if (!winner) {
        options.logger.warn('Top-24 playoff winner could not be resolved', {
          tournamentId: options.tournamentId,
          eventTypeCode: config.eventTypeCode,
          matchNumber: bracketMatch.matchNumber,
          advancesToUpperSeed: bracketMatch.advancesToUpperSeed,
        });
        if (options.requireWinner) {
          throw new Error(`Playoff winner for match ${bracketMatch.matchNumber} not resolved`);
        }
        continue;
      }

      resolvedWinners.push({ upperSeed: bracketMatch.advancesToUpperSeed, winner });
    }

    return { resolvedWinners };
  }

  function buildDirectSeededPlayers(
    directSeeds: Array<{ seed: number; qualification: { playerId: string; player: unknown } }>,
    qualificationRankLabels: Map<string, string>,
    tournamentId: string,
    logger: ReturnType<typeof createLogger>,
  ): SeededFinalsPlayer[] {
    const seededPlayers: SeededFinalsPlayer[] = [];

    for (const { seed, qualification } of directSeeds) {
      if (!isPublicFinalsPlayer(qualification.player)) {
        logger.warn('Top-24 direct seed player could not be resolved', {
          tournamentId,
          eventTypeCode: config.eventTypeCode,
          seed,
          playerId: qualification.playerId,
        });
        continue;
      }

      seededPlayers.push({
        seed,
        originalSeed: seed,
        playerId: qualification.playerId,
        player: qualification.player,
        qualificationRankLabel: qualificationRankLabels.get(qualification.playerId),
      });
    }

    return seededPlayers;
  }

  /**
   * Rebuild ordinary finals' original seeds from the confirmed qualification
   * order, rather than from the current opening-round slot. The latter can be
   * deliberately changed by the slot-adjustment workflow, while the seed
   * label must remain the player's qualification seed in every KO round.
   */
  async function buildStandardSeededPlayers(
    tournamentId: string,
    topN: number,
    logger: ReturnType<typeof createLogger>,
  ): Promise<SeededFinalsPlayer[]> {
    try {
      const qualifications = await qualModel(prisma).findMany({
        where: { tournamentId },
        include: { player: { select: PLAYER_PUBLIC_SELECT } },
        orderBy: config.qualificationOrderBy,
      });
      const rankedQualifications = await applyFinalsQualificationRanks(model, tournamentId, qualifications);
      const qualificationRankLabels = buildQualificationRankLabelMap(rankedQualifications);

      const seededPlayers = orderQualificationsForFinalsSeeding(rankedQualifications)
        .slice(0, topN)
        .flatMap((qualification: { playerId: string; player: unknown }, index: number) => {
          if (!isPublicFinalsPlayer(qualification.player)) {
            logger.warn('Finals seed player could not be resolved', {
              tournamentId,
              eventTypeCode: config.eventTypeCode,
              seed: index + 1,
              playerId: qualification.playerId,
            });
            return [];
          }
          return [
            {
              seed: index + 1,
              originalSeed: index + 1,
              playerId: qualification.playerId,
              player: qualification.player,
              qualificationRankLabel: qualificationRankLabels.get(qualification.playerId),
            },
          ];
        });
      /* This is display-only compatibility data. A legacy opening-slot swap
       * makes qualification order insufficient evidence of the original seed,
       * so only finals-seed-snapshot.ts may persist a structural backfill. */
      return seededPlayers;
    } catch (error) {
      logger.error('Failed to rebuild finals original seeds', {
        ...getSafeErrorLogFields(error),
        tournamentId,
        eventTypeCode: config.eventTypeCode,
      });
      return [];
    }
  }

  function hasAutomaticRankTies(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    qualifications: any[],
    orderBy: Array<Record<string, 'asc' | 'desc'>>,
  ): boolean {
    const firstOrderField = Object.keys(orderBy[0] ?? {})[0];
    const rankingOrder = firstOrderField === 'group' ? orderBy.slice(1) : orderBy;
    /* Without a ranking field there is no business rule for determining
     * automatic ties. Returning false avoids JavaScript's [].every()
     * vacuous truth from treating every adjacent row as tied and issuing an
     * unnecessary qualification H2H query. */
    if (rankingOrder.length === 0) return false;
    const byPartition = new Map<string, typeof qualifications>();

    for (const q of qualifications) {
      const partition = firstOrderField === 'group' ? (q.group ?? '') : '';
      const bucket = byPartition.get(partition) ?? [];
      bucket.push(q);
      byPartition.set(partition, bucket);
    }

    for (const bucket of byPartition.values()) {
      for (let i = 1; i < bucket.length; i++) {
        const current = bucket[i];
        const previous = bucket[i - 1];
        const tied = rankingOrder.every((ob) => {
          const field = Object.keys(ob)[0];
          return current[field] === previous[field];
        });
        if (tied) return true;
      }
    }

    return false;
  }

  async function applyFinalsQualificationRanks(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    matchModel: (p: any) => any,
    tournamentId: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    qualifications: any[],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): Promise<any[]> {
    const scoreFields = getQualificationMatchScoreFields();
    const needsH2h = hasAutomaticRankTies(qualifications, config.qualificationOrderBy);
    const matches = needsH2h
      ? await matchModel(prisma).findMany({
          where: {
            tournamentId,
            stage: 'qualification',
            completed: true,
            isBye: false,
          },
          select: {
            player1Id: true,
            player2Id: true,
            completed: true,
            isBye: true,
            [scoreFields.p1]: true,
            [scoreFields.p2]: true,
          },
        })
      : [];

    return computeQualificationRanks(qualifications, config.qualificationOrderBy, matches, {
      matchScoreFields: scoreFields,
    });
  }

  function orderQualificationsForFinalsSeeding<
    TQualification extends {
      _rank: number;
      _rankOverridden?: boolean;
      rankOverride?: number | null;
      rankOverrideAt?: Date | string | null;
    },
  >(qualifications: TQualification[]): TQualification[] {
    return qualifications
      .map((qualification, index) => ({ qualification, index }))
      .sort((a, b) => {
        if (a.qualification._rank !== b.qualification._rank) {
          return a.qualification._rank - b.qualification._rank;
        }
        const aOverride = a.qualification.rankOverride != null;
        const bOverride = b.qualification.rankOverride != null;
        if (aOverride !== bOverride) return aOverride ? -1 : 1;
        if (aOverride) {
          const aRankOverride = a.qualification.rankOverride!;
          const bRankOverride = b.qualification.rankOverride!;
          if (aRankOverride !== bRankOverride) return aRankOverride - bRankOverride;
          const aOverrideAt = a.qualification.rankOverrideAt ? new Date(a.qualification.rankOverrideAt).getTime() : 0;
          const bOverrideAt = b.qualification.rankOverrideAt ? new Date(b.qualification.rankOverrideAt).getTime() : 0;
          if (aOverrideAt !== bOverrideAt) return bOverrideAt - aOverrideAt;
        }
        return a.index - b.index;
      })
      .map(({ qualification }) => qualification);
  }

  function getRoundAssignmentData(
    round: string,
    mrAssignments?: Map<string, string[]>,
    gpAssignments?: Map<string, string[]>,
    bmStartingCourses?: Map<string, number>,
  ): Record<string, unknown> {
    const assignedCups = gpAssignments?.get(round) ?? [];
    return {
      ...(config.assignMrCoursesByRound ? { assignedCourses: mrAssignments?.get(round) ?? [] } : {}),
      ...(config.assignGpCupByRound ? { cup: assignedCups[0] ?? null, assignedCups } : {}),
      ...(config.assignBmStartingCourseByRound ? { startingCourseNumber: bmStartingCourses?.get(round) ?? null } : {}),
    };
  }

  /* NOTE: The remainder of this module is unchanged from main. */
}
