/**
 * TA (Time Attack) Rank Calculation Module
 *
 * Handles the calculation of total times and ranking of players within
 * each tournament stage. Rankings are determined by:
 *
 * - Qualification: Sorted by qualification points (descending), then total time (ascending)
 *   Points are calculated per-course using linear interpolation (50pt max, 0pt min).
 * - Revival Rounds: Sorted by total time (fastest first)
 * - Finals: Sorted by elimination status, then lives remaining, then total time
 *
 * The ranking process:
 * 1. Calculate total time for each entry from individual course times
 * 2. For qualification: calculate per-course scores and total qualification points
 * 3. Sort entries according to stage-specific criteria
 * 4. Assign sequential ranks (1, 2, 3, ...)
 * 5. Persist updated fields to the database in a single transaction
 *
 * This module is called after every time entry update to keep rankings current.
 */

import { COURSES } from "@/lib/constants";
import { timeToMs } from "@/lib/ta/time-utils";
import { calculateAllCourseScores } from "@/lib/ta/qualification-scoring";
import { PrismaClient } from "@prisma/client";

/**
 * Represents a tournament entry with its calculated total time and scoring data.
 * Used as an intermediate data structure during rank calculation.
 */
export interface EntryWithTotal {
  /** Unique identifier of the TTEntry record */
  id: string;
  /** Sum of all course times in milliseconds, or null if incomplete */
  totalTime: number | null;
  /** Number of lives remaining (used in finals stage) */
  lives: number;
  /** Whether the player has been eliminated */
  eliminated: boolean;
  /** Tournament stage this entry belongs to */
  stage: string;
  /** Per-course scores for qualification (e.g., {"MC1": 42.86, "DP1": 50}) */
  courseScores: Record<string, number>;
  /** Total qualification points: floor(sum of courseScores) */
  qualificationPoints: number;
}

/**
 * Calculate the total time for a single entry by summing all 20 course times.
 *
 * Iterates through all COURSES defined in constants and converts each time
 * string to milliseconds. If any course time is missing or invalid, the
 * totalTime is set to null (entry is considered incomplete).
 *
 * @param entry - A TTEntry-like object with times, lives, eliminated status, and id
 * @returns EntryWithTotal with the calculated totalTime
 */
export function calculateEntryTotal(entry: {
  times: Record<string, string> | null;
  lives: number;
  eliminated: boolean;
  id: string;
  stage?: string;
}): EntryWithTotal {
  const times = entry.times as Record<string, string> | null;
  let totalMs = 0;
  let allTimesEntered = true;

  if (times) {
    // Iterate through all 20 official courses to compute total time
    for (const course of COURSES) {
      const courseTime = times[course];
      const ms = courseTime ? timeToMs(courseTime) : null;
      if (ms !== null) {
        totalMs += ms;
      } else {
        // Mark as incomplete if any course time is missing
        allTimesEntered = false;
      }
    }
  } else {
    // No times object at all means entry is incomplete
    allTimesEntered = false;
  }

  return {
    id: entry.id,
    // Only return a total time if all 20 courses have valid times
    totalTime: allTimesEntered ? totalMs : null,
    lives: entry.lives,
    eliminated: entry.eliminated,
    stage: entry.stage ?? '',
    // Scoring fields initialized to empty; populated by recalculateRanks for qualification
    courseScores: {},
    qualificationPoints: 0,
  };
}

/**
 * Sort entries by stage-specific ranking criteria.
 *
 * Sorting rules vary by stage:
 * - Revival rounds: Only entries with valid total times, sorted by fastest time
 * - Qualification: All entries included, sorted by qualification points (descending),
 *   then by total time as tiebreaker (ascending). Players without any times
 *   still appear in standings with 0 points.
 *
 * Note: "finals" sorting branch was removed because the legacy promote-to-finals
 * feature was superseded by the Phase 1/2/3 system, which has its own ranking
 * logic in the phases API.
 *
 * @param entries - Entries with total times calculated
 * @param stage - Tournament stage ("revival_1", "revival_2", "qualification")
 * @returns New sorted array of entries
 */
export function sortByStage(entries: EntryWithTotal[], stage: string): EntryWithTotal[] {
  if (stage === "revival_1" || stage === "revival_2") {
    // Revival rounds: filter to entries with valid times, sort by fastest
    return entries
      .filter((e) => e.totalTime !== null)
      .sort((a, b) => (a.totalTime ?? Infinity) - (b.totalTime ?? Infinity));
  } else {
    // Qualification: sort by qualification points descending, then total time ascending
    // All entries are included (even those with 0 points) so they appear in standings
    return [...entries].sort((a, b) => {
      // Higher points = better rank
      if (a.qualificationPoints !== b.qualificationPoints) {
        return b.qualificationPoints - a.qualificationPoints;
      }
      // Tiebreaker: faster total time wins; null times sort to the end
      if (a.totalTime === null && b.totalTime === null) return 0;
      if (a.totalTime === null) return 1;
      if (b.totalTime === null) return -1;
      return a.totalTime - b.totalTime;
    });
  }
}

/**
 * Assign sequential ranks (1-based) to a sorted list of entries.
 *
 * Each entry receives a rank based on its position in the sorted array.
 * No tie-breaking is applied here; entries at the same position get
 * different ranks based on sort order.
 *
 * @param sortedEntries - Entries pre-sorted by ranking criteria
 * @returns Map of entry IDs to their assigned rank numbers
 */
export function assignRanks(sortedEntries: EntryWithTotal[]): Map<string, number> {
  const rankMap = new Map<string, number>();
  sortedEntries.forEach((entry, index) => {
    rankMap.set(entry.id, index + 1);
  });
  return rankMap;
}

/**
 * Recalculate and persist ranks for all entries in a tournament stage.
 *
 * This is the main entry point called after any time update or status change.
 * It performs the full pipeline:
 * 1. Fetch all entries for the tournament/stage from the database
 * 2. Calculate total times for each entry
 * 3. For qualification: calculate per-course scores and total qualification points
 * 4. Sort by stage-specific criteria
 * 5. Assign ranks
 * 6. Persist updated fields in a single transaction
 *
 * Using a database transaction ensures consistency even with concurrent updates.
 *
 * @param tournamentId - Tournament ID to recalculate ranks for
 * @param stage - Tournament stage (defaults to "qualification")
 * @param prisma - Prisma client instance for database operations
 */
export async function recalculateRanks(
  tournamentId: string,
  stage: string = "qualification",
  prisma: PrismaClient
): Promise<void> {
  // Fetch all entries for this tournament stage including player data
  const entries = await prisma.tTEntry.findMany({
    where: { tournamentId, stage },
    include: { player: true },
  });

  // Calculate total time for each entry from individual course times
  const entriesWithTotal = entries.map((entry) =>
    calculateEntryTotal({
      times: entry.times as Record<string, string> | null,
      lives: entry.lives,
      eliminated: entry.eliminated,
      id: entry.id,
      stage: entry.stage,
    })
  );

  // For qualification stage: calculate per-course scores and total qualification points
  if (stage === "qualification") {
    const scoringEntries = entries.map((entry) => ({
      id: entry.id,
      times: entry.times as Record<string, string> | null,
    }));
    const scoreResults = calculateAllCourseScores(scoringEntries);

    // Merge scoring results into entriesWithTotal
    for (const entry of entriesWithTotal) {
      const scoreResult = scoreResults.get(entry.id);
      if (scoreResult) {
        entry.courseScores = scoreResult.courseScores;
        entry.qualificationPoints = scoreResult.qualificationPoints;
      }
    }
  }

  // Sort entries and assign ranks based on stage-specific criteria
  const sorted = sortByStage(entriesWithTotal, stage);
  const rankMap = assignRanks(sorted);

  // Build update operations for all entries (including those without ranks)
  const updateOperations = entriesWithTotal.map((entry: EntryWithTotal) => {
    const rank = rankMap.get(entry.id) ?? null;

    // Base data: always update totalTime and rank
    const data: Record<string, unknown> = {
      totalTime: entry.totalTime,
      rank,
    };

    // For qualification: also persist course scores and total points
    if (stage === "qualification") {
      data.courseScores = entry.courseScores;
      data.qualificationPoints = entry.qualificationPoints;
    }

    return prisma.tTEntry.update({
      where: { id: entry.id },
      data,
    });
  });

  // Execute all updates in a single transaction for atomicity
  await prisma.$transaction(updateOperations);
}
