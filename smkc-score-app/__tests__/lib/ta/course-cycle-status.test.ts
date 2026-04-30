import { COURSES } from "@/lib/constants";
import { getCourseCycleStatus } from "@/lib/ta/course-cycle-status";

describe("getCourseCycleStatus", () => {
  it("starts at cycle 1 with no courses played", () => {
    expect(getCourseCycleStatus([])).toEqual({
      cycleNumber: 1,
      playedInCycle: 0,
      totalCourses: 20,
      availableCount: 20,
      totalPlayed: 0,
    });
  });

  it("tracks progress within the first 20-course cycle", () => {
    expect(getCourseCycleStatus(COURSES.slice(0, 11))).toEqual({
      cycleNumber: 1,
      playedInCycle: 11,
      totalCourses: 20,
      availableCount: 9,
      totalPlayed: 11,
    });
  });

  it("moves to the next cycle after exactly 20 courses", () => {
    expect(getCourseCycleStatus([...COURSES])).toEqual({
      cycleNumber: 2,
      playedInCycle: 0,
      totalCourses: 20,
      availableCount: 20,
      totalPlayed: 20,
    });
  });

  it("tracks progress within later cycles", () => {
    const played = [...COURSES, "BC3", "CI1", "DP3", "MC2", "GV2", "KB2", "MC1"];

    expect(getCourseCycleStatus(played)).toEqual({
      cycleNumber: 2,
      playedInCycle: 7,
      totalCourses: 20,
      availableCount: 13,
      totalPlayed: 27,
    });
  });
});
