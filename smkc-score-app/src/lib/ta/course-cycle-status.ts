import { TOTAL_COURSES } from "@/lib/constants";

export interface CourseCycleStatus {
  cycleNumber: number;
  playedInCycle: number;
  totalCourses: number;
  availableCount: number;
  totalPlayed: number;
}

export function getCourseCycleStatus(playedCourses: string[]): CourseCycleStatus {
  const totalPlayed = playedCourses.length;
  const playedInCycle = totalPlayed % TOTAL_COURSES;

  return {
    cycleNumber: Math.floor(totalPlayed / TOTAL_COURSES) + 1,
    playedInCycle,
    totalCourses: TOTAL_COURSES,
    availableCount: TOTAL_COURSES - playedInCycle,
    totalPlayed,
  };
}
