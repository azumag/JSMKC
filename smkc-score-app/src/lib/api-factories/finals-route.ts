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
import { PLAYER_PUBLIC_SELECT } from '@/lib/prisma-selects';
import prisma from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { generateBracketStructure, generatePlayoffStructure, roundNames } from '@/lib/double-elimination';
import { selectFinalsEntrantsByGroup } from '@/lib/finals-group-selection';
import { getGpFinalsMaxCups, getMrFinalsMaxRounds } from '@/lib/finals-target-wins';
import { paginate } from '@/lib/pagination';
import { sanitizeInput } from '@/lib/sanitize';
import { createLogger } from '@/lib/logger';
import { createErrorResponse, createSuccessResponse, handleValidationError, handleRateLimitError } from '@/lib/error-handling';
import { checkRateLimit } from '@/lib/rate-limit';
import { getClientIdentifier } from '@/lib/request-utils';
import { resolveTournament, resolveTournamentId } from '@/lib/tournament-identifier';
import { checkQualificationConfirmed } from '@/lib/qualification-confirmed-check';
import { computeQualificationRanks } from '@/lib/server-ranking';
import { invalidateOverallRankingsCache } from '@/lib/points/overall-ranking';
import { COURSES, CUPS, MAX_TV_NUMBER } from '@/lib/constants';

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
const PLAYOFF_ENTRANT_COUNT = 12;

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
  seed: number;
  playerId: string;
  player: unknown;
  qualificationRankLabel?: string;
}

function fisherYatesShuffle<T>(arr: readonly T[]): T[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function getOrderedRounds(
  bracketStructure: Array<{ round: string }>,
): string[] {
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
    const assignedCourses = Array.from({ length: roundsNeeded }, (_, index) =>
      shuffledCourses[(cursor + index) % shuffledCourses.length]
    );
    assignments.set(round, assignedCourses);
    cursor = (cursor + roundsNeeded) % shuffledCourses.length;
  }

  return assignments;
}

function createGpCupSequence(
  maxCups: number,
  preferredFirstCup?: string | null,
): string[] {
  if (maxCups <= 0) return [];
  const first = preferredFirstCup && CUPS.includes(preferredFirstCup as (typeof CUPS)[number])
    ? preferredFirstCup
    : undefined;
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
function createBmRoundStartingCourses(
  bracketStructure: Array<{ round: string }>,
): Map<string, number> {
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
  stage: 'finals' | 'playoff',
  matches: Array<{ id: string; cup?: string | null; assignedCups?: unknown; round?: string | null }>,
): Promise<CupNormalizationResult> {
  const matchesByRound = new Map<string, Array<{
    id: string;
    cup?: string | null;
    assignedCups: string[];
  }>>();

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

  let writes = 0;
  for (const [round, data] of canonicalByRound) {
    const canonicalKey = JSON.stringify(data.assignedCups);
    for (const match of matchesByRound.get(round) ?? []) {
      if (match.cup === data.cup && JSON.stringify(match.assignedCups) === canonicalKey) {
        continue;
      }
      await modelInstance.update({
        where: { id: match.id },
        data,
      });
      writes += 1;
    }
  }

  return { repaired: writes > 0, canonicalByRound };
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
        tournamentId, stage, round,
        OR: [
          { startingCourseNumber: null },
          { NOT: { startingCourseNumber: value } },
        ],
      },
      data: { startingCourseNumber: value },
    });
  }

  return { repaired: true, canonicalByRound };
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

  function getQualificationMatchScoreFields(): { p1: string; p2: string } {
    return config.eventTypeCode === 'gp'
      ? { p1: 'points1', p2: 'points2' }
      : { p1: 'score1', p2: 'score2' };
  }

  function getCompletedMatchWinner(
    match: Record<string, unknown>,
  ): { winnerId: string; winnerPlayer: unknown } | null {
    const score1 = Number(match[config.putScoreFields.dbField1]);
    const score2 = Number(match[config.putScoreFields.dbField2]);
    if (!Number.isFinite(score1) || !Number.isFinite(score2) || score1 === score2) {
      return null;
    }

    const winnerId = score1 > score2 ? match.player1Id : match.player2Id;
    if (typeof winnerId !== 'string' || winnerId.length === 0) {
      return null;
    }

    return {
      winnerId,
      winnerPlayer: match.player1Id === winnerId ? match.player1 : match.player2,
    };
  }

  function hasAutomaticRankTies(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    qualifications: any[],
    orderBy: Array<Record<string, 'asc' | 'desc'>>,
  ): boolean {
    const firstOrderField = Object.keys(orderBy[0] ?? {})[0];
    const rankingOrder = firstOrderField === 'group' ? orderBy.slice(1) : orderBy;
    const byPartition = new Map<string, typeof qualifications>();

    for (const q of qualifications) {
      const partition = firstOrderField === 'group' ? q.group ?? '' : '';
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

    return computeQualificationRanks(
      qualifications,
      config.qualificationOrderBy,
      matches,
      { matchScoreFields: scoreFields },
    );
  }

  function buildQualificationRankLabelMap(
    qualifications: Array<{ playerId: string; group?: string | null }>,
  ): Map<string, string> {
    const rankByPlayerId = new Map<string, string>();
    const groupCounts = new Map<string, number>();

    for (const q of qualifications) {
      const group = q.group ?? '';
      const rank = (groupCounts.get(group) ?? 0) + 1;
      groupCounts.set(group, rank);
      rankByPlayerId.set(q.playerId, group ? `${group}${rank}` : `${rank}`);
    }

    return rankByPlayerId;
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    playoffMatches: any[],
  ): Promise<{
    bracketStructure: ReturnType<typeof generateBracketStructure>;
    seededPlayers: SeededFinalsPlayer[];
  } | null> {
    if (playoffMatches.length === 0) return null;

    try {
      const qualifications = await qualModel(prisma).findMany({
        where: { tournamentId },
        include: { player: { select: PLAYER_PUBLIC_SELECT } },
        orderBy: config.qualificationOrderBy,
      });

      if (qualifications.length < 24) return null;

      const rankedQualifications = await applyFinalsQualificationRanks(
        model,
        tournamentId,
        qualifications,
      );
      const qualificationRankLabels = buildQualificationRankLabelMap(rankedQualifications);

      const selection = selectFinalsEntrantsByGroup(
        rankedQualifications as Array<{ playerId: string; player: unknown; group: string }>,
      );

      const seededPlayers: SeededFinalsPlayer[] = selection.directSeeds.map(({ seed, qualification }) => ({
        seed,
        playerId: qualification.playerId,
        player: qualification.player,
        qualificationRankLabel: qualificationRankLabels.get(qualification.playerId),
      }));

      const playoffStructure = generatePlayoffStructure(PLAYOFF_ENTRANT_COUNT);
      const r2Matches = playoffMatches.filter(
        (m: { round?: string | null }) => m.round === 'playoff_r2',
      );

      for (const r2BracketMatch of playoffStructure.filter((m) => m.round === 'playoff_r2')) {
        if (!r2BracketMatch.advancesToUpperSeed) continue;
        const dbMatch = r2Matches.find(
          (m: { matchNumber: number }) => m.matchNumber === r2BracketMatch.matchNumber,
        );
        if (!dbMatch?.completed) continue;

        const winner = getCompletedMatchWinner(dbMatch);
        if (!winner) continue;
        seededPlayers.push({
          seed: r2BracketMatch.advancesToUpperSeed,
          playerId: winner.winnerId,
          player: winner.winnerPlayer,
          qualificationRankLabel: qualificationRankLabels.get(winner.winnerId),
        });
      }

      return {
        bracketStructure: generateBracketStructure(16),
        seededPlayers,
      };
    } catch {
      return null;
    }
  }

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

    // Resolve and verify in one D1 round-trip. The handler only consumes
    // the mode-specific qualificationConfirmed flag, so the projection stays
    // tight. Using per-mode flags (issue #696) prevents BM confirmation from
    // locking MR/GP bracket creation.
    const modeField = `${config.eventTypeCode}QualificationConfirmed` as
      | 'bmQualificationConfirmed'
      | 'mrQualificationConfirmed'
      | 'gpQualificationConfirmed';
    // Select all three flags explicitly to avoid computed-key type inference issues with Prisma generics.
    const tournament = await resolveTournament(id, {
      id: true,
      bmQualificationConfirmed: true,
      mrQualificationConfirmed: true,
      gpQualificationConfirmed: true,
    });
    if (!tournament) {
      return createErrorResponse('Tournament not found', 404, 'NOT_FOUND');
    }
    const tournamentId = tournament.id;

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
          'playoff',
          playoffMatches,
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

      const playoffStructure = playoffMatches.length > 0
        ? generatePlayoffStructure(PLAYOFF_ENTRANT_COUNT)
        : [];

      /* Reconstruct playoff seeded players from DB match data + structure.
       * R1 matches carry player1Seed (5-12) and player2Seed;
       * R2 matches carry player1Seed for BYE seeds (1-4).
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

      /* Compute playoff completion flag from DB data so the frontend
       * can show "Create Upper Bracket" even after a page refresh. */
      const playoffR2Matches = playoffMatches.filter(
        (m: { round?: string }) => m.round === 'playoff_r2',
      );
      const playoffComplete = playoffR2Matches.length === 4
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        && playoffR2Matches.every((m: any) => m.completed);

      /* Phase priority: when both playoff and finals exist (Phase-2 has run),
       * default to 'finals' so the UI lands on the Upper Bracket first.
       * The client can still switch to the playoff tab via the archived
       * playoffMatches returned below. */
      const hasFinals = await model(prisma).count({
        where: { tournamentId, stage: 'finals' },
      });
      const phase = hasFinals > 0 ? 'finals' as const
        : playoffMatches.length > 0 ? 'playoff' as const
        : 'finals' as const;
      const top24FinalsPreview = hasFinals === 0
        ? await buildTop24FinalsPreview(tournamentId, playoffMatches)
        : null;

      /* Normalize GP cup sequences for legacy finals rows before paginating or
       * simple/grouped fetches, so every branch sees the repaired state. */
      if (config.assignGpCupByRound) {
        const legacyFinals = await model(prisma).findMany({
          where: { tournamentId, stage: 'finals' },
          select: { id: true, round: true, cup: true, assignedCups: true },
        });
        if (legacyFinals.length > 0) {
          await normalizeRoundCupsToSingleSequence(
            model(prisma),
            'finals',
            legacyFinals,
          );
        }
      }

      /* MR counterpart for finals stage. */
      if (config.assignMrCoursesByRound) {
        const legacyFinals = await model(prisma).findMany({
          where: { tournamentId, stage: 'finals' },
          select: { id: true, round: true, assignedCourses: true },
        });
        if (legacyFinals.length > 0) {
          await normalizeRoundCoursesToSingleSet(
            model(prisma),
            tournamentId,
            'finals',
            legacyFinals,
          );
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
          await normalizeRoundStartingCoursesToSingleValue(
            model(prisma),
            tournamentId,
            'finals',
            legacyFinals,
          );
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
          { page, limit, include: { player1: { select: PLAYER_PUBLIC_SELECT }, player2: { select: PLAYER_PUBLIC_SELECT } } },
        );

        /* Infer bracket size from total match count:
         * 8-player bracket = 17 matches, 16-player bracket = 31 matches.
         * Use count > 20 as threshold to distinguish.
         * Use result.meta.total from paginate() to avoid an extra count query. */
        const bracketSize = (result.meta.total ?? 0) > BRACKET_SIZE_THRESHOLD
          ? 16
          : top24FinalsPreview
            ? 16
            : 8;

        const bracketStructure = result.data.length > 0
          ? generateBracketStructure(bracketSize)
          : top24FinalsPreview?.bracketStructure ?? [];

        return createSuccessResponse({
          ...result,
          bracketStructure,
          bracketSize,
          roundNames,
          qualificationConfirmed: (tournament as Record<string, unknown>)[modeField] as boolean ?? false,
          phase,
          playoffMatches,
          playoffStructure,
          playoffSeededPlayers,
          playoffComplete,
          ...(top24FinalsPreview ? { seededPlayers: top24FinalsPreview.seededPlayers } : {}),
        });
      }

      /* Shared fetch for 'grouped' and 'simple' styles */
      const matches = await model(prisma).findMany({
        where: { tournamentId, stage: 'finals' },
        include: { player1: { select: PLAYER_PUBLIC_SELECT }, player2: { select: PLAYER_PUBLIC_SELECT } },
        orderBy: { matchNumber: 'asc' },
      });

      const bracketSize = matches.length > BRACKET_SIZE_THRESHOLD
        ? 16
        : top24FinalsPreview
          ? 16
          : 8;

      const bracketStructure = matches.length > 0
        ? generateBracketStructure(bracketSize)
        : top24FinalsPreview?.bracketStructure ?? [];
      const seededPlayers = top24FinalsPreview?.seededPlayers ?? [];

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
          playoffMatches,
          bracketStructure,
          bracketSize,
          roundNames,
          qualificationConfirmed: (tournament as Record<string, unknown>)[modeField] as boolean ?? false,
          playoffStructure,
          playoffSeededPlayers,
          playoffComplete,
          phase,
          ...(top24FinalsPreview ? { seededPlayers } : {}),
        });
      }

      /* 'simple' style */
      return createSuccessResponse({
        matches,
        bracketStructure,
        bracketSize,
        roundNames,
        qualificationConfirmed: (tournament as Record<string, unknown>)[modeField] as boolean ?? false,
        phase,
        playoffMatches,
        playoffStructure,
        playoffSeededPlayers,
        playoffComplete,
        ...(top24FinalsPreview ? { seededPlayers } : {}),
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
      const { topN = 8, reset = false } = body;

      /* Hard reset: delete both playoff and finals rows so the admin can
       * start over from qualification. Triggered by a dedicated reset button
       * on the qualification page. */
      if (reset) {
        await model(prisma).deleteMany({
          where: { tournamentId, stage: { in: ['playoff', 'finals'] } },
        });
        return createSuccessResponse({
          message: 'Bracket reset',
          phase: 'finals',
        }, 'Bracket reset');
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

      const rankedQualifications = await applyFinalsQualificationRanks(
        model,
        tournamentId,
        qualifications,
      );
      const selectedQualifications = rankedQualifications.slice(0, topN);
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

      const seededPlayers = selectedQualifications.map(
        (q: { playerId: string; player: unknown }, index: number) => ({
          seed: index + 1,
          playerId: q.playerId,
          player: q.player,
          qualificationRankLabel: qualificationRankLabels.get(q.playerId),
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
            player1Id: player1?.playerId || seededPlayers[0].playerId,
            player2Id: player2?.playerId || player1?.playerId || seededPlayers[0].playerId,
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
      const qualifications = await qualificationModel(prisma).findMany({
        where: { tournamentId },
        include: { player: { select: PLAYER_PUBLIC_SELECT } },
        orderBy: finalsConfig.qualificationOrderBy,
      });

      if (qualifications.length < 24) {
        return handleValidationError(
          `Not enough players qualified. Need 24, found ${qualifications.length}`,
          'qualifications',
        );
      }

      const rankedQualifications = await applyFinalsQualificationRanks(
        matchModel,
        tournamentId,
        qualifications,
      );
      const qualificationRankLabels = buildQualificationRankLabelMap(rankedQualifications);

      /* Per-group Top-N selection with bracket seed assignment (#454).
       * For 2 groups, finals-group-selection applies the handwritten CDM
       * two-group layout instead of merging A/B into one qualification table.
       * Phase 1 and Phase 2 both re-derive the split; this relies on qualifications
       * being frozen between the two calls. If scores are edited after Phase 1
       * creates playoff rows, the Phase-2 direct/barrage computation can diverge
       * from what Phase 1 used — acceptable since the admin workflow freezes
       * qualification before finals. */
      let selection: ReturnType<typeof selectFinalsEntrantsByGroup>;
      try {
        selection = selectFinalsEntrantsByGroup(
          rankedQualifications as Array<{ playerId: string; player: unknown; group: string }>,
        );
      } catch (err) {
        return handleValidationError(
          err instanceof Error ? err.message : 'Invalid group distribution',
          'qualifications',
        );
      }

      const existingPlayoff = await matchModel(prisma).findMany({
        where: { tournamentId, stage: 'playoff' },
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
        }
        const playoffStructure = generatePlayoffStructure(PLAYOFF_ENTRANT_COUNT);
        const playoffMrAssignments = config.assignMrCoursesByRound
          ? createMrRoundAssignments(playoffStructure, 'playoff')
          : undefined;
        const playoffGpAssignments = config.assignGpCupByRound
          ? createGpRoundAssignments(playoffStructure, 'playoff')
          : undefined;
        const playoffBmStartingCourses = config.assignBmStartingCourseByRound
          ? createBmRoundStartingCourses(playoffStructure)
          : undefined;

        /* Playoff-local seeds 1-12 are the barrage entrants. For 2 groups,
         * their seed order creates the handwritten A/B barrage blocks. */
        const playoffSeededPlayers = selection.barrage.map((q, index) => ({
          seed: index + 1,
          playerId: q.playerId,
          player: q.player,
          qualificationRankLabel: qualificationRankLabels.get(q.playerId),
        }));

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
              /* Fallback player IDs satisfy NOT NULL on player1Id/player2Id for R2 slots
               * whose player2 comes from an R1 winner (not yet known at creation time). */
              player1Id: player1?.playerId || playoffSeededPlayers[0].playerId,
              player2Id: player2?.playerId || player1?.playerId || playoffSeededPlayers[0].playerId,
              completed: false,
              ...getRoundAssignmentData(bracketMatch.round, playoffMrAssignments, playoffGpAssignments, playoffBmStartingCourses),
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

        return createSuccessResponse({
          message: 'Playoff bracket created',
          phase: 'playoff',
          playoffMatches: createdPlayoffMatches,
          playoffStructure,
          playoffSeededPlayers,
          /* Note: Upper Bracket seats 1-12 for qual top 12 are reserved; the
           * finals bracket will be created in Phase 2 after playoff completes. */
        }, 'Playoff bracket created', { status: 201 });
      }

      /* --- PHASE 2: Build Upper Bracket once playoff is complete --- */
      const r2Matches = existingPlayoff.filter(
        (m: { round?: string }) => m.round === 'playoff_r2',
      );
      const incompleteR2 = r2Matches.filter((m: { completed: boolean }) => !m.completed);

      if (incompleteR2.length > 0) {
        return createErrorResponse(
          `Playoff not complete: ${incompleteR2.length} R2 match(es) remaining`,
          409,
          'PLAYOFF_INCOMPLETE',
        );
      }

      /* Derive each playoff winner and map to its advancesToUpperSeed target. */
      const playoffStructure = generatePlayoffStructure(PLAYOFF_ENTRANT_COUNT);
      const upperSeedToPlayer = new Map<number, { playerId: string; player: unknown }>();

      for (const r2BracketMatch of playoffStructure.filter(m => m.round === 'playoff_r2')) {
        const dbMatch = r2Matches.find(
          (m: { matchNumber: number }) => m.matchNumber === r2BracketMatch.matchNumber,
        );
        if (!dbMatch || !r2BracketMatch.advancesToUpperSeed) continue;
        const winner = getCompletedMatchWinner(dbMatch);
        if (!winner) {
          throw new Error(`Playoff winner for match ${r2BracketMatch.matchNumber} not resolved`);
        }
        upperSeedToPlayer.set(r2BracketMatch.advancesToUpperSeed, {
          playerId: winner.winnerId,
          player: winner.winnerPlayer,
        });
      }

      /* Build the 16 seeded players: direct advancers use their actual Upper
       * Bracket seed numbers (2 groups: fixed CDM paper layout), and playoff
       * winners fill the barrage slots declared by generatePlayoffStructure. */
      const directPlayers = selection.directSeeds.map(({ seed, qualification }) => ({
        seed,
        playerId: qualification.playerId,
        player: qualification.player,
        qualificationRankLabel: qualificationRankLabels.get(qualification.playerId),
      }));
      const playoffUpperSeeds = playoffStructure
        .filter((m) => m.round === 'playoff_r2' && m.advancesToUpperSeed)
        .map((m) => m.advancesToUpperSeed as number);
      const playoffWinnerSeeds = playoffUpperSeeds.map((upperSeed) => {
        const winner = upperSeedToPlayer.get(upperSeed);
        if (!winner) {
          throw new Error(`Playoff winner for Upper seed ${upperSeed} not resolved`);
        }
        return {
          seed: upperSeed,
          playerId: winner.playerId,
          player: winner.player,
          qualificationRankLabel: qualificationRankLabels.get(winner.playerId),
        };
      });
      const seededPlayers = [...directPlayers, ...playoffWinnerSeeds];

      const bracketStructure = generateBracketStructure(16);
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
          ? seededPlayers.find(p => p.seed === bracketMatch.player1Seed)
          : null;
        const player2 = bracketMatch.player2Seed
          ? seededPlayers.find(p => p.seed === bracketMatch.player2Seed)
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
            ...getRoundAssignmentData(bracketMatch.round, finalsMrAssignments, finalsGpAssignments, finalsBmStartingCourses),
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

      return createSuccessResponse({
        message: 'Finals bracket created from playoff results',
        phase: 'finals',
        matches: createdMatches,
        seededPlayers,
        bracketStructure,
      }, 'Finals bracket created', { status: 201 });
    } catch (error) {
      logger.error('Failed to create Top-24 finals', { error, tournamentId });
      return createErrorResponse(finalsConfig.postErrorMessage, 500, 'INTERNAL_ERROR');
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
      const { matchId } = body;
      let { score1, score2 } = body;

      if (!matchId || (score1 === undefined || score2 === undefined) && body.cupResults === undefined) {
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

        if ("error" in resolved) {
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
        const currentPlayoff = playoffStructure.find(b => b.matchNumber === matchNumber);

        if (currentPlayoff?.winnerGoesTo) {
          const position = currentPlayoff.position || 1;
          await model(prisma).updateMany({
            where: {
              tournamentId,
              stage: 'playoff',
              matchNumber: currentPlayoff.winnerGoesTo,
            },
            data: position === 1 ? { player1Id: winnerId } : { player2Id: winnerId },
          });
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
        totalFinalsMatches > EIGHT_PLAYER_EXPECTED &&
        totalFinalsMatches <= BRACKET_SIZE_THRESHOLD;
      const isUnexpectedCount =
        totalFinalsMatches !== EIGHT_PLAYER_EXPECTED &&
        totalFinalsMatches !== SIXTEEN_PLAYER_EXPECTED;
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
      const currentBracketMatch = bracketStructure.find(
        (b) => b.matchNumber === matchNumber,
      );

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
        if (currentBracketMatch.round === 'winners_r1') {
          /* 16-player: Winners R1 losers pair into adjacent Losers R1 slots.
           * Odd matchNumber (1,3,5,7) enters position 1; even (2,4,6,8) enters position 2. */
          loserPosition = (((matchNumber - 1) % 2) + 1) as 1 | 2;
        } else if (currentBracketMatch.round === 'winners_qf') {
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
  async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
  ) {
    const logger = createLogger(config.loggerName);

    const session = await auth();
    if (!session?.user || session.user.role !== 'admin') {
      return createErrorResponse('Forbidden', 403, 'FORBIDDEN');
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
      const { matchId, tvNumber, startingCourseNumber } = body;

      if (!matchId || typeof matchId !== 'string') {
        return handleValidationError('matchId is required', 'matchId');
      }

      /* PATCH supports two field types: tvNumber (broadcast slot) and
       * startingCourseNumber (BM start course). At least one must be supplied
       * — otherwise the request is a no-op and very likely a client bug. */
      const hasTv = tvNumber !== undefined;
      const hasCourse = startingCourseNumber !== undefined;
      if (!hasTv && !hasCourse) {
        return handleValidationError(
          'tvNumber or startingCourseNumber is required',
          'body',
        );
      }

      if (hasTv && tvNumber !== null &&
          (typeof tvNumber !== 'number' || !Number.isInteger(tvNumber) ||
           tvNumber < 1 || tvNumber > MAX_TV_NUMBER)) {
        return handleValidationError(
          `tvNumber must be an integer between 1 and ${MAX_TV_NUMBER}, or null`,
          'tvNumber',
        );
      }

      /* startingCourseNumber must be 1–4 (battle courses) or null to clear.
       * Only meaningful for BM finals (config.assignBmStartingCourseByRound)
       * but accepting it on every finals PATCH keeps the route generic — MR/GP
       * brackets simply never expose a UI to send this field. */
      if (hasCourse && startingCourseNumber !== null &&
          (typeof startingCourseNumber !== 'number' ||
           !Number.isInteger(startingCourseNumber) ||
           startingCourseNumber < 1 || startingCourseNumber > 4)) {
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
      const propagateCourse =
        hasCourse && Boolean(config.assignBmStartingCourseByRound) && Boolean(existing.round);

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
  type FinalsWriteHandler = (
    request: NextRequest,
    ctx: { params: Promise<{ id: string }> },
  ) => Promise<Response>;

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
