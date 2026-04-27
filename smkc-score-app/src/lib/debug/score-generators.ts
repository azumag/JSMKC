/**
 * Random score generators for debug-mode tournaments.
 *
 * These produce values that pass the canonical validators in
 * `score-validation.ts` for each mode. Used by the debug-fill API
 * endpoints to populate qualification scores in test/demo tournaments.
 *
 * Each generator is a pure function of Math.random(); test coverage
 * fuzzes 100 trials per generator to catch any drift from validators.
 */

import {
  COURSE_INFO,
  CourseAbbr,
  COURSES,
  TOTAL_BM_ROUNDS,
  TOTAL_MR_RACES,
  TOTAL_GP_RACES,
  getDriverPoints,
} from '@/lib/constants';
import { generateRandomTimeString } from '@/lib/ta/time-utils';

function randInt(min: number, maxInclusive: number): number {
  return Math.floor(Math.random() * (maxInclusive - min + 1)) + min;
}

function shuffle<T>(arr: readonly T[]): T[] {
  const copy = arr.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/**
 * BM qualification score: pick uniformly at random from the 5 valid (sum=4) outcomes.
 * 0-0 cleared-match values are intentionally excluded — debug fill should produce
 * complete matches that affect standings.
 */
export function generateBMScore(): { score1: number; score2: number } {
  const score1 = randInt(0, TOTAL_BM_ROUNDS);
  return { score1, score2: TOTAL_BM_ROUNDS - score1 };
}

/**
 * MR qualification score + per-round winner array. The rounds entries map each
 * assigned course to the player who won it; the winner counts must equal score1/score2.
 *
 * Course assignment order is preserved (matches what the qualification setup recorded
 * in `match.assignedCourses`); the winner sequence is shuffled so that, e.g., a 3-1
 * result doesn't always give player 1 the first three races.
 */
export function generateMRScore(assignedCourses: string[]): {
  score1: number;
  score2: number;
  rounds: { course: string; winner: 1 | 2 }[];
} {
  const totalRaces = assignedCourses.length || TOTAL_MR_RACES;
  const score1 = randInt(0, totalRaces);
  const score2 = totalRaces - score1;
  // Build a winner sequence with the right counts then shuffle it.
  const winners: (1 | 2)[] = [
    ...Array<1>(score1).fill(1),
    ...Array<2>(score2).fill(2),
  ];
  const shuffled = shuffle(winners);
  const rounds = assignedCourses.map((course, i) => ({
    course,
    winner: shuffled[i],
  }));
  return { score1, score2, rounds };
}

/** Helper: courses belonging to a given cup, in official round order. */
function coursesForCup(cup: string): string[] {
  return COURSE_INFO.filter((c) => c.cup === cup).map((c) => c.abbr);
}

/**
 * GP qualification: 5 races for the given cup. Each race picks two distinct
 * positions in [1,8]; driver points are derived via `getDriverPoints`.
 *
 * Position 0 (legacy game-over) is intentionally not generated — it represents
 * an exceptional manual entry, not a normal race result.
 */
export function generateGPRaces(cup: string): {
  course: string;
  position1: number;
  position2: number;
  points1: number;
  points2: number;
}[] {
  const courses = coursesForCup(cup);
  if (courses.length !== TOTAL_GP_RACES) {
    throw new Error(`Cup ${cup} has ${courses.length} courses, expected ${TOTAL_GP_RACES}`);
  }
  return courses.map((course) => {
    const position1 = randInt(1, 8);
    let position2 = randInt(1, 8);
    // Two human players cannot share a finishing position (per gp-config validation).
    while (position2 === position1) {
      position2 = randInt(1, 8);
    }
    return {
      course,
      position1,
      position2,
      points1: getDriverPoints(position1),
      points2: getDriverPoints(position2),
    };
  });
}

/**
 * TA qualification: 20 random course times in M:SS.mm format.
 * Reuses the existing `generateRandomTimeString` so the dev/debug paths
 * stay consistent. Caller is responsible for routing the result through
 * the existing PUT endpoint (which recomputes totalTime + ranks).
 */
export function generateTATimes(): Record<CourseAbbr, string> {
  const out = {} as Record<CourseAbbr, string>;
  for (const course of COURSES) {
    out[course] = generateRandomTimeString();
  }
  return out;
}
