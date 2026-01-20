import { COURSES } from "@/lib/constants";
import { timeToMs } from "@/lib/ta/time-utils";
import { PrismaClient } from "@prisma/client";

export interface EntryWithTotal {
  id: string;
  totalTime: number | null;
  lives: number;
  eliminated: boolean;
  stage: string;
}

/**
 * Calculate total time for a single entry
 * @param entry - TTEntry with times object
 * @returns Entry with total time calculated
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
    for (const course of COURSES) {
      const courseTime = times[course];
      const ms = courseTime ? timeToMs(courseTime) : null;
      if (ms !== null) {
        totalMs += ms;
      } else {
        allTimesEntered = false;
      }
    }
  } else {
    allTimesEntered = false;
  }

  return {
    id: entry.id,
    totalTime: allTimesEntered ? totalMs : null,
    lives: entry.lives,
    eliminated: entry.eliminated,
    stage: entry.stage ?? '',
  };
}

/**
 * Sort entries by stage-specific ranking criteria
 * @param entries - Entries with total times calculated
 * @param stage - Tournament stage ("finals", "revival_1", "revival_2", "qualification")
 * @returns Sorted entries
 */
export function sortByStage(entries: EntryWithTotal[], stage: string): EntryWithTotal[] {
  if (stage === "finals") {
    return entries.sort((a, b) => {
      if (a.eliminated !== b.eliminated) {
        return a.eliminated ? 1 : -1;
      }
      if (a.lives !== b.lives) {
        return b.lives - a.lives;
      }
      if (a.eliminated || b.eliminated) return 0;
      if (a.totalTime === null) return 1;
      if (b.totalTime === null) return -1;
      return (a.totalTime ?? Infinity) - (b.totalTime ?? Infinity);
    });
  } else if (stage === "revival_1" || stage === "revival_2") {
    return entries
      .filter((e) => e.totalTime !== null)
      .sort((a, b) => (a.totalTime ?? Infinity) - (b.totalTime ?? Infinity));
  } else {
    return entries
      .filter((e) => e.totalTime !== null)
      .sort((a, b) => (a.totalTime ?? Infinity) - (b.totalTime ?? Infinity));
  }
}

/**
 * Assign ranks to sorted entries
 * @param sortedEntries - Entries sorted by ranking criteria
 * @returns Map of entry IDs to their ranks
 */
export function assignRanks(sortedEntries: EntryWithTotal[]): Map<string, number> {
  const rankMap = new Map<string, number>();
  sortedEntries.forEach((entry, index) => {
    rankMap.set(entry.id, index + 1);
  });
  return rankMap;
}

/**
 * Recalculate ranks for all entries in a tournament stage
 * @param tournamentId - Tournament ID
 * @param stage - Tournament stage
 * @param prisma - Prisma client instance
 * @returns Promise that resolves when ranks are updated
 */
export async function recalculateRanks(
  tournamentId: string,
  stage: string = "qualification",
  prisma: PrismaClient
): Promise<void> {
  const entries = await prisma.tTEntry.findMany({
    where: { tournamentId, stage },
    include: { player: true },
  });

  const entriesWithTotal = entries.map((entry) =>
    calculateEntryTotal({
      times: entry.times as Record<string, string> | null,
      lives: entry.lives,
      eliminated: entry.eliminated,
      id: entry.id,
      stage: entry.stage,
    })
  );
  const sorted = sortByStage(entriesWithTotal, stage);
  const rankMap = assignRanks(sorted);

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

  await prisma.$transaction(updateOperations);
}
