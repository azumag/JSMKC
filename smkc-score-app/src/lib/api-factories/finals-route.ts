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
import { getGpFinalsMaxCups, getMrFinalsMaxRounds } from '@/lib/finals-target-wins';
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
import { createAuditLog, resolveAuditUserId, AUDIT_ACTIONS } from '@/lib/audit-log';
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
): Map<string, string[]> {
  const shuffledCourses = fisherYatesShuffle(COURSES);
  const assignments = new Map<string, string[]>();
  let cursor = 0;

  for (const round of getOrderedRounds(bracketStructure)) {
    const roundsNeeded = getMrFinalsMaxRounds({ round, stage });
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
 * one shared cup sequence per bracket round in `assignedCups`: FT1 => 1 cup,
 * FT2 => 3 cups, FT3 => 5 cups. The first four entries are unique; only the
 * fifth FT3 cup may repeat. Old rows that only have `cup` are backfilled by
 * choosing a canonical sequence for the whole round.
 */
interface CupNormalizationResult {
  repaired: boolean;
  canonicalByRound: Map<string, { cup: string; assignedCups: string[] }>;
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
  matches: Array<{ id: string; cup?: string | null; assignedCups?: unknown; round?: string | null }>,
  logger?: ReturnType<typeof createLogger>,
): Promise<CupNormalizationResult> {
  const matchesByRound = new Map<
    string,
    Array<{
      id: string;
      cup?: string | null;
      assignedCups: string[];
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
    });
  }

  const canonicalByRound = new Map<string, { cup: string; assignedCups: string[] }>();

  for (const [round, roundMatches] of matchesByRound) {
    const maxCups = getGpFinalsMaxCups({ round, stage });
    const keyCounts = new Map<string, number>();
    const keyToArray = new Map<string, string[]>();
    const firstCupCounts = new Map<string, number>();

    for (const match of roundMatches) {
      const firstCup = match.assignedCups[0] ?? match.cup;
      if (firstCup && CUPS.includes(firstCup as (typeof CUPS)[number])) {
        firstCupCounts.set(firstCup, (firstCupCounts.get(firstCup) ?? 0) + 1);
      }

      if (!isValidGpCupSequence(match.assignedCups, maxCups)) continue;
      const key = JSON.stringify(match.assignedCups);
      keyCounts.set(key, (keyCounts.get(key) ?? 0) + 1);
      if (!keyToArray.has(key)) keyToArray.set(key, match.assignedCups);
    }

    const roundMatchCount = roundMatches.length;
    if (keyCounts.size === 1 && Array.from(keyCounts.values())[0] === roundMatchCount) {
      continue;
    }

    let canonical: string[] | undefined;
    let dominantCount = 0;
    /* Callers pass matches in matchNumber order. Map iteration then preserves
     * insertion order, so equal-count sequences keep the first valid sequence
     * seen in this round without adding another arbitrary sort key. */
    for (const [key, count] of keyCounts) {
      if (count > dominantCount) {
        canonical = keyToArray.get(key);
        dominantCount = count;
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

    const assignedCups = canonical ?? createGpCupSequence(maxCups, preferredFirstCup);
    canonicalByRound.set(round, { cup: assignedCups[0], assignedCups });
  }

  /* Collapse legacy GP repairs to one write per round. Keep JSON comparison in
   * JS, then scope updateMany by id list instead of adding brittle Prisma JSON
   * predicates on D1/SQLite. */
  const writes: Array<Promise<unknown>> = [];
  for (const [round, data] of canonicalByRound) {
    const canonicalKey = JSON.stringify(data.assignedCups);
    const staleIds = (matchesByRound.get(round) ?? [])
      .filter((match) => match.cup !== data.cup || JSON.stringify(match.assignedCups) !== canonicalKey)
      .map((match) => match.id);
    if (staleIds.length === 0) continue;

    writes.push(
      modelInstance.updateMany({
        where: { tournamentId, stage, round, id: { in: staleIds } },
        data,
      }),
    );
  }

  const writeResults = await Promise.allSettled(writes);
  const failedWrites = writeResults.filter((result): result is PromiseRejectedResult => result.status === 'rejected');
  if (failedWrites.length > 0) {
    logger?.warn('Failed to backfill some GP assigned cup rounds', {
      failedWrites: failedWrites.length,
      totalWrites: writes.length,
      reasons: failedWrites.map((result) =>
        result.reason instanceof Error ? result.reason.message : String(result.reason),
      ),
    });
  }

  return { repaired: writes.length > 0, canonicalByRound };
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
}

async function normalizeRoundCoursesToSingleSet(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  modelInstance: any,
  tournamentId: string,
  stage: 'finals' | 'playoff',
  matches: Array<{ id: string; assignedCourses?: unknown; round?: string | null }>,
): Promise<CourseNormalizationResult> {
  /* Coerce stored value to a plain string[]. JSON columns on D1 come back
   * as arrays already via Prisma's serialization, but we handle null and
   * non-array shapes defensively. */
  const normalizeArray = (value: unknown): string[] => {
    if (!Array.isArray(value)) return [];
    return value.filter((entry): entry is string => typeof entry === 'string');
  };

  const matchesByRound = new Map<string, Array<{ id: string; courses: string[] }>>();
  for (const match of matches) {
    if (!match.round) continue;
    const entry = { id: match.id, courses: normalizeArray(match.assignedCourses) };
    if (!matchesByRound.has(match.round)) matchesByRound.set(match.round, []);
    matchesByRound.get(match.round)!.push(entry);
  }

  /* Collect rounds that need repair and the canonical array for each. */
  const canonicalByRound = new Map<string, string[]>();
  const roundsNeedingRegen = new Set<string>();

  for (const [round, roundMatches] of matchesByRound) {
    const keyCounts = new Map<string, number>();
    const keyToArray = new Map<string, string[]>();
    for (const { courses } of roundMatches) {
      if (courses.length === 0) continue;
      const key = JSON.stringify(courses);
      keyCounts.set(key, (keyCounts.get(key) ?? 0) + 1);
      if (!keyToArray.has(key)) keyToArray.set(key, courses);
    }

    const distinctNonEmpty = keyCounts.size;
    const matchesWithCourses = Array.from(keyCounts.values()).reduce((a, b) => a + b, 0);

    if (distinctNonEmpty === 1 && matchesWithCourses === roundMatches.length) {
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
    const freshAssignments = createMrRoundAssignments(bracketStructure, stage);
    for (const round of roundsNeedingRegen) {
      const fresh = freshAssignments.get(round);
      if (fresh) canonicalByRound.set(round, fresh);
    }
  }

  if (canonicalByRound.size === 0) {
    return { repaired: false, canonicalByRound: new Map() };
  }

  /* Per-row updates: Prisma's JSON column equality filter on D1 is
   * unreliable, so we compare in JS and write only when different. */
  let writes = 0;
  for (const [round, canonical] of canonicalByRound) {
    const canonicalKey = JSON.stringify(canonical);
    const roundMatches = matchesByRound.get(round) ?? [];
    for (const { id, courses } of roundMatches) {
      if (JSON.stringify(courses) === canonicalKey) continue;
      await modelInstance.update({
        where: { id },
        data: { assignedCourses: canonical },
      });
      writes += 1;
    }
  }

  return { repaired: writes > 0, canonicalByRound };
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
 * Fisher-Yates shuffle of [1,2,3,4]. Then `updateMany` rows where the stored
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
      AND "stage" IN ('finals', 'playoff')
      AND "round" = ${params.round}
      AND "completed" = 0 AND "isBye" = 0
      AND (
        ("id" = ${params.idA} AND "version" = ${params.versionA})
        OR ("id" = ${params.idB} AND "version" = ${params.versionB})
      )
      AND (
        SELECT COUNT(*) FROM ${table} g
        WHERE g."tournamentId" = ${params.tournamentId}
          AND g."stage" IN ('finals', 'playoff')
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
  getTargetWins?: (match: { round?: string | null; stage?: string | null }) => number;
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
 * @returns Object with GET, POST, PUT Next.js route handler functions
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

  function getCompletedMatchWinner(
    match: Record<string, unknown>,
  ): { winnerId: string; winnerPlayer: PublicFinalsPlayer } | null {
    const score1 = Number(match[config.putScoreFields.dbField1]);
    const score2 = Number(match[config.putScoreFields.dbField2]);
    if (score1 === score2 && typeof match.suddenDeathWinnerId === 'string') {
      const suddenDeathWinnerId = match.suddenDeathWinnerId;
      if (suddenDeathWinnerId.length === 0) {
        return null;
      }

      const suddenDeathWinnerPlayer =
        match.player1Id === suddenDeathWinnerId
          ? match.player1
          : match.player2Id === suddenDeathWinnerId
            ? match.player2
            : null;
      if (!isPublicFinalsPlayer(suddenDeathWinnerPlayer)) {
        return null;
      }

      return {
        winnerId: suddenDeathWinnerId,
        winnerPlayer: suddenDeathWinnerPlayer,
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
    /*
     * Finals seeding is a tournament-wide bracket contract, not a grouped
     * standings display contract. `computeQualificationRanks()` intentionally
     * resets `_rank` inside each qualification group so UI labels can remain
     * A1/B1/etc.; when a director enters a manual `rankOverride`, that finalized
     * rank must still win globally for bracket seed order. This mirrors standard
     * seeded-bracket practice: published/manual seed numbers are authoritative,
     * while equal automatic group ranks fall back to the existing stable group
     * order to avoid reshuffling normal A/B standings. If two manual overrides
     * collide on the same seed number, prefer the most recent `rankOverrideAt`
     * because it represents the director's latest explicit correction.
     */
    return qualifications
      .map((qualification, index) => ({ qualification, index }))
      .sort((a, b) => {
        if (a.qualification._rank !== b.qualification._rank) {
          return a.qualification._rank - b.qualification._rank;
        }
        /*
         * `computeQualificationRanks()` sets `_rankOverridden` from
         * `rankOverride != null`, so the persisted override value is the source
         * of truth here. Depending on `_rankOverridden` as a second source would
         * hide inconsistent inputs instead of letting the stable fallback expose
         * them during tests or review.
         */
        const aOverride = a.qualification.rankOverride != null;
        const bOverride = b.qualification.rankOverride != null;
        if (aOverride !== bOverride) return aOverride ? -1 : 1;
        if (aOverride) {
          // Both aOverride and bOverride are true here (line 877 returns early when they differ),
          // so rankOverride is guaranteed non-null for both.
          const aRankOverride = a.qualification.rankOverride!;
          const bRankOverride = b.qualification.rankOverride!;
          if (aRankOverride !== bRankOverride) return aRankOverride - bRankOverride;

          // When manual overrides collide on the same rank value, prefer the
          // latest manual correction timestamp.
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

  async function buildTop24FinalsPreview(
    tournamentId: string,
    playoffMatches: Top24FinalsPreviewMatch[],
    logger: ReturnType<typeof createLogger>,
    snapshot: FinalsSeedSnapshotEntry[] = [],
  ): Promise<{
    bracketStructure: ReturnType<typeof generateBracketStructure>;
    seededPlayers: SeededFinalsPlayer[];
  } | null> {
    if (playoffMatches.length === 0) return null;

    try {
      const qualifications = (await qualModel(prisma).findMany({
        where: { tournamentId },
        include: { player: { select: PLAYER_PUBLIC_SELECT } },
        orderBy: config.qualificationOrderBy,
      })) as Top24FinalsQualification[];

      /* This guard is deliberately tied to the full Top-24 qualifier count,
       * not PLAYOFF_ENTRANT_COUNT. The preview seeds direct qualifiers plus
       * playoff winners into a 16-player Upper Bracket, so using the 12-player
       * barrage pool here would let incomplete qualification data produce a
       * misleading Phase-2 preview. */
      if (qualifications.length < TOP24_QUALIFIER_COUNT) return null;

      const rankedQualifications = await applyFinalsQualificationRanks(model, tournamentId, qualifications);
      const qualificationRankLabels = buildQualificationRankLabelMap(rankedQualifications);

      const selection = selectFinalsEntrantsByGroup<PublicFinalsPlayer | null>(
        rankedQualifications as Top24FinalsQualification[],
      );
      let seedSnapshot = snapshot;
      if (seedSnapshot.length === 0) {
        const directSnapshot = buildDirectSeededPlayers(
          selection.directSeeds,
          qualificationRankLabels,
          tournamentId,
          logger,
        );
        const barrageSnapshot = selection.barrageSeeds.flatMap(({ seed, qualification }) =>
          isPublicFinalsPlayer(qualification.player)
            ? [
                {
                  seed,
                  originalSeed: seed,
                  playerId: qualification.playerId,
                  player: qualification.player,
                  qualificationRankLabel: qualificationRankLabels.get(qualification.playerId),
                },
              ]
            : [],
        );
        seedSnapshot = [...directSnapshot, ...barrageSnapshot] as FinalsSeedSnapshotEntry[];
        /* This reconstruction exists only to render an old, incomplete
         * playoff. Persisting it would incorrectly turn current rankings into
         * historical seeds. Creation and structural backfill own persistence. */
      }
      const snapshotByPlayerId = new Map(seedSnapshot.map((entry) => [entry.playerId, entry]));

      const playoffStructure = generatePlayoffStructure(PLAYOFF_ENTRANT_COUNT, selection.groupCount);
      const r2Matches = playoffMatches.filter((m) => m.round === 'playoff_r2');
      const { resolvedWinners } = resolvePlayoffWinners(playoffStructure, r2Matches, {
        requireWinner: false,
        tournamentId,
        logger,
      });
      const playoffWinnerSeeds: SeededFinalsPlayer[] = resolvedWinners.map(({ upperSeed, winner }) => ({
        seed: upperSeed,
        originalSeed:
          snapshotByPlayerId.get(winner.winnerId)?.originalSeed ??
          selection.barrageSeeds.find(({ qualification }) => qualification.playerId === winner.winnerId)?.seed,
        playerId: winner.winnerId,
        player: winner.winnerPlayer,
        qualificationRankLabel: qualificationRankLabels.get(winner.winnerId),
      }));

      const seededPlayers = [
        ...(seedSnapshot.length > 0
          ? seedSnapshot.filter((entry) => entry.originalSeed <= TOP24_QUALIFIER_COUNT - PLAYOFF_ENTRANT_COUNT)
          : buildDirectSeededPlayers(selection.directSeeds, qualificationRankLabels, tournamentId, logger)),
        ...playoffWinnerSeeds,
      ];

      return {
        bracketStructure: generateBracketStructure(16, selection.groupCount),
        seededPlayers,
      };
    } catch (error) {
      /* Keep the GET response compatible with the existing playoff fallback,
       * but never swallow preview construction failures silently. OWASP's
       * exception-handling guidance warns that empty catches leave the audit
       * trail incomplete; the structured context here is intentionally limited
       * to non-sensitive identifiers needed for production diagnosis. */
      logger.error('Failed to build Top-24 finals preview', {
        ...getSafeErrorLogFields(error),
        tournamentId,
        eventTypeCode: config.eventTypeCode,
      });
      return null;
    }
  }

  /**
   * GET handler: Fetch finals bracket data for a tournament.
   * Response shape depends on config.getStyle.
   */
  async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const logger = createLogger(config.loggerName);
    const { id } = await params;

    // Resolve and verify in one D1 round-trip. The handler only consumes
    // the mode-specific qualificationConfirmed flag, so the projection stays
    // tight. Using per-mode flags (issue #696) prevents BM confirmation from
    // locking MR/GP bracket creation.
    const modeField = getQualificationConfirmedField(config.eventTypeCode);
    const seedSnapshotField = getFinalsSeedSnapshotField(config.eventTypeCode);
    // Select all three flags explicitly to avoid computed-key type inference issues with Prisma generics.
    let tournament;
    try {
      tournament = await resolveTournament(id, {
        id: true,
        bmQualificationConfirmed: true,
        mrQualificationConfirmed: true,
        gpQualificationConfirmed: true,
        bmFinalsSeedSnapshot: true,
        mrFinalsSeedSnapshot: true,
        gpFinalsSeedSnapshot: true,
      });
    } catch (error) {
      logger.error(config.getErrorMessage, { error, tournamentId: id });
      const archived = await readTournamentArchive(id);
      if (archived) {
        return createSuccessResponse(getArchivedFinalsPayload(archived, config.eventTypeCode, config.getStyle));
      }
      return createErrorResponse(config.getErrorMessage, 500, 'INTERNAL_ERROR');
    }
    if (!tournament) {
      const archived = await readTournamentArchive(id);
      if (archived) {
        return createSuccessResponse(getArchivedFinalsPayload(archived, config.eventTypeCode, config.getStyle));
      }
      return createErrorResponse('Tournament not found', 404, 'NOT_FOUND');
    }
    const tournamentId = tournament.id;
    const responseSnapshot = parseFinalsSeedSnapshot((tournament as Record<string, unknown>)[seedSnapshotField]);
    const seedResolution = isCompleteFinalsSeedSnapshot(responseSnapshot)
      ? { status: 'complete' as const, snapshot: responseSnapshot }
      : await resolveFinalsSeedSnapshot(tournamentId, config.eventTypeCode);
    if (seedResolution.status === 'unsafe') {
      return createErrorResponse(
        'Original finals seed mapping cannot be safely reconstructed. An administrator must reset and recreate the finals bracket before it can be displayed.',
        409,
        'FINALS_SEED_REPAIR_REQUIRED',
      );
    }
    const storedSeededPlayers = seedResolution.snapshot;

    try {
      /* Shared playoff data for all GET styles.
       * Playoff matches live in a distinct `stage='playoff'` row (issue #454).
       * When present, we also regenerate the bracket structure and reconstruct
       * seed-to-player mappings so the frontend can render the bracket without
       * relying on state from a previous POST response. */
      const playoffMatches = await model(prisma).findMany({
        where: { tournamentId, stage: 'playoff' },
        include: { player1: { select: PLAYER_PUBLIC_SELECT }, player2: { select: PLAYER_PUBLIC_SELECT } },
        orderBy: { matchNumber: 'asc' },
      });

      /* Normalize GP cup sequences for legacy playoff rows. New rows store a
       * round-shared assignedCups array; old rows only had the first cup. Patch
       * in-memory from the canonical map so the current response sees the
       * repaired sequence without a second findMany. */
      if (config.assignGpCupByRound && playoffMatches.length > 0) {
        const cupResult = await normalizeRoundCupsToSingleSequence(
          model(prisma),
          tournamentId,
          'playoff',
          playoffMatches,
          logger,
        );
        if (cupResult.repaired) {
          for (const m of playoffMatches) {
            const round = (m as { round?: string | null }).round;
            const canonical = round ? cupResult.canonicalByRound.get(round) : undefined;
            if (canonical) {
              (m as { cup?: string | null; assignedCups?: unknown }).cup = canonical.cup;
              (m as { cup?: string | null; assignedCups?: unknown }).assignedCups = canonical.assignedCups;
            }
          }
        }
      }

      /* MR counterpart: same rule for assignedCourses — every match in the
       * same playoff round must share one course set. Patch in-memory using
       * the canonical map for the same reason as the cup branch above. */
      if (config.assignMrCoursesByRound && playoffMatches.length > 0) {
        const courseResult = await normalizeRoundCoursesToSingleSet(
          model(prisma),
          tournamentId,
          'playoff',
          playoffMatches,
        );
        if (courseResult.repaired) {
          for (const m of playoffMatches) {
            const round = (m as { round?: string | null }).round;
            if (!round) continue;
            const canonical = courseResult.canonicalByRound.get(round);
            if (canonical) {
              (m as { assignedCourses?: unknown }).assignedCourses = canonical;
            }
          }
        }
      }

      /* BM counterpart: same rule for startingCourseNumber. Repairs both
       * legacy null rows (#671 pre-deployment data) and admin-induced
       * round desync. Patches in-memory so the response reflects the
       * canonical value without a refetch. */
      if (config.assignBmStartingCourseByRound && playoffMatches.length > 0) {
        const courseResult = await normalizeRoundStartingCoursesToSingleValue(
          model(prisma),
          tournamentId,
          'playoff',
          playoffMatches,
        );
        if (courseResult.repaired) {
          for (const m of playoffMatches) {
            const round = (m as { round?: string | null }).round;
            if (!round) continue;
            const canonical = courseResult.canonicalByRound.get(round);
            if (canonical !== undefined) {
              (m as { startingCourseNumber?: number | null }).startingCourseNumber = canonical;
            }
          }
        }
      }

      const top24GroupCount: 2 | 3 = playoffMatches.length > 0 ? await detectTop24GroupCount(tournamentId) : 3;
      const playoffStructure =
        playoffMatches.length > 0 ? generatePlayoffStructure(PLAYOFF_ENTRANT_COUNT, top24GroupCount) : [];
      const serializedPlayoffMatches = serializeFinalsSlots(
        playoffMatches as unknown as SlotStatusMatch[],
        playoffStructure,
      );

      /* Reconstruct playoff seeded players from DB match data + structure.
       * R1 matches carry player1Seed (17-24) and player2Seed;
       * R2 matches carry player1Seed for BYE seeds (13-16).
       * player2Seed is null for R2 (opponent comes from R1 winner),
       * so we only map seeds from structure-defined positions. */
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const playoffSeededPlayers: any[] = [];
      if (playoffMatches.length > 0) {
        const seedMap = new Map<number, { playerId: string; player: unknown }>();
        for (const bracketMatch of playoffStructure) {
          const dbMatch = playoffMatches.find(
            (m: { matchNumber: number }) => m.matchNumber === bracketMatch.matchNumber,
          );
          if (!dbMatch) continue;
          if (bracketMatch.player1Seed != null) {
            seedMap.set(bracketMatch.player1Seed, {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              playerId: (dbMatch as any).player1Id,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              player: (dbMatch as any).player1,
            });
          }
          if (bracketMatch.player2Seed != null) {
            seedMap.set(bracketMatch.player2Seed, {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              playerId: (dbMatch as any).player2Id,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              player: (dbMatch as any).player2,
            });
          }
        }
        for (const [seed, data] of [...seedMap.entries()].sort((a, b) => a[0] - b[0])) {
          playoffSeededPlayers.push({ seed, ...data });
        }
      }
      const snapshotPlayoffSeededPlayers = storedSeededPlayers.filter(
        (entry) => entry.originalSeed >= 13 && entry.originalSeed <= TOP24_QUALIFIER_COUNT,
      );
      if (snapshotPlayoffSeededPlayers.length > 0) {
        playoffSeededPlayers.splice(0, playoffSeededPlayers.length, ...snapshotPlayoffSeededPlayers);
      }

      /* Compute playoff completion flag from DB data so the frontend
       * can show "Create Upper Bracket" even after a page refresh. */
      const playoffR2Matches = playoffMatches.filter((m: { round?: string }) => m.round === 'playoff_r2');
      const playoffComplete =
        playoffR2Matches.length === 4 &&
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        playoffR2Matches.every((m: any) => m.completed);

      /* Phase priority: when both playoff and finals exist (Phase-2 has run),
       * default to 'finals' so the UI lands on the Upper Bracket first.
       * The client can still switch to the playoff tab via the archived
       * playoffMatches returned below. */
      const hasFinals = await model(prisma).count({
        where: { tournamentId, stage: 'finals' },
      });
      const phase =
        hasFinals > 0 ? ('finals' as const) : playoffMatches.length > 0 ? ('playoff' as const) : ('finals' as const);
      /* The Top-24 mapping is also needed after Phase 2 has created finals:
       * it is the only durable way to distinguish a barrage winner's
       * qualification seed from the Upper-Bracket slot they were routed to. */
      const top24FinalsPreview = await buildTop24FinalsPreview(
        tournamentId,
        playoffMatches,
        logger,
        storedSeededPlayers,
      );

      /* Normalize GP cup sequences for legacy finals rows before paginating or
       * simple/grouped fetches, so every branch sees the repaired state. */
      if (config.assignGpCupByRound) {
        const legacyFinals = await model(prisma).findMany({
          where: { tournamentId, stage: 'finals' },
          select: { id: true, round: true, cup: true, assignedCups: true },
          orderBy: { matchNumber: 'asc' },
        });
        if (legacyFinals.length > 0) {
          await normalizeRoundCupsToSingleSequence(model(prisma), tournamentId, 'finals', legacyFinals, logger);
        }
      }

      /* MR counterpart for finals stage. */
      if (config.assignMrCoursesByRound) {
        const legacyFinals = await model(prisma).findMany({
          where: { tournamentId, stage: 'finals' },
          select: { id: true, round: true, assignedCourses: true },
        });
        if (legacyFinals.length > 0) {
          await normalizeRoundCoursesToSingleSet(model(prisma), tournamentId, 'finals', legacyFinals);
        }
      }

      /* BM counterpart for finals stage. DB-only repair; the subsequent
       * findMany at the shared fetch below picks up the updated values. */
      if (config.assignBmStartingCourseByRound) {
        const legacyFinals = await model(prisma).findMany({
          where: { tournamentId, stage: 'finals' },
          select: { id: true, round: true, startingCourseNumber: true },
        });
        if (legacyFinals.length > 0) {
          await normalizeRoundStartingCoursesToSingleValue(model(prisma), tournamentId, 'finals', legacyFinals);
        }
      }

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
          {
            page,
            limit,
            include: { player1: { select: PLAYER_PUBLIC_SELECT }, player2: { select: PLAYER_PUBLIC_SELECT } },
          },
        );

        /* Infer bracket size from total match count:
         * 8-player bracket = 17 matches, 16-player bracket = 31 matches.
         * Use count > 20 as threshold to distinguish.
         * Use result.meta.total from paginate() to avoid an extra count query. */
        const bracketSize = (result.meta.total ?? 0) > BRACKET_SIZE_THRESHOLD ? 16 : top24FinalsPreview ? 16 : 8;

        const bracketStructure =
          result.data.length > 0
            ? bracketSize === 16
              ? generateBracketStructure(bracketSize, top24GroupCount)
              : generateBracketStructure(bracketSize)
            : (top24FinalsPreview?.bracketStructure ?? []);
        /* Pagination must not change routing status: an upstream completed
         * match can be on a different page from the receiving slot. */
        const allFinalsSlotMatches =
          result.data.length > 0
            ? await modelInstance.findMany({
                where: { tournamentId, stage: 'finals' },
                select: { matchNumber: true, round: true, completed: true, player1Id: true, player2Id: true },
                orderBy: { matchNumber: 'asc' },
              })
            : [];
        const seededPlayers =
          top24FinalsPreview?.seededPlayers ??
          (storedSeededPlayers.length > 0
            ? storedSeededPlayers
            : result.data.length > 0
              ? await buildStandardSeededPlayers(tournamentId, bracketSize, logger)
              : []);

        return createSuccessResponse({
          ...result,
          data: serializeFinalsSlots(
            result.data as unknown as SlotStatusMatch[],
            bracketStructure,
            allFinalsSlotMatches as unknown as SlotStatusMatch[],
          ),
          bracketStructure,
          bracketSize,
          roundNames,
          qualificationConfirmed: ((tournament as Record<string, unknown>)[modeField] as boolean) ?? false,
          phase,
          playoffMatches: serializedPlayoffMatches,
          playoffStructure,
          playoffSeededPlayers,
          playoffComplete,
          ...(seededPlayers.length > 0 ? { seededPlayers } : {}),
        });
      }

      /* Shared fetch for 'grouped' and 'simple' styles */
      const matches = await model(prisma).findMany({
        where: { tournamentId, stage: 'finals' },
        include: { player1: { select: PLAYER_PUBLIC_SELECT }, player2: { select: PLAYER_PUBLIC_SELECT } },
        orderBy: { matchNumber: 'asc' },
      });

      const bracketSize = matches.length > BRACKET_SIZE_THRESHOLD ? 16 : top24FinalsPreview ? 16 : 8;

      const bracketStructure =
        matches.length > 0
          ? bracketSize === 16
            ? generateBracketStructure(bracketSize, top24GroupCount)
            : generateBracketStructure(bracketSize)
          : (top24FinalsPreview?.bracketStructure ?? []);
      const seededPlayers =
        top24FinalsPreview?.seededPlayers ??
        (storedSeededPlayers.length > 0
          ? storedSeededPlayers
          : matches.length > 0
            ? await buildStandardSeededPlayers(tournamentId, bracketSize, logger)
            : []);
      const serializedMatches = serializeFinalsSlots(matches as unknown as SlotStatusMatch[], bracketStructure);

      if (config.getStyle === 'grouped') {
        const winnersMatches = serializedMatches.filter((m) => m.round?.startsWith('winners_') || false);
        const losersMatches = serializedMatches.filter((m) => m.round?.startsWith('losers_') || false);
        const grandFinalMatches = serializedMatches.filter((m) => m.round?.startsWith('grand_final') || false);

        return createSuccessResponse({
          matches: serializedMatches,
          winnersMatches,
          losersMatches,
          grandFinalMatches,
          playoffMatches: serializedPlayoffMatches,
          bracketStructure,
          bracketSize,
          roundNames,
          qualificationConfirmed: ((tournament as Record<string, unknown>)[modeField] as boolean) ?? false,
          playoffStructure,
          playoffSeededPlayers,
          playoffComplete,
          phase,
          ...(seededPlayers.length > 0 ? { seededPlayers } : {}),
        });
      }

      /* 'simple' style */
      return createSuccessResponse({
        matches: serializedMatches,
        bracketStructure,
        bracketSize,
        roundNames,
        qualificationConfirmed: ((tournament as Record<string, unknown>)[modeField] as boolean) ?? false,
        phase,
        playoffMatches: serializedPlayoffMatches,
        playoffStructure,
        playoffSeededPlayers,
        playoffComplete,
        ...(seededPlayers.length > 0 ? { seededPlayers } : {}),
      });
    } catch (error) {
      logger.error(config.getErrorMessage, { error, tournamentId });
      const archived = await readTournamentArchive(id);
      if (archived) {
        return createSuccessResponse(getArchivedFinalsPayload(archived, config.eventTypeCode, config.getStyle));
      }
      return createErrorResponse(config.getErrorMessage, 500, 'INTERNAL_ERROR');
    }
  }

  /**
   * POST handler: Create a double-elimination finals bracket from qualification standings.
   * Takes the top N players (default 8) and seeds them into the bracket.
   */
  async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const logger = createLogger(config.loggerName);

    /* Auth check for POST endpoint */
    if (config.postRequiresAuth) {
      const session = await auth();
      if (!session?.user || session.user.role !== 'admin') {
        return handleAuthzError();
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
      const { topN = 8, reset = false } = body;

      /* Hard reset: delete both playoff and finals rows so the admin can
       * start over from qualification. Triggered by a dedicated reset button
       * on the qualification page. */
      if (reset) {
        const modeField = getQualificationConfirmedField(config.eventTypeCode);
        const tournament = await prisma.tournament.findUnique({
          where: { id: tournamentId },
          select: {
            bmQualificationConfirmed: true,
            mrQualificationConfirmed: true,
            gpQualificationConfirmed: true,
          },
        });

        if (!tournament) {
          return createErrorResponse('Tournament not found', 404, 'NOT_FOUND');
        }
        if (tournament[modeField]) {
          return createErrorResponse('Cannot reset bracket while qualification is locked', 409, 'QUALIFICATION_LOCKED');
        }

        await model(prisma).deleteMany({
          where: { tournamentId, stage: { in: ['playoff', 'finals'] } },
        });
        await (prisma.tournament as unknown as { update: (args: unknown) => Promise<unknown> }).update({
          where: { id: tournamentId },
          data: { [getFinalsSeedSnapshotField(config.eventTypeCode)]: null },
        });
        return createSuccessResponse(
          {
            message: 'Bracket reset',
            phase: 'finals',
          },
          'Bracket reset',
        );
      }

      /* Supported bracket sizes:
       *   8  → 8-player double elimination
       *  16  → 16-player double elimination (§4.2)
       *  24  → 16-player Upper Bracket + 12-player Pre-Bracket Playoff (§4.2, issue #454).
       *        Two-phase: first POST call creates the playoff stage; a second
       *        call (once all playoff_r2 matches are complete) builds the
       *        Upper Bracket with the 4 playoff winners filling barrage slots. */
      if (topN !== 8 && topN !== 16 && topN !== 24) {
        return handleValidationError(
          'Only 8-player, 16-player, or 24-player (Top-16 + playoff) brackets are supported',
          'topN',
        );
      }

      if (topN === 24) {
        return handleTop24Post(model, qualModel, tournamentId, config);
      }

      const qualifications = await qualModel(prisma).findMany({
        where: { tournamentId },
        include: { player: { select: PLAYER_PUBLIC_SELECT } },
        orderBy: config.qualificationOrderBy,
      });

      const rankedQualifications = await applyFinalsQualificationRanks(model, tournamentId, qualifications);
      const finalsSeedQualifications = orderQualificationsForFinalsSeeding(rankedQualifications);
      const selectedQualifications = finalsSeedQualifications.slice(0, topN);
      const qualificationRankLabels = buildQualificationRankLabelMap(rankedQualifications);

      if (selectedQualifications.length < topN) {
        return handleValidationError(
          `Not enough players qualified. Need ${topN}, found ${selectedQualifications.length}`,
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

      const seededPlayers = selectedQualifications.map((q: { playerId: string; player: unknown }, index: number) => ({
        seed: index + 1,
        originalSeed: index + 1,
        playerId: q.playerId,
        player: q.player,
        qualificationRankLabel: qualificationRankLabels.get(q.playerId),
      }));

      await (prisma.tournament as unknown as { update: (args: unknown) => Promise<unknown> }).update({
        where: { id: tournamentId },
        data: { [getFinalsSeedSnapshotField(config.eventTypeCode)]: seededPlayers },
      });

      /*
       * Bulk-insert bracket matches (issue #420). Replaces a sequential
       * for-loop of N create() calls with a single createMany() — for an
       * 8-player bracket that's 17 round-trips collapsed into 1, and 31
       * for a 16-player bracket. createMany on D1 doesn't return the
       * inserted rows, so we re-fetch with includes after insertion to
       * preserve the existing response shape (player1/player2 relations).
       */
      const mrAssignments = config.assignMrCoursesByRound
        ? createMrRoundAssignments(bracketStructure, 'finals')
        : undefined;
      const gpAssignments = config.assignGpCupByRound
        ? createGpRoundAssignments(bracketStructure, 'finals')
        : undefined;
      const bmStartingCourses = config.assignBmStartingCourseByRound
        ? createBmRoundStartingCourses(bracketStructure)
        : undefined;

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
            player1Id: player1?.playerId ?? null,
            player2Id: player2?.playerId ?? null,
            completed: false,
            ...getRoundAssignmentData(bracketMatch.round, mrAssignments, gpAssignments, bmStartingCourses),
          },
        };
      });

      await model(prisma).createMany({ data: matchPlans.map((p) => p.data) });

      const insertedMatches = await model(prisma).findMany({
        where: { tournamentId, stage: 'finals' },
        include: { player1: { select: PLAYER_PUBLIC_SELECT }, player2: { select: PLAYER_PUBLIC_SELECT } },
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

      return createSuccessResponse(
        {
          message: 'Finals bracket created',
          matches: serializeFinalsSlots(createdMatches as unknown as SlotStatusMatch[], bracketStructure),
          seededPlayers,
          bracketStructure,
        },
        'Finals bracket created',
        { status: 201 },
      );
    } catch (error) {
      logger.error('Failed to create finals', { error, tournamentId });
      return createErrorResponse(config.postErrorMessage, 500, 'INTERNAL_ERROR');
    }
  }

  /**
   * Check whether all 4 playoff_r2 matches for a tournament are complete —
   * the readiness condition for Phase-2 POST that creates the Upper Bracket.
   */
  async function isPlayoffComplete(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    matchModel: (p: any) => any,
    tournamentId: string,
  ): Promise<boolean> {
    const r2Matches = await matchModel(prisma).findMany({
      where: { tournamentId, stage: 'playoff', round: 'playoff_r2' },
      select: { completed: true },
    });
    return r2Matches.length === 4 && r2Matches.every((m: { completed: boolean }) => m.completed);
  }

  /**
   * Handle POST with topN=24 — Top 16 bracket with Pre-Bracket Playoff (issue #454).
   *
   * Two-phase flow:
   *   Phase 1: No playoff matches exist → create 8 playoff matches (stage='playoff')
   *            from qualification positions 13-24. Return playoff structure.
   *   Phase 2: All 4 playoff_r2 matches complete → build 16-player Upper Bracket
   *            (stage='finals') using qual top 12 + 4 playoff winners in barrage slots.
   *
   * Intermediate state: Phase 2 call before playoff completes → 409 Conflict with
   * a remaining-matches hint so the caller knows why the transition is blocked.
   *
   * @returns Response with created matches for the current phase
   */
  async function handleTop24Post(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    matchModel: (p: any) => any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    qualificationModel: (p: any) => any,
    tournamentId: string,
    finalsConfig: FinalsConfig,
  ): Promise<NextResponse> {
    const logger = createLogger(finalsConfig.loggerName);

    try {
      /* Fetch ALL qualifiers (not just Top 24). Per issue #454 the direct/barrage
       * split is per-group (each group contributes perGroup=12/G direct and perGroup
       * barrage players), so we need every group's full ranking to pick Top-1..2*perGroup
       * from each. Caller's qualificationOrderBy is expected to put `group` first
       * (BM: [{ group: 'asc' }, { score: 'desc' }, ...]); within-group ordering by
       * score/points is preserved via stable insertion-order bucketing in
       * selectFinalsEntrantsByGroup. */
      const qualifications = (await qualificationModel(prisma).findMany({
        where: { tournamentId },
        include: { player: { select: PLAYER_PUBLIC_SELECT } },
        orderBy: finalsConfig.qualificationOrderBy,
      })) as Top24FinalsQualification[];

      if (qualifications.length < TOP24_QUALIFIER_COUNT) {
        return handleValidationError(
          `Not enough players qualified. Need ${TOP24_QUALIFIER_COUNT}, found ${qualifications.length}`,
          'qualifications',
        );
      }

      const rankedQualifications = await applyFinalsQualificationRanks(matchModel, tournamentId, qualifications);
      const qualificationRankLabels = buildQualificationRankLabelMap(rankedQualifications);

      /* Per-group Top-N selection with bracket seed assignment (#454).
       * For 2 groups, finals-group-selection applies the handwritten CDM
       * two-group layout instead of merging A/B into one qualification table.
       * Phase 1 and Phase 2 both re-derive the split; this relies on qualifications
       * being frozen between the two calls. If scores are edited after Phase 1
       * creates playoff rows, the Phase-2 direct/barrage computation can diverge
       * from what Phase 1 used — acceptable since the admin workflow freezes
       * qualification before finals. */
      let selection: ReturnType<typeof selectFinalsEntrantsByGroup<PublicFinalsPlayer | null>>;
      try {
        selection = selectFinalsEntrantsByGroup<PublicFinalsPlayer | null>(
          rankedQualifications as Top24FinalsQualification[],
        );
      } catch (err) {
        return handleValidationError(
          err instanceof Error ? err.message : 'Invalid group distribution',
          'qualifications',
        );
      }
      if (selection.groupCount > TOP24_SUPPORTED_GROUP_COUNT) {
        /* Only 2 and 3 groups are exposed at this API boundary
         * (docs/qualification-combined-ranking.md §7: 4+ groups are out of
         * scope for now) -- selectFinalsEntrantsByGroup() itself also
         * supports 4 groups and has dedicated tests for it, but nothing
         * upstream (UI, qualification-route.ts) can create a 4-group
         * tournament, so this gate rejects groupCount=4 the same as
         * groupCount>=5. */
        return handleValidationError(
          `Top-24 playoff currently supports at most ${TOP24_SUPPORTED_GROUP_COUNT} qualification groups; found ${selection.groupCount}`,
          'qualifications',
        );
      }

      const existingPlayoff = await matchModel(prisma).findMany({
        where: { tournamentId, stage: 'playoff' },
        /* Phase 2 turns completed playoff scores into Upper Bracket seeded
         * players. Stored player IDs are enough to choose the winner, but
         * seededPlayers also needs the public player payload returned to the UI;
         * include both relations here so getCompletedMatchWinner can validate and
         * carry the winner object forward. */
        include: { player1: { select: PLAYER_PUBLIC_SELECT }, player2: { select: PLAYER_PUBLIC_SELECT } },
        orderBy: { matchNumber: 'asc' },
      });
      const existingFinals = await matchModel(prisma).findMany({
        where: { tournamentId, stage: 'finals' },
      });

      /* --- PHASE 1: Create playoff matches ---
       * If finals already exist this is a reset: wipe both stages and
       * rebuild from scratch so barrage scores are cleared as well. */
      const isReset = existingFinals.length > 0;
      if (existingPlayoff.length === 0 || isReset) {
        if (isReset) {
          await matchModel(prisma).deleteMany({
            where: { tournamentId, stage: 'playoff' },
          });
          await matchModel(prisma).deleteMany({
            where: { tournamentId, stage: 'finals' },
          });
          await (prisma.tournament as unknown as { update: (args: unknown) => Promise<unknown> }).update({
            where: { id: tournamentId },
            data: { [getFinalsSeedSnapshotField(config.eventTypeCode)]: null },
          });
        }
        const playoffStructure = generatePlayoffStructure(PLAYOFF_ENTRANT_COUNT, selection.groupCount);
        const playoffMrAssignments = config.assignMrCoursesByRound
          ? createMrRoundAssignments(playoffStructure, 'playoff')
          : undefined;
        const playoffGpAssignments = config.assignGpCupByRound
          ? createGpRoundAssignments(playoffStructure, 'playoff')
          : undefined;
        const playoffBmStartingCourses = config.assignBmStartingCourseByRound
          ? createBmRoundStartingCourses(playoffStructure)
          : undefined;

        /* selection.barrageSeeds carries displayed slots 13-24 in the active
         * group-count layout, matching generatePlayoffStructure() directly. */
        const playoffSeededPlayers = selection.barrageSeeds.map(({ seed, qualification }) => ({
          seed,
          originalSeed: seed,
          playerId: qualification.playerId,
          player: qualification.player,
          qualificationRankLabel: qualificationRankLabels.get(qualification.playerId),
        }));
        const originalSeedSnapshot = [
          ...buildDirectSeededPlayers(selection.directSeeds, qualificationRankLabels, tournamentId, logger),
          ...playoffSeededPlayers,
        ];

        await (prisma.tournament as unknown as { update: (args: unknown) => Promise<unknown> }).update({
          where: { id: tournamentId },
          data: { [getFinalsSeedSnapshotField(config.eventTypeCode)]: originalSeedSnapshot },
        });

        /*
         * Bulk-insert playoff matches (#703). Replaces an 8-sequential-create
         * loop (~1.8 s on D1) with createMany + one findMany (~300 ms total).
         * player1/player2 are already resolved from in-memory playoffSeededPlayers,
         * so the per-row include used by the old loop is redundant.
         */
        const playoffMatchPlans = playoffStructure.map((bracketMatch) => {
          const player1 = bracketMatch.player1Seed
            ? playoffSeededPlayers.find((p: { seed: number }) => p.seed === bracketMatch.player1Seed)
            : null;
          const player2 = bracketMatch.player2Seed
            ? playoffSeededPlayers.find((p: { seed: number }) => p.seed === bracketMatch.player2Seed)
            : null;
          return {
            bracketMatch,
            player1,
            player2,
            data: {
              tournamentId,
              matchNumber: bracketMatch.matchNumber,
              stage: 'playoff',
              round: bracketMatch.round,
              /* Unknown R1 winners remain NULL until routing supplies the
               * actual qualifier; never temporarily place a real player. */
              player1Id: player1?.playerId ?? null,
              player2Id: player2?.playerId ?? null,
              completed: false,
              ...getRoundAssignmentData(
                bracketMatch.round,
                playoffMrAssignments,
                playoffGpAssignments,
                playoffBmStartingCourses,
              ),
            },
          };
        });

        await matchModel(prisma).createMany({ data: playoffMatchPlans.map((p) => p.data) });

        const insertedPlayoffMatches = await matchModel(prisma).findMany({
          where: { tournamentId, stage: 'playoff' },
          include: { player1: { select: PLAYER_PUBLIC_SELECT }, player2: { select: PLAYER_PUBLIC_SELECT } },
          orderBy: { matchNumber: 'asc' },
        });
        const insertedPlayoffByNumber = new Map(
          insertedPlayoffMatches.map((m: { matchNumber: number }) => [m.matchNumber, m]),
        );
        const createdPlayoffMatches = playoffMatchPlans
          .map((p) => {
            const match = insertedPlayoffByNumber.get(p.bracketMatch.matchNumber);
            if (!match) return null;
            return {
              ...match,
              hasPlayer1: !!p.player1,
              hasPlayer2: !!p.player2,
              player1Seed: p.bracketMatch.player1Seed,
              player2Seed: p.bracketMatch.player2Seed,
              advancesToUpperSeed: p.bracketMatch.advancesToUpperSeed,
            };
          })
          .filter((m): m is NonNullable<typeof m> => m !== null);

        return createSuccessResponse(
          {
            message: 'Playoff bracket created',
            phase: 'playoff',
            playoffMatches: serializeFinalsSlots(
              createdPlayoffMatches as unknown as SlotStatusMatch[],
              playoffStructure,
            ),
            playoffStructure,
            playoffSeededPlayers,
            /* Note: Upper Bracket seats 1-12 for qual top 12 are reserved; the
             * finals bracket will be created in Phase 2 after playoff completes. */
          },
          'Playoff bracket created',
          { status: 201 },
        );
      }

      /* --- PHASE 2: Build Upper Bracket once playoff is complete --- */
      const r2Matches = existingPlayoff.filter((m: { round?: string }) => m.round === 'playoff_r2');
      const incompleteR2 = r2Matches.filter((m: { completed: boolean }) => !m.completed);

      if (incompleteR2.length > 0) {
        return createErrorResponse(
          `Playoff not complete: ${incompleteR2.length} R2 match(es) remaining`,
          409,
          'PLAYOFF_INCOMPLETE',
        );
      }

      /* Derive each playoff winner and map to its advancesToUpperSeed target. */
      const playoffStructure = generatePlayoffStructure(PLAYOFF_ENTRANT_COUNT, selection.groupCount);
      const { resolvedWinners } = resolvePlayoffWinners(playoffStructure, r2Matches, {
        requireWinner: true,
        tournamentId,
        logger,
      });
      const upperSeedToPlayer = new Map(
        resolvedWinners.map(
          ({ upperSeed, winner }) =>
            [
              upperSeed,
              {
                playerId: winner.winnerId,
                player: winner.winnerPlayer,
                originalSeed: selection.barrageSeeds.find(
                  ({ qualification }) => qualification.playerId === winner.winnerId,
                )?.seed,
              },
            ] as const,
        ),
      );

      /* Build the 16 seeded players from the group-specific direct slots and
       * the playoff winners' advancesToUpperSeed destinations. */
      const directPlayers = buildDirectSeededPlayers(
        selection.directSeeds,
        qualificationRankLabels,
        tournamentId,
        logger,
      );
      const playoffUpperSeeds = playoffStructure
        .filter((m) => m.round === 'playoff_r2' && m.advancesToUpperSeed)
        .map((m) => m.advancesToUpperSeed as number);
      if (playoffUpperSeeds.length !== PLAYOFF_R2_UPPER_SEED_COUNT) {
        throw new Error(
          `Expected ${PLAYOFF_R2_UPPER_SEED_COUNT} playoff R2 upper seeds, got ${playoffUpperSeeds.length}`,
        );
      }
      const playoffWinnerSeeds = playoffUpperSeeds.map((upperSeed) => {
        const winner = upperSeedToPlayer.get(upperSeed);
        if (!winner) {
          throw new Error(`Playoff winner for Upper seed ${upperSeed} not resolved`);
        }
        return {
          seed: upperSeed,
          originalSeed: winner.originalSeed,
          playerId: winner.playerId,
          player: winner.player,
          qualificationRankLabel: qualificationRankLabels.get(winner.playerId),
        };
      });
      const seededPlayers = [...directPlayers, ...playoffWinnerSeeds];

      const bracketStructure = generateBracketStructure(16, selection.groupCount);
      const finalsMrAssignments = config.assignMrCoursesByRound
        ? createMrRoundAssignments(bracketStructure, 'finals')
        : undefined;
      const finalsGpAssignments = config.assignGpCupByRound
        ? createGpRoundAssignments(bracketStructure, 'finals')
        : undefined;
      const finalsBmStartingCourses = config.assignBmStartingCourseByRound
        ? createBmRoundStartingCourses(bracketStructure)
        : undefined;

      /* Clean slate on any previous finals for reset scenarios.
       * Keep playoff stage rows intact so the admin can still view the
       * playoff (barrage) results after the Upper Bracket is created.
       * The UI switches via a tab instead of relying on phase deletion. */
      await matchModel(prisma).deleteMany({
        where: { tournamentId, stage: 'finals' },
      });

      /*
       * Bulk-insert finals matches (#703). Same pattern as the topN=8/16 path
       * (createMany + findMany) — collapses 16 sequential creates (~3.7 s on D1)
       * into 2 round-trips (~300 ms). Player objects are already in-memory from
       * seededPlayers, so the per-row include is redundant.
       */
      const finalsMatchPlans = bracketStructure.map((bracketMatch) => {
        const player1 = bracketMatch.player1Seed
          ? seededPlayers.find((p) => p.seed === bracketMatch.player1Seed)
          : null;
        const player2 = bracketMatch.player2Seed
          ? seededPlayers.find((p) => p.seed === bracketMatch.player2Seed)
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
            player1Id: player1?.playerId ?? null,
            player2Id: player2?.playerId ?? null,
            completed: false,
            ...getRoundAssignmentData(
              bracketMatch.round,
              finalsMrAssignments,
              finalsGpAssignments,
              finalsBmStartingCourses,
            ),
          },
        };
      });

      await matchModel(prisma).createMany({ data: finalsMatchPlans.map((p) => p.data) });

      const insertedFinalsMatches = await matchModel(prisma).findMany({
        where: { tournamentId, stage: 'finals' },
        include: { player1: { select: PLAYER_PUBLIC_SELECT }, player2: { select: PLAYER_PUBLIC_SELECT } },
        orderBy: { matchNumber: 'asc' },
      });
      const insertedFinalsByNumber = new Map(
        insertedFinalsMatches.map((m: { matchNumber: number }) => [m.matchNumber, m]),
      );
      const createdMatches = finalsMatchPlans
        .map((p) => {
          const match = insertedFinalsByNumber.get(p.bracketMatch.matchNumber);
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

      return createSuccessResponse(
        {
          message: 'Finals bracket created from playoff results',
          phase: 'finals',
          matches: serializeFinalsSlots(createdMatches as unknown as SlotStatusMatch[], bracketStructure),
          seededPlayers,
          bracketStructure,
        },
        'Finals bracket created',
        { status: 201 },
      );
    } catch (error) {
      logger.error('Failed to create Top-24 finals', { error, tournamentId });
      return createErrorResponse(finalsConfig.postErrorMessage, 500, 'INTERNAL_ERROR');
    }
  }

  /**
   * PUT handler: Update a finals match result and advance players through the bracket.
   * Handles winner/loser advancement, grand final reset logic, and tournament completion.
   */
  async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const logger = createLogger(config.loggerName);

    /* Auth check for PUT endpoint */
    if (config.putRequiresAuth) {
      const session = await auth();
      if (!session?.user || session.user.role !== 'admin') {
        return handleAuthzError();
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
      const { matchId } = body;
      let { score1, score2 } = body;

      if (!matchId || ((score1 === undefined || score2 === undefined) && body.cupResults === undefined)) {
        return handleValidationError('matchId and score data are required', 'request');
      }

      const match = await model(prisma).findUnique({
        where: { id: matchId, tournamentId },
        include: { player1: { select: PLAYER_PUBLIC_SELECT }, player2: { select: PLAYER_PUBLIC_SELECT } },
      });

      if (!match) {
        return createErrorResponse('Finals match not found', 404, 'NOT_FOUND');
      }

      /* Defensive: reject non-finals/non-playoff stage to prevent cross-stage
       * bracket mutation. Qualification matches should never trigger bracket
       * advancement logic; playoff matches use their own advancement path below. */
      if (match.stage !== 'finals' && match.stage !== 'playoff') {
        return createErrorResponse('Finals match not found', 404, 'NOT_FOUND');
      }

      /* An unresolved knockout slot has no competitor yet. Reject before any
       * score write so an API caller cannot complete an empty card (#3036). */
      if (!match.player1Id || !match.player2Id || !match.player1 || !match.player2) {
        return createErrorResponse(
          'Cannot score a match while one or more bracket slots are TBD',
          409,
          'MATCH_SLOTS_UNRESOLVED',
        );
      }

      let winnerId: string | undefined;
      let loserId: string | undefined;
      let matchCompleted = true;
      let resolvedUpdateData: Record<string, unknown> = {};

      if (config.resolveMatchResult) {
        const resolved = config.resolveMatchResult(
          match as Record<string, unknown>,
          score1,
          score2,
          body as Record<string, unknown>,
        );

        if ('error' in resolved) {
          return handleValidationError(resolved.error, resolved.field ?? 'score');
        }

        winnerId = resolved.winnerId;
        loserId = resolved.loserId;
        matchCompleted = resolved.completed ?? true;
        resolvedUpdateData = resolved.updateData ?? {};
        if (typeof resolvedUpdateData[config.putScoreFields.dbField1] === 'number') {
          score1 = resolvedUpdateData[config.putScoreFields.dbField1];
        }
        if (typeof resolvedUpdateData[config.putScoreFields.dbField2] === 'number') {
          score2 = resolvedUpdateData[config.putScoreFields.dbField2];
        }
      } else {
        const targetWins = config.getTargetWins?.(match) ?? config.targetWins ?? 3;
        const player1ReachedTarget = score1 === targetWins && score2 < targetWins;
        const player2ReachedTarget = score2 === targetWins && score1 < targetWins;

        if (player1ReachedTarget === player2ReachedTarget) {
          return handleValidationError(`Match must have a winner (first to ${targetWins})`, 'score');
        }

        winnerId = player1ReachedTarget ? match.player1Id : match.player2Id;
        loserId = player1ReachedTarget ? match.player2Id : match.player1Id;
      }

      /* Build update data with configurable score field names */
      const updateData: Record<string, unknown> = {
        ...resolvedUpdateData,
        [config.putScoreFields.dbField1]: score1,
        [config.putScoreFields.dbField2]: score2,
        completed: matchCompleted,
      };

      if (config.putAdditionalFields) {
        /* Validate tvNumber if present: must be an integer 1-MAX_TV_NUMBER or null/undefined to clear. */
        if (body.tvNumber !== undefined && body.tvNumber !== null) {
          const tv = body.tvNumber;
          if (!Number.isInteger(tv) || tv < 1 || tv > MAX_TV_NUMBER) {
            return handleValidationError(`tvNumber must be 1–${MAX_TV_NUMBER}`, 'tvNumber');
          }
          /* Uniqueness guard: prevent the same TV number in the same round (issue #668). */
          const tvConflict = await model(prisma).findFirst({
            where: {
              tournamentId,
              stage: match.stage,
              round: match.round,
              tvNumber: tv,
              id: { not: matchId },
            },
          });
          if (tvConflict) {
            return handleValidationError(
              `TV${tv} is already assigned to match ${tvConflict.matchNumber} in this round`,
              'tvNumber',
            );
          }
        }
        /* Validate startingCourseNumber when present: must be 1-4 or null. */
        if (body.startingCourseNumber !== undefined && body.startingCourseNumber !== null) {
          const sn = body.startingCourseNumber;
          if (!Number.isInteger(sn) || sn < 1 || sn > 4) {
            return handleValidationError('startingCourseNumber must be 1–4', 'startingCourseNumber');
          }
        }
        for (const field of config.putAdditionalFields) {
          if (body[field] !== undefined) {
            updateData[field] = body[field] || null;
          }
        }
      }

      const updatedMatch = await model(prisma).update({
        where: { id: matchId },
        data: updateData,
        include: { player1: { select: PLAYER_PUBLIC_SELECT }, player2: { select: PLAYER_PUBLIC_SELECT } },
      });

      /* --- Playoff advancement path (issue #454) ---
       * Playoff matches are a separate stage; only playoff_r1 winners advance
       * within the playoff (to playoff_r2 as player 2). playoff_r2 winners
       * stay in the playoff stage — the Upper Bracket is materialised later
       * via a Phase-2 POST that reads completed playoff results. */
      if (match.stage === 'playoff') {
        if (!matchCompleted) {
          return createSuccessResponse({
            match: updatedMatch,
            winnerId: null,
            loserId: null,
            stage: 'playoff',
            playoffComplete: await isPlayoffComplete(model, tournamentId),
          });
        }

        if (!winnerId || !loserId) {
          return handleValidationError('Completed match must have a winner and loser', 'score');
        }

        const playoffStructure = generatePlayoffStructure(PLAYOFF_ENTRANT_COUNT);
        const matchNumber = Number(match.matchNumber ?? updatedMatch.matchNumber);
        const currentPlayoff = playoffStructure.find((b) => b.matchNumber === matchNumber);

        if (currentPlayoff?.winnerGoesTo) {
          const position = currentPlayoff.position || 1;
          await applySlotWrite(
            model(prisma),
            { tournamentId, stage: 'playoff', matchNumber: currentPlayoff.winnerGoesTo },
            position === 1 ? { player1Id: winnerId } : { player2Id: winnerId },
          );
        }

        return createSuccessResponse({
          match: updatedMatch,
          winnerId,
          loserId,
          stage: 'playoff',
          /* Signal whether all playoff_r2 matches are complete so clients can
           * prompt the admin to trigger Phase-2 POST (finals bracket creation). */
          playoffComplete: await isPlayoffComplete(model, tournamentId),
        });
      }

      /* Infer bracket size from total finals match count:
       * 8-player bracket = 17 matches, 16-player bracket = 31 matches.
       * Threshold of 20 distinguishes between the two (>20 means 16-player).
       * This ensures correct bracket routing for both sizes in PUT handler. */
      const totalFinalsMatches = await model(prisma).count({
        where: { tournamentId, stage: 'finals' },
      });
      const bracketSize = totalFinalsMatches > BRACKET_SIZE_THRESHOLD ? 16 : 8;

      /* Warn when match count is in the ambiguous zone (17-20) where playoff
       * stage may have added extra matches that make inference unreliable.
       * This helps admins identify bracket routing anomalies. */
      const EIGHT_PLAYER_EXPECTED = 17;
      const SIXTEEN_PLAYER_EXPECTED = 31;
      const isAmbiguousCount =
        totalFinalsMatches > EIGHT_PLAYER_EXPECTED && totalFinalsMatches <= BRACKET_SIZE_THRESHOLD;
      const isUnexpectedCount =
        totalFinalsMatches !== EIGHT_PLAYER_EXPECTED && totalFinalsMatches !== SIXTEEN_PLAYER_EXPECTED;
      if (isAmbiguousCount || isUnexpectedCount) {
        logger.warn('Bracket size inference may be unreliable', {
          tournamentId,
          totalFinalsMatches,
          inferredBracketSize: bracketSize,
          expectedFor8Player: EIGHT_PLAYER_EXPECTED,
          expectedFor16Player: SIXTEEN_PLAYER_EXPECTED,
          isAmbiguous: isAmbiguousCount,
          isUnexpected: isUnexpectedCount,
        });
      }

      /* Bracket progression: advance winner and loser to next matches */
      const bracketStructure = generateBracketStructure(bracketSize);
      const matchNumber = Number(match.matchNumber ?? updatedMatch.matchNumber);
      const currentBracketMatch = bracketStructure.find((b) => b.matchNumber === matchNumber);

      if (!currentBracketMatch) {
        return createSuccessResponse({ match: updatedMatch });
      }

      if (!matchCompleted) {
        return createSuccessResponse({
          match: updatedMatch,
          winnerId: null,
          loserId: null,
          isComplete: false,
          champion: null,
        });
      }

      if (!winnerId || !loserId) {
        return handleValidationError('Completed match must have a winner and loser', 'score');
      }

      /* Advancement writes go through applySlotWrite's `completed: false` guard
       * (issue #3017 §6), so a downstream match that's already been scored
       * silently keeps its existing slots instead of being clobbered. Surface
       * every such skip here — via a warn log immediately and via this
       * response field for the client — so a mis-scored-card correction
       * (PUT re-send after fixing a wrong result) doesn't leave stale
       * downstream placements unnoticed. */
      const advancementWarnings: Array<{ matchNumber: number; slot: 1 | 2; playerId: string; reason: string }> = [];
      const recordSkippedAdvancement = (targetMatchNumber: number, slot: 1 | 2, playerId: string) => {
        advancementWarnings.push({
          matchNumber: targetMatchNumber,
          slot,
          playerId,
          reason: 'DOWNSTREAM_MATCH_COMPLETED',
        });
        logger.warn('Skipped bracket advancement: downstream match already completed', {
          tournamentId,
          sourceMatchNumber: currentBracketMatch.matchNumber,
          targetMatchNumber,
          slot,
        });
      };

      const updateRoutedMatch = async (targetMatchNumber: number, position: 1 | 2, playerId: string) => {
        try {
          await applySlotWrite(
            model(prisma),
            { tournamentId, matchNumber: targetMatchNumber, stage: 'finals' },
            position === 1 ? { player1Id: playerId } : { player2Id: playerId },
          );
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
          const affected = await applySlotWrite(
            model(prisma),
            { id: nextWinnerMatch.id },
            position === 1 ? { player1Id: winnerId } : { player2Id: winnerId },
          );
          if (affected === 0) {
            recordSkippedAdvancement(currentBracketMatch.winnerGoesTo, position, winnerId);
          } else {
            logAutoAdvanceOverrideIfNeeded(nextWinnerMatch, 'FinalsMatch', nextWinnerMatch.id, {
              matchNumber: currentBracketMatch.winnerGoesTo,
              slot: position,
              sourceMatchNumber: currentBracketMatch.matchNumber,
            });
          }
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

        const loserPosition = currentBracketMatch.loserPosition ?? 1;

        if (nextLoserMatch) {
          const affected = await applySlotWrite(
            model(prisma),
            { id: nextLoserMatch.id },
            loserPosition === 1 ? { player1Id: loserId } : { player2Id: loserId },
          );
          if (affected === 0) {
            recordSkippedAdvancement(currentBracketMatch.loserGoesTo, loserPosition, loserId);
          } else {
            logAutoAdvanceOverrideIfNeeded(nextLoserMatch, 'FinalsMatch', nextLoserMatch.id, {
              matchNumber: currentBracketMatch.loserGoesTo,
              slot: loserPosition,
              sourceMatchNumber: currentBracketMatch.matchNumber,
            });
          }
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

          const resetSlotData = { player1Id: winnerId, player2Id: loserId };

          if (resetMatch) {
            const affected = await applySlotWrite(model(prisma), { id: resetMatch.id }, resetSlotData);
            if (affected === 0) {
              recordSkippedAdvancement(resetMatch.matchNumber, 1, winnerId);
              recordSkippedAdvancement(resetMatch.matchNumber, 2, loserId);
            } else {
              logAutoAdvanceOverrideIfNeeded(resetMatch, 'FinalsMatch', resetMatch.id, {
                round: 'grand_final_reset',
                sourceMatchNumber: currentBracketMatch.matchNumber,
              });
            }
          } else {
            await applySlotWrite(
              model(prisma),
              { tournamentId, stage: 'finals', round: 'grand_final_reset' },
              resetSlotData,
            );
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
        ...(advancementWarnings.length > 0 ? { advancementWarnings } : {}),
      });
    } catch (error) {
      logger.error('Failed to update finals match', { error, tournamentId });
      return createErrorResponse('Failed to update match', 500, 'INTERNAL_ERROR');
    }
  }

  /**
   * Handles the `slotEdit` branch of PATCH: manual bracket slot placement
   * adjustment (issue #3017). Three mutually exclusive operations:
   *   - `assign`: replace one slot's player with another qualification participant.
   *   - `swap`: swap the two slots of the same match.
   *   - `swapSlots`: swap one slot each between two different matches in the
   *     same round, atomically via `applySwapSlotsWrite`.
   *
   * `existing` is the already-fetched, already-IDOR-checked row for
   * `matchId` (fetched once by PATCH before dispatching here).
   */
  async function handleSlotEdit(
    tournamentId: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    existing: any,
    slotEditInput: unknown,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    session: any,
    request: NextRequest,
    logger: ReturnType<typeof createLogger>,
  ): Promise<Response> {
    if (!slotEditInput || typeof slotEditInput !== 'object') {
      return handleValidationError('slotEdit must be an object', 'slotEdit');
    }
    const body = slotEditInput as Record<string, unknown>;
    const op = body.op;
    if (op !== 'assign' && op !== 'swap' && op !== 'swapSlots') {
      return handleValidationError("slotEdit.op must be 'assign', 'swap', or 'swapSlots'", 'slotEdit.op');
    }

    const isNonNegativeInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0;
    if (!isNonNegativeInt(body.expectedVersion)) {
      return handleValidationError(
        'slotEdit.expectedVersion must be a non-negative integer',
        'slotEdit.expectedVersion',
      );
    }
    const expectedVersion = body.expectedVersion;

    /* Shared state guards, checked against the already-fetched row before
     * any write is attempted. The write itself re-checks completed/version
     * (via applySlotWrite's WHERE clause) to close the race against a
     * concurrent write landing between this check and the write. */
    if (existing.completed) {
      return createErrorResponse('Cannot edit a completed match', 409, 'MATCH_COMPLETED');
    }
    if (existing.isBye) {
      return createErrorResponse('Cannot edit a BYE match', 422, 'BYE_MATCH');
    }
    if (existing.version !== expectedVersion) {
      return createErrorResponse('Match has been modified since it was loaded', 409, 'VERSION_CONFLICT', {
        currentVersion: existing.version,
      });
    }

    /* Bracket structure for the TBD guard: finals infers bracket size the
     * same way PUT does (17 vs 31 total finals matches); playoff always
     * uses the fixed 12-entrant structure (matches PUT's playoff branch).
     * Both branches must pass the same top24GroupCount the GET response used
     * to render the bracket, or the TBD guard here can disagree with what
     * the admin sees as "confirmed" on screen (playoff support, issue #3017). */
    const stage: 'finals' | 'playoff' = existing.stage;
    const finalsBracketSize =
      stage === 'finals'
        ? (await model(prisma).count({ where: { tournamentId, stage: 'finals' } })) > BRACKET_SIZE_THRESHOLD
          ? 16
          : 8
        : null;
    /* Only detect the Top24 group count when it can actually change the
     * seed→slot map: every playoff-stage match came from the Top24 flow,
     * and generateBracketStructure() only branches on groupCount for the
     * 16-bracket case (8-bracket ignores the argument entirely). Skipping
     * the qualification-group query for the common Top8 case avoids an
     * unnecessary lookup on every slotEdit PATCH. */
    const top24GroupCount =
      stage === 'playoff' || finalsBracketSize === 16 ? await detectTop24GroupCount(tournamentId) : 3;
    const bracketStructure =
      stage === 'playoff'
        ? generatePlayoffStructure(PLAYOFF_ENTRANT_COUNT, top24GroupCount)
        : generateBracketStructure(finalsBracketSize as 8 | 16, top24GroupCount);

    const stageMatches: SlotEditMatch[] = await model(prisma).findMany({
      where: { tournamentId, stage },
      select: {
        id: true,
        matchNumber: true,
        round: true,
        completed: true,
        isBye: true,
        player1Id: true,
        player2Id: true,
      },
    });

    const adminUserId = session?.user?.id as string | undefined;
    const slotOverride: SlotOverrideStamp = { by: adminUserId ?? 'unknown', at: new Date() };
    const ipAddress = getClientIdentifier(request);
    const userAgent = request.headers.get('user-agent') || 'unknown';

    const logSlotEditAudit = (details: Record<string, unknown>) => {
      createAuditLog({
        userId: resolveAuditUserId(session),
        ipAddress,
        userAgent,
        action: AUDIT_ACTIONS.OVERRIDE_FINALS_SLOT,
        targetType: stage === 'playoff' ? 'PlayoffMatch' : 'FinalsMatch',
        targetId: existing.id,
        details: { eventType: config.eventTypeCode, stage, ...details },
      }).catch(() => {
        /* fail-silent: audit logging must never block the response (matches AUDIT_ACTIONS convention) */
      });
    };

    const matchIncludes = { player1: { select: PLAYER_PUBLIC_SELECT }, player2: { select: PLAYER_PUBLIC_SELECT } };

    if (op === 'swap') {
      const matchNumber = existing.matchNumber;
      if (
        !isFinalsSlotConfirmed(matchNumber, 1, stageMatches, bracketStructure) ||
        !isFinalsSlotConfirmed(matchNumber, 2, stageMatches, bracketStructure)
      ) {
        return createErrorResponse(
          'Cannot swap a slot that has not been confirmed by bracket progress (TBD)',
          422,
          'SLOT_TBD',
        );
      }

      const affected = await applySlotWrite(
        model(prisma),
        { id: existing.id },
        { player1Id: existing.player2Id, player2Id: existing.player1Id },
        { expectedVersion, slotOverride },
      );
      if (affected === 0) {
        const latest = await model(prisma).findUnique({ where: { id: existing.id } });
        return createErrorResponse('Match has been modified since it was loaded', 409, 'VERSION_CONFLICT', {
          currentVersion: latest?.version,
        });
      }

      logSlotEditAudit({
        op: 'swap',
        matchNumber,
        beforePlayer1Id: existing.player1Id,
        beforePlayer2Id: existing.player2Id,
        afterPlayer1Id: existing.player2Id,
        afterPlayer2Id: existing.player1Id,
      });

      const match = await model(prisma).findUnique({ where: { id: existing.id }, include: matchIncludes });
      return createSuccessResponse({ match, newVersion: expectedVersion + 1 });
    }

    if (op === 'assign') {
      const slot = body.slot;
      if (slot !== 1 && slot !== 2) {
        return handleValidationError('slotEdit.slot must be 1 or 2', 'slotEdit.slot');
      }
      const playerId = body.playerId;
      if (typeof playerId !== 'string' || !playerId) {
        return handleValidationError('slotEdit.playerId is required', 'slotEdit.playerId');
      }

      const matchNumber = existing.matchNumber;
      if (!isFinalsSlotConfirmed(matchNumber, slot, stageMatches, bracketStructure)) {
        return createErrorResponse(
          'Cannot edit a slot that has not been confirmed by bracket progress (TBD)',
          422,
          'SLOT_TBD',
        );
      }

      const participant = await qualModel(prisma).findFirst({ where: { tournamentId, playerId } });
      if (!participant) {
        return handleValidationError(
          'playerId is not a qualification participant for this tournament',
          'slotEdit.playerId',
        );
      }

      const conflict = findDuplicatePlacementConflict(playerId, matchNumber, slot, stageMatches, bracketStructure);
      if (conflict) {
        return createErrorResponse(
          `Player is already placed in match ${conflict.matchNumber}`,
          409,
          'DUPLICATE_PLACEMENT',
          { matchNumber: conflict.matchNumber },
        );
      }

      const beforePlayerId = slot === 1 ? existing.player1Id : existing.player2Id;
      const affected = await applySlotWrite(
        model(prisma),
        { id: existing.id },
        slot === 1 ? { player1Id: playerId } : { player2Id: playerId },
        { expectedVersion, slotOverride },
      );
      if (affected === 0) {
        const latest = await model(prisma).findUnique({ where: { id: existing.id } });
        return createErrorResponse('Match has been modified since it was loaded', 409, 'VERSION_CONFLICT', {
          currentVersion: latest?.version,
        });
      }

      logSlotEditAudit({ op: 'assign', matchNumber, slot, beforePlayerId, afterPlayerId: playerId });

      /* Post-write duplicate-placement re-check. The pre-write check above
       * (findDuplicatePlacementConflict against `stageMatches`, fetched at
       * the top of this handler) is read-then-write: two near-simultaneous
       * assign requests placing the same player into different matches can
       * both pass it before either write lands. A DB-level guard can't
       * safely close this — see the comment on findDuplicatePlacementConflict
       * for why a raw-SQL NOT EXISTS check would misfire on placeholder IDs.
       * So instead we detect the race after the fact: re-read the stage
       * fresh and re-run the same check. Losing this race doesn't corrupt
       * anything (both writes individually succeeded and are each valid
       * optimistic-lock updates), but it does leave two matches pointing at
       * the same player, so surface it the same way an automatic-advancement
       * skip is surfaced (issue #3017 §6) rather than staying silent. */
      const freshStageMatches: SlotEditMatch[] = await model(prisma).findMany({
        where: { tournamentId, stage },
        select: {
          id: true,
          matchNumber: true,
          round: true,
          completed: true,
          isBye: true,
          player1Id: true,
          player2Id: true,
        },
      });
      const postWriteConflict = findDuplicatePlacementConflict(
        playerId,
        matchNumber,
        slot,
        freshStageMatches,
        bracketStructure,
      );
      if (postWriteConflict) {
        logger.warn('Duplicate placement detected after assign write (concurrent slotEdit race)', {
          tournamentId,
          matchNumber,
          slot,
          playerId,
          conflictMatchNumber: postWriteConflict.matchNumber,
        });
      }

      const match = await model(prisma).findUnique({ where: { id: existing.id }, include: matchIncludes });
      return createSuccessResponse({
        match,
        newVersion: expectedVersion + 1,
        ...(postWriteConflict ? { duplicatePlacementWarning: { matchNumber: postWriteConflict.matchNumber } } : {}),
      });
    }

    /* op === 'swapSlots': atomic cross-match slot exchange, same round only. */
    const slot = body.slot;
    if (slot !== 1 && slot !== 2) {
      return handleValidationError('slotEdit.slot must be 1 or 2', 'slotEdit.slot');
    }
    const targetMatchId = body.targetMatchId;
    if (typeof targetMatchId !== 'string' || !targetMatchId) {
      return handleValidationError('slotEdit.targetMatchId is required', 'slotEdit.targetMatchId');
    }
    const targetSlot = body.targetSlot;
    if (targetSlot !== 1 && targetSlot !== 2) {
      return handleValidationError('slotEdit.targetSlot must be 1 or 2', 'slotEdit.targetSlot');
    }
    if (!isNonNegativeInt(body.targetExpectedVersion)) {
      return handleValidationError(
        'slotEdit.targetExpectedVersion must be a non-negative integer',
        'slotEdit.targetExpectedVersion',
      );
    }
    const targetExpectedVersion = body.targetExpectedVersion;

    if (targetMatchId === existing.id) {
      return handleValidationError(
        'swapSlots requires two different matches; use "swap" for the same match',
        'slotEdit.targetMatchId',
      );
    }

    const targetExisting = await model(prisma).findFirst({ where: { id: targetMatchId, tournamentId } });
    if (!targetExisting) {
      return createErrorResponse('Finals match not found', 404, 'NOT_FOUND');
    }
    if (targetExisting.stage !== 'finals' && targetExisting.stage !== 'playoff') {
      return createErrorResponse('Finals match not found', 404, 'NOT_FOUND');
    }
    if (existing.round !== targetExisting.round) {
      return createErrorResponse('swapSlots is only allowed between matches in the same round', 400, 'ROUND_MISMATCH');
    }
    if (targetExisting.completed) {
      return createErrorResponse('Cannot edit a completed match', 409, 'MATCH_COMPLETED');
    }
    if (targetExisting.isBye) {
      return createErrorResponse('Cannot edit a BYE match', 422, 'BYE_MATCH');
    }
    if (targetExisting.version !== targetExpectedVersion) {
      return createErrorResponse('Match has been modified since it was loaded', 409, 'VERSION_CONFLICT', {
        currentVersion: targetExisting.version,
      });
    }

    const matchNumber = existing.matchNumber;
    const targetMatchNumber = targetExisting.matchNumber;
    if (
      !isFinalsSlotConfirmed(matchNumber, slot, stageMatches, bracketStructure) ||
      !isFinalsSlotConfirmed(targetMatchNumber, targetSlot, stageMatches, bracketStructure)
    ) {
      return createErrorResponse(
        'Cannot edit a slot that has not been confirmed by bracket progress (TBD)',
        422,
        'SLOT_TBD',
      );
    }

    const existingSlotValue = slot === 1 ? existing.player1Id : existing.player2Id;
    const targetSlotValue = targetSlot === 1 ? targetExisting.player1Id : targetExisting.player2Id;
    const newExistingPlayer1 = slot === 1 ? targetSlotValue : existing.player1Id;
    const newExistingPlayer2 = slot === 2 ? targetSlotValue : existing.player2Id;
    const newTargetPlayer1 = targetSlot === 1 ? existingSlotValue : targetExisting.player1Id;
    const newTargetPlayer2 = targetSlot === 2 ? existingSlotValue : targetExisting.player2Id;

    const tableName = SLOT_SWAP_TABLE_NAME[config.matchModel];
    if (!tableName) {
      logger.error('swapSlots: no static table name mapped for matchModel', { matchModel: config.matchModel });
      return createErrorResponse('Failed to update match', 500, 'INTERNAL_ERROR');
    }

    const affected = await applySwapSlotsWrite(tableName, {
      tournamentId,
      round: existing.round,
      idA: existing.id,
      versionA: expectedVersion,
      newPlayer1A: newExistingPlayer1,
      newPlayer2A: newExistingPlayer2,
      idB: targetExisting.id,
      versionB: targetExpectedVersion,
      newPlayer1B: newTargetPlayer1,
      newPlayer2B: newTargetPlayer2,
      slotOverride,
    });

    if (affected === 0) {
      const [latestA, latestB] = await Promise.all([
        model(prisma).findUnique({ where: { id: existing.id } }),
        model(prisma).findUnique({ where: { id: targetExisting.id } }),
      ]);
      return createErrorResponse('Match has been modified since it was loaded', 409, 'VERSION_CONFLICT', {
        currentVersion: latestA?.version,
        targetCurrentVersion: latestB?.version,
      });
    }
    if (affected !== 2) {
      logger.error('swapSlots: unexpected affected row count (invariant violation)', {
        affected,
        tournamentId,
        matchId: existing.id,
        targetMatchId: targetExisting.id,
      });
      return createErrorResponse('Failed to update match', 500, 'INTERNAL_ERROR');
    }

    logSlotEditAudit({
      op: 'swapSlots',
      changes: [
        { matchNumber, slot, beforePlayerId: existingSlotValue, afterPlayerId: targetSlotValue },
        {
          matchNumber: targetMatchNumber,
          slot: targetSlot,
          beforePlayerId: targetSlotValue,
          afterPlayerId: existingSlotValue,
        },
      ],
    });

    const [matchA, matchB] = await Promise.all([
      model(prisma).findUnique({ where: { id: existing.id }, include: matchIncludes }),
      model(prisma).findUnique({ where: { id: targetExisting.id }, include: matchIncludes }),
    ]);
    return createSuccessResponse({ matches: [matchA, matchB] });
  }

  /**
   * PATCH handler: Assign or clear the broadcast TV stream number for a
   * finals/playoff match without touching scores or bracket advancement.
   *
   * Lets admins set the TV# directly from the bracket card (issue: instant
   * "select-to-save" UX). Mirrors the qualification-route PATCH path so the
   * client contract is identical: `{ matchId, tvNumber }` where `tvNumber`
   * is `1..MAX_TV_NUMBER` or `null` to clear.
   *
   * Score updates and winner advancement remain on PUT — splitting the
   * concern keeps PUT's much heavier validation/advancement out of the path
   * for this lightweight admin tweak.
   */
  async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const logger = createLogger(config.loggerName);

    const session = await auth();
    if (!session?.user || session.user.role !== 'admin') {
      return handleAuthzError();
    }

    const patchClientIp = getClientIdentifier(request);
    const patchRateResult = await checkRateLimit('general', patchClientIp);
    if (!patchRateResult.success) {
      return handleRateLimitError(patchRateResult.retryAfter);
    }

    const { id } = await params;
    const tournamentId = await resolveTournamentId(id);

    try {
      const body = sanitizeInput(await request.json());
      const { matchId, tvNumber, startingCourseNumber, slotEdit } = body;

      if (!matchId || typeof matchId !== 'string') {
        return handleValidationError('matchId is required', 'matchId');
      }

      /* PATCH supports three field types: tvNumber (broadcast slot),
       * startingCourseNumber (BM start course), and slotEdit (manual bracket
       * placement adjustment, issue #3017). Exactly one "kind" of edit must
       * be supplied — slotEdit is a heavier, differently-validated write
       * path and must not be combined with the other two in one request. */
      const hasTv = tvNumber !== undefined;
      const hasCourse = startingCourseNumber !== undefined;
      const hasSlotEdit = slotEdit !== undefined && slotEdit !== null;
      if (!hasTv && !hasCourse && !hasSlotEdit) {
        return handleValidationError('tvNumber, startingCourseNumber, or slotEdit is required', 'body');
      }
      if (hasSlotEdit && (hasTv || hasCourse)) {
        return handleValidationError('slotEdit cannot be combined with tvNumber or startingCourseNumber', 'slotEdit');
      }

      if (
        hasTv &&
        tvNumber !== null &&
        (typeof tvNumber !== 'number' || !Number.isInteger(tvNumber) || tvNumber < 1 || tvNumber > MAX_TV_NUMBER)
      ) {
        return handleValidationError(`tvNumber must be an integer between 1 and ${MAX_TV_NUMBER}, or null`, 'tvNumber');
      }

      /* startingCourseNumber must be 1–4 (battle courses) or null to clear.
       * Only meaningful for BM finals (config.assignBmStartingCourseByRound)
       * but accepting it on every finals PATCH keeps the route generic — MR/GP
       * brackets simply never expose a UI to send this field. */
      if (
        hasCourse &&
        startingCourseNumber !== null &&
        (typeof startingCourseNumber !== 'number' ||
          !Number.isInteger(startingCourseNumber) ||
          startingCourseNumber < 1 ||
          startingCourseNumber > 4)
      ) {
        return handleValidationError(
          'startingCourseNumber must be an integer between 1 and 4, or null',
          'startingCourseNumber',
        );
      }

      /* IDOR guard: confirm match exists in this tournament before update.
       * Restricted to finals/playoff stage so this PATCH cannot be used
       * to mutate qualification matches via the wrong endpoint. */
      const existing = await model(prisma).findFirst({
        where: { id: matchId, tournamentId },
      });
      if (!existing) {
        return createErrorResponse('Finals match not found', 404, 'NOT_FOUND');
      }
      if (existing.stage !== 'finals' && existing.stage !== 'playoff') {
        return createErrorResponse('Finals match not found', 404, 'NOT_FOUND');
      }

      if (hasSlotEdit) {
        return handleSlotEdit(tournamentId, existing, slotEdit, session, request, logger);
      }

      /* Uniqueness guard: prevent the same TV number being assigned to two
       * different matches in the same round (issue #668). */
      if (hasTv && tvNumber !== null) {
        const conflict = await model(prisma).findFirst({
          where: {
            tournamentId,
            stage: existing.stage,
            round: existing.round,
            tvNumber,
            id: { not: matchId },
          },
        });
        if (conflict) {
          return handleValidationError(
            `TV${tvNumber} is already assigned to match ${conflict.matchNumber} in this round`,
            'tvNumber',
          );
        }
      }

      /* Spec (#671/#728): every match in the same bracket round shares one
       * startingCourseNumber. The score-dialog dropdown is a round-level
       * control disguised as a per-match select, so a startingCourseNumber
       * PATCH propagates to all matches in the same stage+round via
       * updateMany. tvNumber stays per-match (it's a broadcast slot). */
      const propagateCourse = hasCourse && Boolean(config.assignBmStartingCourseByRound) && Boolean(existing.round);

      const updateData: Record<string, unknown> = {};
      if (hasTv) updateData.tvNumber = tvNumber ?? null;
      if (hasCourse && !propagateCourse) {
        updateData.startingCourseNumber = startingCourseNumber ?? null;
      }

      let match: unknown = null;
      if (Object.keys(updateData).length > 0) {
        match = await model(prisma).update({
          where: { id: matchId },
          data: updateData,
          include: { player1: { select: PLAYER_PUBLIC_SELECT }, player2: { select: PLAYER_PUBLIC_SELECT } },
        });
      }

      if (propagateCourse) {
        await model(prisma).updateMany({
          where: { tournamentId, stage: existing.stage, round: existing.round },
          data: { startingCourseNumber: startingCourseNumber ?? null },
        });
        /* Re-fetch the targeted row with player includes so the response
         * shape matches the non-propagation path. */
        match = await model(prisma).findUnique({
          where: { id: matchId },
          include: { player1: { select: PLAYER_PUBLIC_SELECT }, player2: { select: PLAYER_PUBLIC_SELECT } },
        });
      }

      return createSuccessResponse({ match });
    } catch (error) {
      logger.error('Failed to update finals match (PATCH)', { error, tournamentId });
      return createErrorResponse('Failed to update match', 500, 'INTERNAL_ERROR');
    }
  }

  /*
   * Cache-bust wrapper for write handlers.
   *
   * Every successful POST/PUT/PATCH on a finals route mutates rows that
   * `calculateOverallRankings` reads (finals matches feed `*FinalsPoints`,
   * playoff bracket changes alter who reaches finals, etc.), so the cached
   * overall ranking for that tournament must be invalidated. The handlers
   * themselves have many success branches (8+ across POST/PUT/PATCH), so
   * wrapping them centrally avoids the maintenance hazard of remembering
   * to call `invalidateOverallRankingsCache(...)` at every return statement.
   *
   * The wrapper deliberately swallows errors from `resolveTournamentId`:
   * if the lookup fails on a 2xx response (vanishingly unlikely — the
   * handler used the same id internally) we'd rather skip the cache-bust
   * than turn a successful response into an error.
   */
  type FinalsWriteHandler = (request: NextRequest, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;

  function withFinalsCacheBust(handler: FinalsWriteHandler): FinalsWriteHandler {
    return async (request, ctx) => {
      const response = await handler(request, ctx);
      if (response && response.status >= 200 && response.status < 300) {
        try {
          const { id } = await ctx.params;
          const tournamentId = await resolveTournamentId(id);
          invalidateOverallRankingsCache(tournamentId);
        } catch {
          /* best effort — cache bust failure must not break the response */
        }
      }
      return response;
    };
  }

  return {
    GET,
    POST: withFinalsCacheBust(POST as FinalsWriteHandler),
    PUT: withFinalsCacheBust(PUT as FinalsWriteHandler),
    PATCH: withFinalsCacheBust(PATCH as FinalsWriteHandler),
  };
}
