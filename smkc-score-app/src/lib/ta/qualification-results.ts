import { COURSES } from "@/lib/constants";
import { timeToMs } from "@/lib/ta/time-utils";

export interface TaQualificationResultEntry {
  id: string;
  times: Record<string, string> | null;
}

export function calculateCourseFirstPlaceCounts(
  entries: TaQualificationResultEntry[],
): Map<string, number> {
  const counts = new Map(entries.map((entry) => [entry.id, 0]));

  for (const course of COURSES) {
    const validTimes = entries
      .map((entry) => ({
        entryId: entry.id,
        timeMs: entry.times?.[course] ? timeToMs(entry.times[course]) : null,
      }))
      .filter((row): row is { entryId: string; timeMs: number } => row.timeMs !== null);

    if (validTimes.length === 0) continue;

    const fastest = Math.min(...validTimes.map((row) => row.timeMs));
    for (const row of validTimes) {
      if (row.timeMs === fastest) {
        counts.set(row.entryId, (counts.get(row.entryId) ?? 0) + 1);
      }
    }
  }

  return counts;
}
