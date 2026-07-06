/**
 * TA Qualification Scoring Module
 *
 * Implements a point-based scoring system for the Time Attack qualification stage.
 * Instead of ranking players solely by total time, each course is scored independently:
 *
 * Scoring rules (aligned with the CDM Excel workbook — issue #2768):
 * - For each course, players are ranked by time (fastest first)
 * - 1st place receives 50 points, last place receives 0 points
 * - Intermediate ranks receive linearly interpolated points:
 *     points(rank) = 50 * (N - rank) / (N - 1)  where N = number of participants
 * - If only 1 participant, they receive 50 points
 * - Players who tied (same time) share the best rank of the tie group and all
 *   receive that rank's points, exactly like Excel's RANK() competition ranking
 *   (e.g. two players tied fastest are both rank 1 and both get 50; the next
 *   player is rank 3). The CDM workbook computes per-track position scores as
 *   COUNTA(roster) - RANK(time), so averaging tied positions (the previous app
 *   behavior) diverged from the workbook whenever a tie occurred.
 * - Players without a time for a course receive 0 points for that course
 *
 * The total qualification score is the sum of all course scores rounded to the
 * nearest integer. The workbook keeps the raw float and displays it through an
 * integer cell format ("0"), which rounds — so rounding (not flooring) is what
 * reproduces the published CDM point totals. Because tied players share the
 * min-rank score, two players with the same multiset of ranks across all 20
 * courses are guaranteed the same total, matching the workbook.
 * Qualification ranking is determined by total qualification points (descending),
 * with total time as a tiebreaker (ascending).
 */

import { COURSES } from "@/lib/constants";
import { timeToMs } from "@/lib/ta/time-utils";

/** Maximum points awarded to the fastest player per course */
const MAX_COURSE_POINTS = 50;

/**
 * Generate a score table for N participants.
 *
 * Returns an array of length N where index 0 is the score for rank 1 (50 points)
 * and index N-1 is the score for rank N (0 points). Points are linearly interpolated.
 *
 * Formula: score[i] = 50 * (N - 1 - i) / (N - 1)
 *
 * @param participantCount - Number of participants (N >= 1)
 * @returns Array of scores from rank 1 to rank N
 */
export function generateScoreTable(participantCount: number): number[] {
  if (participantCount <= 0) return [];
  if (participantCount === 1) return [MAX_COURSE_POINTS];

  const table: number[] = [];
  for (let i = 0; i < participantCount; i++) {
    // rank = i + 1, so (N - rank) = (N - 1 - i)
    table.push(MAX_COURSE_POINTS * (participantCount - 1 - i) / (participantCount - 1));
  }
  return table;
}

/**
 * Entry data required for per-course scoring.
 * Only the id and times record are needed; other fields are irrelevant.
 */
export interface ScoringEntry {
  id: string;
  times: Record<string, string> | null;
}

/**
 * Calculate scores for a single course across all entries.
 *
 * Process:
 * 1. Extract valid times for this course from all entries
 * 2. Sort by time ascending (fastest first)
 * 3. Handle ties: players with identical times share the tie group's best rank
 *    and all receive that rank's score (Excel RANK competition ranking)
 * 4. Generate score table based on participant count
 * 5. Assign scores; entries without a valid time receive 0 points
 *
 * @param entries - All qualification entries
 * @param course - Course abbreviation (e.g., "MC1")
 * @returns Map of entry ID to score for this course
 */
export function calculateCourseScores(
  entries: ScoringEntry[],
  course: string
): Map<string, number> {
  const scores = new Map<string, number>();

  // Collect entries that have a valid time for this course
  const validEntries: Array<{ id: string; timeMs: number }> = [];
  for (const entry of entries) {
    const timeStr = entry.times?.[course];
    const timeMs = timeStr ? timeToMs(timeStr) : null;
    if (timeMs !== null) {
      validEntries.push({ id: entry.id, timeMs });
    }
  }

  // If no one has a time, everyone gets 0
  if (validEntries.length === 0) {
    for (const entry of entries) {
      scores.set(entry.id, 0);
    }
    return scores;
  }

  // Sort by time ascending (fastest first)
  validEntries.sort((a, b) => a.timeMs - b.timeMs);

  // Generate score table based on number of participants with valid times
  const scoreTable = generateScoreTable(validEntries.length);

  // Assign scores handling ties:
  // Players with the same time share the tie group's best (minimum) rank and
  // all receive that rank's score. This mirrors Excel's RANK(), which the CDM
  // workbook uses for its per-track position scores (issue #2768) — averaging
  // the tied positions instead would make totals diverge from the workbook.
  let i = 0;
  while (i < validEntries.length) {
    // Find the range of entries with the same time (tie group)
    let j = i;
    while (j < validEntries.length && validEntries[j].timeMs === validEntries[i].timeMs) {
      j++;
    }

    // scoreTable[i] is the score of the tie group's best rank (rank i+1);
    // subsequent ranks up to j are skipped, like competition ranking.
    const tiedScore = scoreTable[i];
    for (let k = i; k < j; k++) {
      scores.set(validEntries[k].id, tiedScore);
    }

    i = j;
  }

  // Entries without a valid time for this course get 0 points
  for (const entry of entries) {
    if (!scores.has(entry.id)) {
      scores.set(entry.id, 0);
    }
  }

  return scores;
}

/**
 * Total qualification points for a player.
 * Contains breakdown by course and the summed total points.
 * Used by overall-ranking to aggregate TA points into the grand total.
 */
export interface TAQualificationPointsResult {
  playerId: string;
  /** Points earned on each individual course (0-50 per course) */
  coursePoints: Record<string, number>;
  /** Sum of all course points (0-1000 maximum) */
  totalPoints: number;
}

/**
 * Result of scoring calculation for a single entry.
 */
export interface EntryScoreResult {
  /** Per-course scores: {"MC1": 42.86, "DP1": 50, ...} */
  courseScores: Record<string, number>;
  /** Total qualification points: round(sum of courseScores) */
  qualificationPoints: number;
}

/**
 * Calculate scores for all 20 courses and compute total qualification points.
 *
 * Iterates through every course defined in COURSES, calculates per-course scores,
 * then sums them per entry and rounds to get the final qualification points.
 *
 * @param entries - All qualification entries with their times
 * @returns Map of entry ID to { courseScores, qualificationPoints }
 */
export function calculateAllCourseScores(
  entries: ScoringEntry[]
): Map<string, EntryScoreResult> {
  const results = new Map<string, EntryScoreResult>();

  // Initialize results for all entries
  for (const entry of entries) {
    results.set(entry.id, { courseScores: {}, qualificationPoints: 0 });
  }

  if (entries.length === 0) return results;

  // Calculate scores for each of the 20 courses independently
  for (const course of COURSES) {
    const courseScoreMap = calculateCourseScores(entries, course);

    // Distribute per-course scores to each entry's result
    for (const [entryId, score] of courseScoreMap) {
      const result = results.get(entryId);
      if (result) {
        result.courseScores[course] = score;
      }
    }
  }

  // Compute total qualification points as the rounded sum of all course scores.
  // The CDM Excel workbook keeps the raw float total and displays it through an
  // integer cell format, which rounds to the nearest integer; flooring here
  // (the previous behavior) produced totals 1 point below the published Excel
  // results whenever the raw sum had a fractional part >= 0.5 (issue #2768).
  // Note: the workbook computes the total as (Σ(N−rank)/20)/(N−1)×1000 in one
  // expression while we add 20 per-course floats, so bit-level float identity
  // with Excel is not structurally guaranteed for raw sums within ~1e-12 of a
  // .5 boundary — verified to agree on the full CDM 2025 dataset.
  for (const [entryId, result] of results) {
    const totalScore = Object.values(result.courseScores).reduce((sum, s) => sum + s, 0);
    result.qualificationPoints = Math.round(totalScore);
    results.set(entryId, result);
  }

  return results;
}
