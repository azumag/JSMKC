import { TOTAL_COURSES } from "@/lib/constants";

export interface CourseCycleStatus {
  cycleNumber: number;
  playedInCycle: number;
  totalCourses: number;
  totalPlayed: number;
}

export function getCourseCycleStatus(playedCourses: string[]): CourseCycleStatus {
  const totalPlayed = playedCourses.length;
  const playedInCycle = totalPlayed % TOTAL_COURSES;

  return {
    cycleNumber: Math.floor(totalPlayed / TOTAL_COURSES) + 1,
    playedInCycle,
    totalCourses: TOTAL_COURSES,
    // The UI displays the server-calculated availableCourses.length instead of
    // duplicating that derived value here, so this helper only exposes cycle progress.
    totalPlayed,
  };
}
