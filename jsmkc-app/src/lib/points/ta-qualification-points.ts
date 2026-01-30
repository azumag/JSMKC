/**
 * TA (Time Attack) Qualification Points Calculation
 *
 * Point calculation follows linear interpolation formula:
 * - Each course: fastest time = 50 points, slowest time = 0 points
 * - Formula: points = 50 * (totalParticipants - rank) / (totalParticipants - 1)
 * - Same times receive same rank (tied handling)
 * - Points are truncated (floor) to integer
 * - Maximum 1000 points total (20 courses x 50 points)
 *
 * Example with 11 participants:
 * Rank:    1   2   3   4   5   6   7   8   9  10  11
 * Points: 50  45  40  35  30  25  20  15  10   5   0
 *
 * Rank 2 calculation: 50 x (11-2) / (11-1) = 50 x 9 / 10 = 45
 *
 * This scoring system ensures that performance on each individual course
 * contributes to the overall qualification ranking, rewarding consistent
 * performance across all 20 courses.
 */

import { COURSES, CourseAbbr } from "@/lib/constants";

/**
 * Course-specific ranking entry for TA qualification.
 * Contains player ID and their time in milliseconds for sorting/ranking.
 */
export interface CourseRankingEntry {
  playerId: string;
  timeMs: number;
}

/**
 * Course-specific points result.
 * Contains player ID, their rank, and calculated points for a single course.
 */
export interface CoursePointsResult {
  playerId: string;
  rank: number;
  points: number;
}

/**
 * Total qualification points for a player.
 * Contains breakdown by course and the summed total points.
 */
export interface TAQualificationPointsResult {
  playerId: string;
  /** Points earned on each individual course (0-50 per course) */
  coursePoints: Record<CourseAbbr, number>;
  /** Sum of all course points (0-1000 maximum) */
  totalPoints: number;
}

/**
 * Calculate points for a single course based on linear interpolation.
 *
 * The formula distributes points linearly between 50 (fastest) and 0 (slowest).
 * With N participants, rank 1 gets 50 and rank N gets 0.
 * All intermediate ranks are evenly spaced.
 *
 * Edge case: if there is only 1 participant, they receive full 50 points
 * since they are both the fastest and only competitor.
 *
 * @param rank - Player's rank on this course (1-based, 1 = fastest)
 * @param totalParticipants - Total number of participants with valid times
 * @returns Calculated points (0-50), truncated to integer
 */
export function calculateCoursePoints(
  rank: number,
  totalParticipants: number
): number {
  // Edge case: only one participant gets full points
  if (totalParticipants <= 1) {
    return 50;
  }

  // Linear interpolation: 50 * (total - rank) / (total - 1)
  // Rank 1 gets 50 points, last rank gets 0 points
  const points = (50 * (totalParticipants - rank)) / (totalParticipants - 1);

  // Truncate to integer (floor), ensure non-negative
  return Math.max(0, Math.floor(points));
}

/**
 * Assign ranks to players for a single course, handling ties.
 * Players with the same time receive the same rank (standard competition ranking).
 *
 * Tie handling example: if two players tie for 2nd, they both get rank 2,
 * and the next player gets rank 4 (rank 3 is skipped).
 *
 * @param entries - Array of players with their times for this course
 * @returns Array of CoursePointsResult with rank and calculated points
 */
export function calculateCourseRankings(
  entries: CourseRankingEntry[]
): CoursePointsResult[] {
  // Filter out invalid times and sort by time ascending (fastest first)
  const validEntries = entries
    .filter((e) => e.timeMs > 0)
    .sort((a, b) => a.timeMs - b.timeMs);

  if (validEntries.length === 0) {
    return [];
  }

  const totalParticipants = validEntries.length;
  const results: CoursePointsResult[] = [];

  // Assign ranks with tie handling
  // Ties receive the same rank; next rank skips to position index + 1
  let currentRank = 1;
  let previousTime: number | null = null;

  for (let i = 0; i < validEntries.length; i++) {
    const entry = validEntries[i];

    if (previousTime !== null && entry.timeMs === previousTime) {
      // Same time as previous player - keep same rank (tie)
    } else {
      // Different time - advance rank to current position (1-based index)
      currentRank = i + 1;
    }

    results.push({
      playerId: entry.playerId,
      rank: currentRank,
      points: calculateCoursePoints(currentRank, totalParticipants),
    });

    previousTime = entry.timeMs;
  }

  return results;
}

/**
 * Calculate total qualification points for all players across all 20 courses.
 *
 * For each of the 20 courses:
 * 1. Gather all players' times for that course
 * 2. Rank players by time (fastest = rank 1)
 * 3. Calculate points using linear interpolation
 * 4. Assign 0 points to players without a valid time for that course
 *
 * Final result includes per-course breakdown and total points sum.
 *
 * @param playerTimes - Map of playerId to their course times (course abbr -> time in ms)
 * @returns Array of TAQualificationPointsResult with course breakdown and total
 */
export function calculateTAQualificationPoints(
  playerTimes: Map<string, Record<string, number | null>>
): TAQualificationPointsResult[] {
  // Initialize results for each player with empty course points
  const playerResults = new Map<string, TAQualificationPointsResult>();

  for (const [playerId] of playerTimes) {
    playerResults.set(playerId, {
      playerId,
      coursePoints: {} as Record<CourseAbbr, number>,
      totalPoints: 0,
    });
  }

  // Calculate points for each of the 20 courses independently
  for (const course of COURSES) {
    // Gather times for this course from all players
    const courseEntries: CourseRankingEntry[] = [];

    for (const [playerId, times] of playerTimes) {
      const timeMs = times[course];
      // Only include players with valid positive times
      if (timeMs !== null && timeMs !== undefined && timeMs > 0) {
        courseEntries.push({ playerId, timeMs });
      }
    }

    // Calculate rankings and points for this course
    const courseResults = calculateCourseRankings(courseEntries);

    // Assign calculated points to player results
    for (const result of courseResults) {
      const playerResult = playerResults.get(result.playerId);
      if (playerResult) {
        playerResult.coursePoints[course as CourseAbbr] = result.points;
        playerResult.totalPoints += result.points;
      }
    }

    // Players without valid time for this course get 0 points
    for (const [, result] of playerResults) {
      if (result.coursePoints[course as CourseAbbr] === undefined) {
        result.coursePoints[course as CourseAbbr] = 0;
      }
    }
  }

  return Array.from(playerResults.values());
}

/**
 * Calculate qualification points for a single player given pre-calculated rankings.
 * Useful for updating a single player's points without recalculating everyone,
 * for example after a single time entry update.
 *
 * @param playerId - The player's ID
 * @param playerTimes - The player's times for each course (unused but kept for API consistency)
 * @param allCourseRankings - Pre-calculated rankings for each course
 * @returns TAQualificationPointsResult for this specific player
 */
export function calculatePlayerQualificationPoints(
  playerId: string,
  playerTimes: Record<string, number | null>,
  allCourseRankings: Map<CourseAbbr, CoursePointsResult[]>
): TAQualificationPointsResult {
  const coursePoints: Record<string, number> = {};
  let totalPoints = 0;

  // Look up this player's points in each course's pre-calculated rankings
  for (const course of COURSES) {
    const courseResults = allCourseRankings.get(course);
    if (courseResults) {
      const playerResult = courseResults.find((r) => r.playerId === playerId);
      if (playerResult) {
        coursePoints[course] = playerResult.points;
        totalPoints += playerResult.points;
      } else {
        // Player not found in this course's rankings (no valid time)
        coursePoints[course] = 0;
      }
    } else {
      // No rankings exist for this course yet
      coursePoints[course] = 0;
    }
  }

  return {
    playerId,
    coursePoints: coursePoints as Record<CourseAbbr, number>,
    totalPoints,
  };
}
