import { z } from "zod";

// Time format regex: MM:SS.mmm or M:SS.mmm
const timeFormatRegex = /^(\d{1,2}):(\d{2})\.(\d{1,3})$/;

// Time format validation schema
export const TimeStringSchema = z.string().refine(
  (val) => val === "" || timeFormatRegex.test(val),
  { message: "Invalid time format. Expected M:SS.mmm or MM:SS.mmm" }
);

export const TimesObjectSchema = z.record(z.string(), TimeStringSchema);

/**
 * Convert time string (MM:SS.mmm or M:SS.mmm) to milliseconds
 * @param time - Time string in format M:SS.mmm or MM:SS.mmm
 * @returns Milliseconds or null if invalid/empty
 */
export function timeToMs(time: string): number | null {
  if (!time || time === "") return null;

  const match = time.match(timeFormatRegex);
  if (!match) return null;

  const minutes = parseInt(match[1], 10);
  const seconds = parseInt(match[2], 10);
  const ms = match[3] || ''; // Handle missing milliseconds

  // Parse milliseconds as-is (don't pad or modify)
  // If empty, default to 0, otherwise parse the value
  const milliseconds = ms === '' ? 0 : parseInt(ms, 10);

  return minutes * 60 * 1000 + seconds * 1000 + milliseconds;
}

/**
 * Convert milliseconds to display time format (M:SS.mmm)
 * @param ms - Milliseconds to convert
 * @returns Formatted time string
 */
export function msToDisplayTime(ms: number | null): string {
  if (ms === null) return "-";
  
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  const milliseconds = ms % 1000;
  
  return `${minutes}:${seconds.toString().padStart(2, "0")}.${milliseconds.toString().padStart(3, "0")}`;
}

/**
 * Calculate total time for multiple course times
 * @param times - Record of course abbreviations to time strings
 * @returns Total milliseconds or null if any course time is invalid
 */
export function calculateTotalTime(times: Record<string, string> | null): number | null {
  if (!times) return null;
  
  let totalMs = 0;
  
  for (const time of Object.values(times)) {
    const ms = timeToMs(time);
    if (ms === null) return null;
    totalMs += ms;
  }
  
  return totalMs;
}

/**
 * Validate that all required courses have times entered
 * @param times - Record of course abbreviations to time strings
 * @returns True if all courses have valid times, false otherwise
 */
export function validateRequiredCourses(times: Record<string, string> | null, requiredCourses: string[]): boolean {
  if (!times) return false;
  
  for (const course of requiredCourses) {
    const time = times[course];
    if (!time || time === "") return false;
    const ms = timeToMs(time);
    if (ms === null) return false;
  }
  
  return true;
}
