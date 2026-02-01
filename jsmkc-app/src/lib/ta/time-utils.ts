/**
 * Time Attack (TA) Time Utility Functions
 *
 * Provides conversion and validation utilities for time strings used in the
 * Time Attack competition mode. Times are represented in the format M:SS.mmm
 * (or MM:SS.mmm) where M/MM = minutes, SS = seconds, mmm = milliseconds.
 *
 * These utilities are used throughout the TA module for:
 * - Parsing user-entered time strings into comparable millisecond values
 * - Converting stored millisecond values back to display format
 * - Calculating total times across all 20 courses
 * - Validating that all required courses have valid time entries
 */

import { z } from "zod";

/**
 * Regular expression for matching valid time format strings.
 * Accepts M:SS.mmm or MM:SS.mmm where:
 * - M/MM: 1-2 digit minutes
 * - SS: exactly 2 digit seconds
 * - mmm: 1-3 digit milliseconds
 */
const timeFormatRegex = /^(\d{1,2}):(\d{2})\.(\d{1,3})$/;

/**
 * Zod schema for validating a single time string.
 * Accepts either an empty string (no time entered) or a string matching
 * the M:SS.mmm / MM:SS.mmm format. This allows partial form submissions
 * where not all courses have times entered yet.
 */
export const TimeStringSchema = z.string().refine(
  (val) => val === "" || timeFormatRegex.test(val),
  { message: "Invalid time format. Expected M:SS.mmm or MM:SS.mmm" }
);

/**
 * Zod schema for validating a record of course abbreviations to time strings.
 * Used to validate the entire times object submitted for a player entry,
 * where keys are course abbreviations (e.g., "MC", "GV") and values are
 * time strings or empty strings.
 */
export const TimesObjectSchema = z.record(z.string(), TimeStringSchema);

/**
 * Convert a time string (MM:SS.mmm or M:SS.mmm) to milliseconds.
 *
 * The conversion formula is: minutes * 60000 + seconds * 1000 + milliseconds.
 * Milliseconds are right-padded with zeros to 3 digits, so "1:23.4" yields
 * 1*60000 + 23*1000 + 400 = 83400ms.
 *
 * @param time - Time string in format M:SS.mmm or MM:SS.mmm
 * @returns Total milliseconds, or null if the input is empty/invalid
 */
export function timeToMs(time: string): number | null {
  // Return null for empty or falsy inputs, allowing partial form submissions
  if (!time || time === "") return null;

  const match = time.match(timeFormatRegex);
  if (!match) return null;

  const minutes = parseInt(match[1], 10);
  const seconds = parseInt(match[2], 10);
  let ms = match[3] || ''; // Handle missing milliseconds

  // Pad milliseconds to 3 digits for accurate comparison (e.g., "4" -> "400", "45" -> "450")
  while (ms.length < 3) ms += '0';
  const milliseconds = ms === '' ? 0 : parseInt(ms, 10);

  return minutes * 60 * 1000 + seconds * 1000 + milliseconds;
}

/**
 * Convert milliseconds to a human-readable display time format (M:SS.mmm).
 *
 * Output format: "M:SS.mmm" where seconds are zero-padded to 2 digits
 * and milliseconds are zero-padded to 3 digits.
 * Example: 83456ms -> "1:23.456"
 *
 * @param ms - Milliseconds to convert
 * @returns Formatted time string, or "-" if input is null
 */
export function msToDisplayTime(ms: number | null): string {
  // Return dash for null values (no time recorded)
  if (ms === null) return "-";

  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  const milliseconds = ms % 1000;

  return `${minutes}:${seconds.toString().padStart(2, "0")}.${milliseconds.toString().padStart(3, "0")}`;
}

/**
 * Calculate the total time across multiple course times.
 *
 * Sums up all time values from the provided record. If any single course
 * time is invalid or missing, returns null to indicate an incomplete entry.
 * This ensures that total time rankings only include players who have
 * completed all courses.
 *
 * @param times - Record of course abbreviations to time strings
 * @returns Total milliseconds across all courses, or null if any course time is invalid
 */
export function calculateTotalTime(times: Record<string, string> | null): number | null {
  if (!times) return null;

  let totalMs = 0;

  for (const time of Object.values(times)) {
    const ms = timeToMs(time);
    // If any single time is invalid, the total is invalid
    if (ms === null) return null;
    totalMs += ms;
  }

  return totalMs;
}

/**
 * Validate that all required courses have valid times entered.
 *
 * Checks each required course against the provided times record.
 * A course passes validation if it has a non-empty string that
 * successfully parses to a millisecond value.
 *
 * @param times - Record of course abbreviations to time strings
 * @param requiredCourses - Array of course abbreviation strings that must have valid times
 * @returns True if all required courses have valid times, false otherwise
 */
export function validateRequiredCourses(times: Record<string, string> | null, requiredCourses: string[]): boolean {
  if (!times) return false;

  for (const course of requiredCourses) {
    const time = times[course];
    // Check that the time exists and is not empty
    if (!time || time === "") return false;
    // Check that the time can be parsed to milliseconds
    const ms = timeToMs(time);
    if (ms === null) return false;
  }

  return true;
}
