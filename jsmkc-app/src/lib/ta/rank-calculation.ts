/**
 * TA (Time Attack) Rank Calculation Module
 *
 * Handles the calculation of total times and ranking of players within
 * each tournament stage. Rankings are determined by:
 *
 * - Qualification: Sorted by total time across all 20 courses (fastest first)
 * - Revival Rounds: Same as qualification (total time, fastest first)
 * - Finals: Sorted by elimination status, then lives remaining, then total time
 *
 * The ranking process:
 * 1. Calculate total time for each entry from individual course times
 * 2. Sort entries according to stage-specific criteria
 * 3. Assign sequential ranks (1, 2, 3, ...)
 * 4. Persist updated totalTime and rank values to the database
 *
 * This module is called after every time entry update to keep rankings current.
 */

import { COURSES } from "@/lib/constants";
import { timeToMs } from "@/lib/ta/time-utils";
import { PrismaClient } from "@prisma/client";

/**
 * Represents a tournament entry with its calculated total time.
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
  };
}

/**
 * Sort entries by stage-specific ranking criteria.
 *
 * Sorting rules vary by stage:
 * - Finals: Non-eliminated first, then by most lives, then by fastest total time
 *   (this reflects the life-based elimination system where lives matter most)
 * - Revival rounds: Only entries with valid total times, sorted by fastest time
 * - Qualification: Same as revival rounds (fastest total time)
 *
 * @param entries - Entries with total times calculated
 * @param stage - Tournament stage ("finals", "revival_1", "revival_2", "qualification")
 * @returns New sorted array of entries
 */
export function sortByStage(entries: EntryWithTotal[], stage: string): EntryWithTotal[] {
  if (stage === "finals") {
    // Finals sorting: active players first, then by lives (most first), then by time
    return [...entries].sort((a, b) => {
      // Non-eliminated players always rank above eliminated ones
      if (a.eliminated !== b.eliminated) {
        return a.eliminated ? 1 : -1;
      }
      // Among active players, more lives = higher rank
      if (a.lives !== b.lives) {
        return b.lives - a.lives;
      }
      // If both eliminated, order doesn't matter for ranking purposes
      if (a.eliminated || b.eliminated) return 0;
      // Among active players with same lives, fastest total time wins
      if (a.totalTime === null) return 1;
      if (b.totalTime === null) return -1;
      return (a.totalTime ?? Infinity) - (b.totalTime ?? Infinity);
    });
  } else if (stage === "revival_1" || stage === "revival_2") {
    // Revival rounds: filter to entries with valid times, sort by fastest
    return entries
      .filter((e) => e.totalTime !== null)
      .sort((a, b) => (a.totalTime ?? Infinity) - (b.totalTime ?? Infinity));
  } else {
    // Qualification: same sorting as revival (fastest total time first)
    return entries
      .filter((e) => e.totalTime !== null)
      .sort((a, b) => (a.totalTime ?? Infinity) - (b.totalTime ?? Infinity));
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
 * 3. Sort by stage-specific criteria
 * 4. Assign ranks
 * 5. Persist updated totalTime and rank values in a single transaction
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

  // Sort entries and assign ranks based on stage-specific criteria
  const sorted = sortByStage(entriesWithTotal, stage);
  const rankMap = assignRanks(sorted);

  // Build update operations for all entries (including those without ranks)
  const updateOperations = entriesWithTotal.map((entry: EntryWithTotal) => {
    const rank = rankMap.get(entry.id) ?? null;
    return prisma.tTEntry.update({
      where: { id: entry.id },
      data: {
        totalTime: entry.totalTime,
        rank,
      },
    });
  });

  // Execute all updates in a single transaction for atomicity
  await prisma.$transaction(updateOperations);
}
