/**
 * TT Qualifications fill map — lap-time inputs only.
 *
 * The TT Qualifications sheet is fully formula-driven except for the 20
 * per-course lap-time cells of each finalist. Verified against the template
 * dump /tmp/cdm-analysis/sheet2025/sheet_TT_Qualifications.txt:
 *
 *   Header G1..Z1 = the 20 CDM_COURSES in order (MC1, DP1, … RR).
 *   A2/B2/C2 = #, FILTER(Registration[Nickname], TT="Yes"), XLOOKUP(... TT Order)
 *   E2/F2    = #, SORT(ANCHORARRAY(B2))   ← the displayed (sorted) nickname spill
 *   G2       = 11034, H2 = 13948, …       ← the only inputs (raw MSSCC integers)
 *   AA2..    = score conversions (formulas)
 *
 * F2 is `SORT(FILTER(Registration[Nickname], TT="Yes"))`, so row r (2-based)
 * holds the player at position (r-2) of the nicknames sorted case-insensitively
 * ascending. We reproduce that ordering with excelCaseInsensitiveCompare so each
 * player's times land on the row the sheet will display them on. (Excel SORT is
 * case-insensitive and stable; non-ASCII collation differences are a documented
 * known limitation — see docs/cdm-export-design.md §3.2.)
 *
 * We write ONLY G..Z (columns 7..26) for the player rows and clear the same
 * columns on the spare rows so a re-used template never keeps stale times.
 * E, F and AA.. are formulas and are never touched. A missing/empty course time
 * is cleared (not written as 0) because 0 would rank as the fastest time and the
 * sheet treats a blank as "no time".
 */

import { createLogger } from "@/lib/logger";
import {
  CDM_COURSES,
  TT_QUAL_FIRST_ROW,
  TT_QUAL_MAX_PLAYERS,
  TT_QUAL_FIRST_TIME_COLUMN,
  toColumnLetters,
} from "../cdm-constants";
import type { CdmCellWrite, CdmTournamentData, CdmTTEntry } from "../types";
import { timeStringToCdmTime } from "../time-format";
import {
  SheetWriteBuilder,
  excelCaseInsensitiveCompare,
} from "./sheet-player-order";

const logger = createLogger("cdm-export");

const SHEET = "TT Qualifications" as const;

/** Last input row of the 47-player table (rows 2..48). */
const TT_QUAL_LAST_ROW = TT_QUAL_FIRST_ROW + TT_QUAL_MAX_PLAYERS - 1; // 48

/** A1 column letters for the 20 course cells, indexed like CDM_COURSES. */
const COURSE_COLUMNS = CDM_COURSES.map((_, i) =>
  toColumnLetters(TT_QUAL_FIRST_TIME_COLUMN + i),
);

/**
 * Safely read TTEntry.times (typed `unknown`) as a course→string lookup.
 * Returns null when the field is absent or not an object, so callers clear the
 * row. Non-string values are ignored at read time (timeStringToCdmTime also
 * rejects them, yielding a cleared cell).
 */
function readTimes(entry: CdmTTEntry): Record<string, unknown> | null {
  const times = entry.times;
  if (times == null || typeof times !== "object") return null;
  return times as Record<string, unknown>;
}

export function buildTTQualificationWrites(
  data: CdmTournamentData,
): CdmCellWrite[] {
  const builder = new SheetWriteBuilder(SHEET);

  // Only qualification-stage entries appear in the TT Qualifications table;
  // phase1/2/3 entries belong to TT Finals. Sort by nickname (case-insensitive
  // ascending) to mirror the sheet's SORT(FILTER(...)) display order.
  const qualifiers = data.ttEntries
    .filter((e) => e.stage === "qualification")
    .sort((a, b) =>
      excelCaseInsensitiveCompare(a.player.nickname, b.player.nickname),
    );

  if (qualifiers.length > TT_QUAL_MAX_PLAYERS) {
    logger.warn("TT qualifiers exceed sheet capacity; truncating", {
      total: qualifiers.length,
      kept: TT_QUAL_MAX_PLAYERS,
    });
  }
  const kept = qualifiers.slice(0, TT_QUAL_MAX_PLAYERS);

  // --- Player rows: write/clear each course time -------------------------
  kept.forEach((entry, index) => {
    const row = TT_QUAL_FIRST_ROW + index;
    const times = readTimes(entry);
    CDM_COURSES.forEach((course, i) => {
      const ref = `${COURSE_COLUMNS[i]}${row}`;
      // timeStringToCdmTime returns null for missing/empty/unparsable values,
      // and setNumberOrClear turns that into a cell clear (never a bogus 0).
      const value = times ? timeStringToCdmTime(times[course]) : null;
      builder.setNumberOrClear(ref, value);
    });
  });

  // --- Spare rows: clear G..Z so stale times never survive a re-use ------
  for (let row = TT_QUAL_FIRST_ROW + kept.length; row <= TT_QUAL_LAST_ROW; row++) {
    for (const col of COURSE_COLUMNS) builder.clear(`${col}${row}`);
  }

  return builder.build();
}
