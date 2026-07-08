/**
 * Tests for TA Finals Random Course Selection
 *
 * Validates the "no repeat until all 20 used" rule:
 * - Finals phases share one 20-course cycle in phase order
 * - Courses are removed from the pool as they are played
 * - When all 20 are used, the cycle resets
 * - getAvailableCourses is a pure function for easy testing
 */

import {
  getAvailableCourses,
  getPlayedCoursesWithSuddenDeath,
  isValidCourseAbbr,
  selectRandomCourse,
  selectRandomAvailableCourse,
} from "@/lib/ta/course-selection";
import { COURSES } from "@/lib/constants";

describe("getAvailableCourses", () => {
  it("returns all 20 courses when none have been played", () => {
    // At the start of a phase, all courses should be available
    const available = getAvailableCourses([]);
    expect(available).toHaveLength(20);
    expect(available).toEqual([...COURSES]);
  });

  it("excludes played courses from available pool", () => {
    // After playing MC1 and DP1, they should be excluded
    const played = ["MC1", "DP1"];
    const available = getAvailableCourses(played);
    expect(available).toHaveLength(18);
    expect(available).not.toContain("MC1");
    expect(available).not.toContain("DP1");
  });

  it("returns exactly 1 course when 19 have been played", () => {
    // Only the last unplayed course should remain
    const played = COURSES.slice(0, 19);
    const available = getAvailableCourses(played);
    expect(available).toHaveLength(1);
    expect(available[0]).toBe(COURSES[19]); // KB1
  });

  it("resets cycle after all 20 courses have been played", () => {
    // After playing all 20, the full pool should be available again
    const played = [...COURSES];
    const available = getAvailableCourses(played);
    expect(available).toHaveLength(20);
    expect(available).toEqual([...COURSES]);
  });

  it("handles second cycle correctly (21 courses played)", () => {
    // After 20 courses + 1 more, only that 1 should be excluded from the new cycle
    const played = [...COURSES, "MC1"];
    const available = getAvailableCourses(played);
    expect(available).toHaveLength(19);
    expect(available).not.toContain("MC1");
  });

  it("handles multiple full cycles (40 courses played)", () => {
    // After exactly 2 full cycles, all should be available again
    const played = [...COURSES, ...COURSES];
    const available = getAvailableCourses(played);
    expect(available).toHaveLength(20);
    expect(available).toEqual([...COURSES]);
  });

  it("correctly tracks partial second cycle", () => {
    // 20 + 5 = 25 courses played, second cycle has 5 used
    const played = [...COURSES, "MC1", "DP1", "GV1", "BC1", "MC2"];
    const available = getAvailableCourses(played);
    expect(available).toHaveLength(15);
    expect(available).not.toContain("MC1");
    expect(available).not.toContain("DP1");
    expect(available).not.toContain("GV1");
    expect(available).not.toContain("BC1");
    expect(available).not.toContain("MC2");
    // DP2 onwards should still be available
    expect(available).toContain("DP2");
  });

  it("handles duplicate courses in played list within a cycle", () => {
    // If the same course appears twice in a cycle (shouldn't happen in normal operation
    // but the Set-based deduplication handles it gracefully).
    // 2 entries in played → still in first cycle (index 0-19), Set deduplicates to 1 unique.
    const played = ["MC1", "MC1"];
    const available = getAvailableCourses(played);
    expect(available).toHaveLength(19);
    expect(available).not.toContain("MC1");
  });
});

describe("isValidCourseAbbr", () => {
  it("returns true for a valid course abbreviation", () => {
    // COURSES[0] is MC1; it should be recognized as a valid CourseAbbr
    expect(isValidCourseAbbr("MC1")).toBe(true);
  });

  it("returns true for the last course in the list", () => {
    // Validate boundary: KB1 is the last of the 20 courses
    expect(isValidCourseAbbr(COURSES[COURSES.length - 1])).toBe(true);
  });

  it("returns false for an invalid abbreviation", () => {
    // Completely unknown string should be rejected
    expect(isValidCourseAbbr("INVALID")).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(isValidCourseAbbr("")).toBe(false);
  });

  it("returns false for a lowercase version of a valid abbreviation", () => {
    // Course abbreviations are case-sensitive; "mc1" is not in the list
    expect(isValidCourseAbbr("mc1")).toBe(false);
  });
});

describe("selectRandomAvailableCourse", () => {
  const originalRandom = Math.random;

  afterEach(() => {
    Math.random = originalRandom;
  });

  it("avoids the immediately previous course when more than one course is available", () => {
    Math.random = jest.fn().mockReturnValue(0);

    const course = selectRandomAvailableCourse(["MC1"], "DP1");

    expect(course).not.toBe("DP1");
    // Math.random=0 picks index 0; after MC1 is played and DP1 is excluded as
    // the immediately previous course, GV1 is the first remaining candidate.
    expect(course).toBe("GV1");
  });

  it("allows the previous course when it is the only available course in the cycle", () => {
    Math.random = jest.fn().mockReturnValue(0);

    const lastCourse = COURSES[COURSES.length - 1];
    const course = selectRandomAvailableCourse(COURSES.slice(0, -1), lastCourse);

    expect(course).toBe(lastCourse);
  });
});

describe("selectRandomCourse", () => {
  const originalRandom = Math.random;

  afterEach(() => {
    Math.random = originalRandom;
  });

  it("keeps regular rounds on the immediate-repeat avoidance path", async () => {
    Math.random = jest.fn().mockReturnValue(0);
    const prisma = {
      tTPhaseRound: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: "p1-r1",
            phase: "phase1",
            roundNumber: 1,
            course: "MC1",
            suddenDeathRounds: [],
          },
          {
            id: "p1-r2",
            phase: "phase1",
            roundNumber: 2,
            course: "DP1",
            suddenDeathRounds: [],
          },
        ]),
      },
    };

    const selected = await selectRandomCourse(prisma as any, "t1", "phase1");

    // Both MC1 and DP1 were played in this cycle so both must be excluded.
    // Not asserting exact "GV1" to avoid coupling to COURSES array order (#2351).
    // Positive inclusion check ensures the result is a real course, not garbage (#2437).
    // If selected ∈ validCandidates (which excludes MC1 and DP1), the not.toBe assertions are implied.
    const validCandidates = COURSES.filter((c) => c !== "MC1" && c !== "DP1");
    expect(validCandidates).toContain(selected);
  });
});

describe("getPlayedCoursesWithSuddenDeath", () => {
  it("carries course history forward from phase1 to phase2", async () => {
    const prisma = {
      tTPhaseRound: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: "p2-r1",
            phase: "phase2",
            roundNumber: 1,
            course: "DP1",
            suddenDeathRounds: [],
          },
          {
            id: "p1-r1",
            phase: "phase1",
            roundNumber: 1,
            course: "KB1",
            suddenDeathRounds: [],
          },
        ]),
      },
    };

    const played = await getPlayedCoursesWithSuddenDeath(prisma as any, "t1", "phase2");

    expect(prisma.tTPhaseRound.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tournamentId: "t1", phase: { in: ["phase1", "phase2"] } },
        orderBy: [{ roundNumber: "asc" }],
      })
    );
    expect(played).toEqual(["KB1", "DP1"]);
    expect(getAvailableCourses(played)).not.toContain("KB1");
  });

  it("counts sudden-death courses from earlier phases as consumed", async () => {
    const prisma = {
      tTPhaseRound: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: "p1-r1",
            phase: "phase1",
            roundNumber: 1,
            course: "MC1",
            suddenDeathRounds: [
              { id: "sd1", course: "KB1" },
            ],
          },
          {
            id: "p2-r1",
            phase: "phase2",
            roundNumber: 1,
            course: "DP1",
            suddenDeathRounds: [],
          },
        ]),
      },
    };

    const played = await getPlayedCoursesWithSuddenDeath(prisma as any, "t1", "phase2");

    expect(played).toEqual(["MC1", "KB1", "DP1"]);
    expect(getAvailableCourses(played)).not.toContain("KB1");
  });

  it("keeps a Phase1 sudden-death course unavailable at Phase2 start", async () => {
    const prisma = {
      tTPhaseRound: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: "p1-r1",
            phase: "phase1",
            roundNumber: 1,
            course: "MC1",
            suddenDeathRounds: [
              { id: "sd1", course: "KB1" },
            ],
          },
          {
            id: "p1-r2",
            phase: "phase1",
            roundNumber: 2,
            course: "DP1",
            suddenDeathRounds: [],
          },
          {
            id: "p1-r3",
            phase: "phase1",
            roundNumber: 3,
            course: "GV1",
            suddenDeathRounds: [],
          },
          {
            id: "p1-r4",
            phase: "phase1",
            roundNumber: 4,
            course: "BC1",
            suddenDeathRounds: [],
          },
        ]),
      },
    };

    const played = await getPlayedCoursesWithSuddenDeath(prisma as any, "t1", "phase2");
    const available = getAvailableCourses(played);

    expect(played).toEqual(["MC1", "KB1", "DP1", "GV1", "BC1"]);
    expect(available).toHaveLength(15);
    expect(available).not.toContain("KB1");
  });

  it("excludes an unresolved sudden-death round when changing that course", async () => {
    const prisma = {
      tTPhaseRound: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: "p1-r1",
            phase: "phase1",
            roundNumber: 1,
            course: "MC1",
            suddenDeathRounds: [
              { id: "sd-old", course: "KB1" },
              { id: "sd-current", course: "DP1" },
            ],
          },
        ]),
      },
    };

    const played = await getPlayedCoursesWithSuddenDeath(prisma as any, "t1", "phase1", {
      excludeSuddenDeathRoundId: "sd-current",
    });

    expect(played).toEqual(["MC1", "KB1"]);
    expect(played).not.toContain("DP1");
  });

  /* Regression for issue #2773: a life-loss tiebreak re-runs the base round's
   * course. That re-run must not be double-counted, or the duplicated entry
   * would shift the 20-course cycle boundary in getAvailableCourses (the cycle
   * is derived from list length) and retire a course one round too early. */
  it("does not double-count a life-loss sudden death that re-runs the base course", async () => {
    const prisma = {
      tTPhaseRound: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: "p3-r1",
            phase: "phase3",
            roundNumber: 1,
            course: "MC1",
            // Life-loss re-run on the same course, then a bronze race on DP1.
            suddenDeathRounds: [
              { id: "sd-rerun", course: "MC1", kind: "life_loss" },
              { id: "sd-bronze", course: "DP1", kind: "bronze" },
            ],
          },
        ]),
      },
    };

    const played = await getPlayedCoursesWithSuddenDeath(prisma as any, "t1", "phase3");

    // MC1 appears exactly once (base round); the fresh bronze course counts.
    expect(played).toEqual(["MC1", "DP1"]);
    expect(getAvailableCourses(played)).toHaveLength(18);
  });

  /* Regression for issue #2775: before the `kind` field was persisted, a
   * life-loss re-run was inferred purely from "sudden-death course === base
   * round course". A revival/bronze sudden death that coincidentally draws
   * the same course as the base round (possible right at a 20-course cycle
   * reset) would be misclassified as a life-loss re-run and silently dropped
   * from the played-course count, shifting the cycle boundary. */
  it("still counts a revival/bronze sudden death that coincidentally draws the base round's course", async () => {
    const prisma = {
      tTPhaseRound: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: "p3-r1",
            phase: "phase3",
            roundNumber: 1,
            course: "MC1",
            suddenDeathRounds: [{ id: "sd-revival", course: "MC1", kind: "revival" }],
          },
        ]),
      },
    };

    const played = await getPlayedCoursesWithSuddenDeath(prisma as any, "t1", "phase3");

    expect(played).toEqual(["MC1", "MC1"]);
    expect(getAvailableCourses(played)).toHaveLength(19);
  });
});
