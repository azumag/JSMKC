/**
 * Time Attack (TA) Time Utility Functions
 *
 * Provides conversion and validation utilities for time strings used in the
 * Time Attack competition mode. Times are displayed in the format M:SS.mm
 * (or MM:SS.mm) where M/MM = minutes, SS = seconds, mm = centiseconds.
 * Legacy 3-digit fractional inputs are still accepted for compatibility.
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
 * Accepts M:SS.mm or MM:SS.mm as the official display format.
 * Also accepts legacy 3-digit fractional input for backward compatibility.
 * Fractional digits are interpreted as:
 * - M/MM: 1-2 digit minutes
 * - SS: exactly 2 digit seconds
 * - fraction: 1-3 digits after the decimal point
 */
const timeFormatRegex = /^(\d{1,2}):(\d{2})\.(\d{1,3})$/;

/**
 * Zod schema for validating a single time string.
 * Accepts either an empty string (no time entered) or a string matching
 * the M:SS.mm / MM:SS.mm format. This allows partial form submissions
 * where not all courses have times entered yet.
 */
export const TimeStringSchema = z.string().refine(
  (val) => val === "" || timeFormatRegex.test(val),
  { message: "Invalid time format. Expected M:SS.mm or MM:SS.mm" }
);

/**
 * Zod schema for validating a record of course abbreviations to time strings.
 * Used to validate the entire times object submitted for a player entry,
 * where keys are course abbreviations (e.g., "MC", "GV") and values are
 * time strings or empty strings.
 */
export const TimesObjectSchema = z.record(z.string(), TimeStringSchema);

/**
 * Convert a time string (MM:SS.mm / M:SS.mm) to milliseconds.
 *
 * The conversion formula is: minutes * 60000 + seconds * 1000 + milliseconds.
 * Milliseconds are right-padded with zeros to 3 digits, so "1:23.4" yields
 * 1*60000 + 23*1000 + 400 = 83400ms.
 *
 * @param time - Time string in format M:SS.mm / MM:SS.mm
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
  const milliseconds = parseInt(ms, 10);

  return minutes * 60 * 1000 + seconds * 1000 + milliseconds;
}

/**
 * Convert milliseconds to a human-readable display time format (M:SS.mm).
 *
 * Output format: "M:SS.mm" where seconds are zero-padded to 2 digits
 * and centiseconds are zero-padded to 2 digits.
 * Example: 83456ms -> "1:23.46"
 *
 * @param ms - Milliseconds to convert
 * @returns Formatted time string, or "-" if input is null
 */
export function msToDisplayTime(ms: number | null): string {
  // Return dash for null values (no time recorded)
  if (ms === null) return "-";

  const roundedCentiseconds = Math.round(ms / 10);
  const totalSeconds = Math.floor(roundedCentiseconds / 100);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const centiseconds = roundedCentiseconds % 100;

  return `${minutes}:${seconds.toString().padStart(2, "0")}.${centiseconds.toString().padStart(2, "0")}`;
}

/**
 * Auto-format a raw time input string into M:SS.mm display format.
 *
 * Handles various user input patterns:
 * - Already formatted ("1:23.45" / legacy "1:23.456") → normalized to display format
 * - Digits only ("12345") → interpreted positionally then normalized
 * - Partial digits ("58490") → normalized to "0:58.49"
 * - With colon but no dot ("1:23") → "1:23.00"
 * - With dot but no colon ("123.456") → parsed then normalized
 *
 * Returns the original string unchanged if already valid or empty.
 * Returns null if input cannot be interpreted as a valid time.
 */
export function autoFormatTime(input: string): string | null {
  if (!input || input.trim() === "") return "";

  const trimmed = input.trim();
  const normalizeFormattedTime = (formatted: string): string | null => {
    const milliseconds = timeToMs(formatted);
    return milliseconds === null ? null : msToDisplayTime(milliseconds);
  };

  /* Already valid M:SS.mm or legacy M:SS.mmm — normalize to the standard display format */
  if (timeFormatRegex.test(trimmed)) return normalizeFormattedTime(trimmed);

  /* Has colon but no dot (e.g., "1:23") — append .00 */
  const colonNoDot = /^(\d{1,2}):(\d{2})$/.exec(trimmed);
  if (colonNoDot) return `${colonNoDot[1]}:${colonNoDot[2]}.00`;

  /* Digits only — interpret positionally as MSSMMM (right-aligned milliseconds).
   * Pad to 6 digits minimum: e.g., "1122" → "001122" → 0:11.22
   * "58490" → "058490" → 0:58.49, "123456" → 1:23.46 */
  const digitsOnly = /^\d+$/.exec(trimmed);
  if (digitsOnly) {
    const padded = trimmed.padStart(6, "0");
    /* Split: first N-5 chars = minutes, next 2 = seconds, last 3 = ms */
    const msStr = padded.slice(-3);
    const ssStr = padded.slice(-5, -3);
    const mmStr = padded.slice(0, -5) || "0";

    const minutes = parseInt(mmStr, 10);
    const seconds = parseInt(ssStr, 10);
    if (seconds >= 60) return null; /* Invalid seconds */

    return normalizeFormattedTime(`${minutes}:${seconds.toString().padStart(2, "0")}.${msStr}`);
  }

  /* Has dot but no colon (e.g., "123.456") — try to split at dot */
  const dotNoColon = /^(\d{1,3})\.(\d{1,3})$/.exec(trimmed);
  if (dotNoColon) {
    const beforeDot = dotNoColon[1];
    const afterDot = dotNoColon[2].padEnd(3, "0").slice(0, 3);
    if (beforeDot.length <= 1) {
      /* e.g., "1.234" → "0:01.23" after normalization */
      return normalizeFormattedTime(`0:${beforeDot.padStart(2, "0")}.${afterDot}`);
    }
    /* e.g., "58.490" → "0:58.49", "123.456" → "1:23.46" */
    const ss = beforeDot.slice(-2);
    const mm = beforeDot.slice(0, -2) || "0";
    const seconds = parseInt(ss, 10);
    if (seconds >= 60) return null;
    return normalizeFormattedTime(`${parseInt(mm, 10)}:${ss}.${afterDot}`);
  }

  return null;
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
 * Generate a random time string in M:SS.mm format within a given range.
 * Used by dev-only "Fill Random Times" buttons to accelerate manual testing
 * of qualification and elimination flows.
 *
 * @param minMs - Minimum time in milliseconds (default: 45000 = 0:45.000)
 * @param maxMs - Maximum time in milliseconds (default: 210000 = 3:30.000)
 * @returns Random time string in M:SS.mm format
 */
export function generateRandomTimeString(minMs = 45000, maxMs = 210000): string {
  const randomMs = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
  return msToDisplayTime(randomMs);
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
