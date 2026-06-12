/**
 * CDM workbook time encoding.
 *
 * The CDM template stores lap times as plain integers shaped
 * M*10000 + SS*100 + CC (minutes / seconds / centiseconds), e.g.
 * 1:10.34 → 11034 and 0:59.79 → 5979. The TT sheets decode this with
 * `INT(t/10000)*6000 + NUMBERVALUE(RIGHT(t,4))` so the encoding must keep
 * seconds+centiseconds in the last four digits. Writing milliseconds here
 * (the old exporter's bug) shifts every time by a factor of ~10.
 *
 * SMK itself is centisecond-precision; app times that carry milliseconds
 * are rounded half-up to centiseconds.
 */

import { timeToMs } from "@/lib/ta/time-utils";

/** Encode a duration in milliseconds as a CDM MSSCC integer. */
export function msToCdmTime(ms: number): number {
  if (!Number.isFinite(ms) || ms < 0) {
    throw new Error(`msToCdmTime: invalid duration ${ms}`);
  }
  const centis = Math.round(ms / 10);
  const minutes = Math.floor(centis / 6000);
  const rest = centis % 6000; // SS*100 + CC, always < 6000 so 4 digits max
  return minutes * 10000 + rest;
}

/**
 * Encode an app time string ("M:SS.cc" / "M:SS.ccc") as a CDM integer.
 * Returns null for missing or unparsable values so callers can clear the
 * cell instead of writing a bogus 0 (0 would rank as the fastest time).
 */
export function timeStringToCdmTime(value: unknown): number | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  const ms = timeToMs(value.trim());
  if (ms === null) return null;
  return msToCdmTime(ms);
}
