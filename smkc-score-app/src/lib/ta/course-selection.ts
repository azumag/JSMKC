/**
 * Random Course Selection for TA Finals Phases
 *
 * Implements the "no repeat until all 20 used" rule from the SMK tournament rulebook:
 * - Finals phases share one course cycle in phase order
 * - Courses are selected randomly from the pool of unplayed courses
 * - Once all 20 courses have been played, the cycle resets (all become available again)
 * - Selection is server-side to prevent race conditions between concurrent admins
 *
 * Usage:
 *   const course = await selectRandomCourse(prisma, tournamentId, "phase1");
 *   // Returns a CourseAbbr that hasn't been played yet in the current cycle
 */

import { PrismaClient } from "@prisma/client";
import { COURSES, CourseAbbr } from "@/lib/constants";
import type { PrismaTransaction } from "@/types/prisma-extended";

/**
 * Union type allowing both the full PrismaClient and the interactive transaction client.
 * This enables course selection functions to be used inside $transaction() callbacks
 * for race-condition-safe round creation.
 */
type DbClient = PrismaClient | PrismaTransaction;

const PHASE_ORDER = ["phase1", "phase2", "phase3"] as const;

function getCourseHistoryPhases(phase: string): string[] {
  const phaseIndex = PHASE_ORDER.indexOf(phase as (typeof PHASE_ORDER)[number]);
  if (phaseIndex === -1) return [phase];
  return PHASE_ORDER.slice(0, phaseIndex + 1);
}

/**
 * Fetch the ordered list of courses already played in the current phase.
 * Queries TTPhaseRound records sorted by roundNumber ascending.
 *
 * @param prisma - Prisma client instance
 * @param tournamentId - Tournament to query
 * @param phase - Phase stage ("phase1", "phase2", "phase3")
 * @returns Array of course abbreviations in play order
 */
export async function getPlayedCourses(
  prisma: DbClient,
  tournamentId: string,
  phase: string
): Promise<string[]> {
  const rounds = await prisma.tTPhaseRound.findMany({
    where: { tournamentId, phase },
    orderBy: { roundNumber: "asc" },
    select: { course: true },
  });

  return rounds.map((r) => r.course);
}

/**
 * Fetch played courses including adopted sudden-death courses.
 *
 * Course history is shared across TA finals phases. Asking for phase2 includes
 * phase1 and phase2 courses; asking for phase3 includes all finals phases up
 * through phase3. This prevents repeats such as KB1 appearing in both phase1
 * and phase2 before the 20-course cycle is exhausted.
 *
 * A sudden-death course is "adopted" as soon as its row exists; if an admin
 * changes an unresolved sudden-death course, the row is updated, so only the
 * final selected course remains in this history.
 */
export async function getPlayedCoursesWithSuddenDeath(
  prisma: DbClient,
  tournamentId: string,
  phase: string,
  options: { excludeSuddenDeathRoundId?: string } = {}
): Promise<string[]> {
  const phases = getCourseHistoryPhases(phase);
  const rounds = await prisma.tTPhaseRound.findMany({
    where: { tournamentId, phase: { in: phases } },
    orderBy: [{ phase: "asc" }, { roundNumber: "asc" }],
    select: {
      id: true,
      phase: true,
      course: true,
      roundNumber: true,
      suddenDeathRounds: {
        orderBy: { sequence: "asc" },
        select: { id: true, course: true },
      },
    },
  });

  const courses: string[] = [];
  const orderedRounds = [...rounds].sort((a, b) => {
    const phaseDiff = phases.indexOf(a.phase) - phases.indexOf(b.phase);
    return phaseDiff || a.roundNumber - b.roundNumber;
  });
  for (const round of orderedRounds) {
    courses.push(round.course);
    for (const suddenDeathRound of round.suddenDeathRounds ?? []) {
      if (suddenDeathRound.id !== options.excludeSuddenDeathRoundId) {
        courses.push(suddenDeathRound.course);
      }
    }
  }
  return courses;
}

/**
 * Determine which courses are still available in the current 20-course cycle.
 *
 * The cycle works as follows:
 * - Start with all 20 courses available
 * - Each played course is removed from the available pool
 * - When all 20 have been played, the cycle resets (all 20 available again)
 * - If 40 courses have been played, courses 21-40 form the second cycle, etc.
 *
 * This is a pure function (no DB access) for easy unit testing.
 *
 * @param playedCourses - All courses played so far in this phase (in order)
 * @returns Array of CourseAbbr that can be selected for the next round
 */
export function getAvailableCourses(playedCourses: string[]): CourseAbbr[] {
  const cycleSize = COURSES.length; // 20 courses per cycle

  // Determine which courses belong to the current cycle.
  // If 23 courses have been played total, the current cycle started at index 20,
  // so the current cycle contains courses at indices [20, 21, 22].
  const currentCycleStart =
    Math.floor(playedCourses.length / cycleSize) * cycleSize;
  const currentCycleCourses = playedCourses.slice(currentCycleStart);

  // Available = all 20 courses minus those already played in the current cycle
  const playedSet = new Set(currentCycleCourses);
  return COURSES.filter((c) => !playedSet.has(c));
}

export function selectRandomAvailableCourse(
  playedCourses: string[],
  previousCourse?: string | null
): CourseAbbr {
  const available = getAvailableCourses(playedCourses);
  if (available.length === 0) {
    throw new Error("No available courses");
  }
  const candidates =
    previousCourse && available.length > 1
      ? available.filter((course) => course !== previousCourse)
      : available;
  const pool = candidates.length > 0 ? candidates : available;
  return pool[Math.floor(Math.random() * pool.length)];
}

/**
 * Type guard: returns true if the given string is a known CourseAbbr.
 * Used to validate admin-specified manual course overrides before accepting them.
 *
 * @param value - The string to check
 * @returns true if value is a valid CourseAbbr, false otherwise
 */
export function isValidCourseAbbr(value: string): value is CourseAbbr {
  return (COURSES as readonly string[]).includes(value);
}

/**
 * Select a random course for the next round in a phase.
 *
 * Combines cumulative played-course history + getAvailableCourses to select a random
 * unplayed course from the current 20-course cycle.
 *
 * @param prisma - Prisma client instance
 * @param tournamentId - Tournament ID
 * @param phase - Phase stage ("phase1", "phase2", "phase3")
 * @returns A randomly selected CourseAbbr
 * @throws Error if no courses are available (should not happen with proper cycle reset)
 */
export async function selectRandomCourse(
  prisma: DbClient,
  tournamentId: string,
  phase: string
): Promise<CourseAbbr> {
  const playedCourses = await getPlayedCoursesWithSuddenDeath(prisma, tournamentId, phase);
  const available = getAvailableCourses(playedCourses);

  // Safety check: should never happen because getAvailableCourses resets at cycle boundary
  if (available.length === 0) {
    throw new Error(
      `No available courses for phase ${phase} in tournament ${tournamentId}. ` +
        `This should not happen — the cycle should auto-reset after 20 courses.`
    );
  }

  return selectRandomAvailableCourse(playedCourses, playedCourses[playedCourses.length - 1]);
}
