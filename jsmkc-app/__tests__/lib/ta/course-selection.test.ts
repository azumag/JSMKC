/**
 * Tests for TA Finals Random Course Selection
 *
 * Validates the "no repeat until all 20 used" rule:
 * - Each phase has its own independent 20-course cycle
 * - Courses are removed from the pool as they are played
 * - When all 20 are used, the cycle resets
 * - getAvailableCourses is a pure function for easy testing
 */

import { getAvailableCourses } from "@/lib/ta/course-selection";
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
