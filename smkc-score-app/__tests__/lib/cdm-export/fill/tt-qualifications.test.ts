/**
 * Tests for the TT Qualifications fill map (lap-time inputs only).
 *
 * Ground truth: /tmp/cdm-analysis/sheet2025/sheet_TT_Qualifications.txt
 *   - Header G1..Z1 = the 20 CDM_COURSES in order (MC1..RR).
 *   - A2/B2/C2/E2/F2 are dynamic-array formulas (the # / nickname / seeding
 *     spills) and AA2.. are the score conversions — none are inputs.
 *   - G2 = 11034, H2 = 13948 … are the raw MSSCC time integers we write.
 *   - Row r hosts the player at position (r-2) of SORT(FILTER(Registration
 *     [Nickname], TT="Yes")), i.e. nicknames case-insensitive ascending.
 *
 * The fill map therefore only writes G..Z (cols 7..26) for rows 2..48 and
 * clears the unused course cells; E/F/AA+ must never be touched.
 */

import { buildTTQualificationWrites } from "@/lib/cdm-export/fill/tt-qualifications";
import { CDM_COURSES } from "@/lib/cdm-export/cdm-constants";
import type {
  CdmTTEntry,
  CdmPlayer,
  CdmTournamentData,
} from "@/lib/cdm-export/types";
import {
  indexWrites,
  expectNumber,
  expectClear,
  expectUntouched,
  writtenRefs,
} from "./write-helpers";

const SHEET = "TT Qualifications" as const;

function player(id: string, nickname: string, name = nickname): CdmPlayer {
  return { id, name, nickname };
}

function ttEntry(
  p: CdmPlayer,
  stage: string,
  times: Record<string, string> | null = null,
): CdmTTEntry {
  return {
    player: p,
    playerId: p.id,
    stage,
    seeding: null,
    lives: 3,
    eliminated: false,
    times,
  };
}

function emptyData(over: Partial<CdmTournamentData> = {}): CdmTournamentData {
  return {
    name: "T",
    date: new Date("2025-01-01"),
    bmQualifications: [],
    mrQualifications: [],
    gpQualifications: [],
    bmMatches: [],
    mrMatches: [],
    gpMatches: [],
    ttEntries: [],
    ttPhaseRounds: [],
    ...over,
  };
}

/** Column letter for the i-th course (0-based): G=7, H=8, …, Z=26. */
function courseCol(i: number): string {
  return String.fromCharCode("G".charCodeAt(0) + i);
}

describe("buildTTQualificationWrites — row placement", () => {
  it("places players on rows 2.. by nickname case-insensitive ascending", () => {
    const zoe = player("p1", "zoe");
    const alex = player("p2", "Alex");
    const data = emptyData({
      ttEntries: [
        ttEntry(zoe, "qualification", { MC1: "1:10.34" }),
        ttEntry(alex, "qualification", { MC1: "0:59.79" }),
      ],
    });
    const map = indexWrites(buildTTQualificationWrites(data), SHEET);
    // "Alex" < "zoe" case-insensitively -> Alex on row 2, zoe on row 3.
    expectNumber(map, "G2", 5979); // Alex MC1 = 0:59.79 -> 5979
    expectNumber(map, "G3", 11034); // zoe MC1 = 1:10.34 -> 11034
  });

  it("only considers stage=qualification entries (ignores phase1/2/3)", () => {
    const a = player("p1", "Aaa");
    const b = player("p2", "Bbb");
    const data = emptyData({
      ttEntries: [
        ttEntry(a, "qualification", { MC1: "0:10.00" }),
        ttEntry(b, "phase1", { MC1: "0:10.00" }), // not a qualification row
      ],
    });
    const writes = buildTTQualificationWrites(data);
    const map = indexWrites(writes, SHEET);
    // a's qualification time written on row 2; b never appears as a data value.
    expectNumber(map, "G2", 1000); // 0:10.00 -> 10s = 1000 centiseconds encoded
    // Only one player's worth of times: G3 must be a *clear* (spare row), not a value.
    expectClear(map, "G3");
  });
});

describe("buildTTQualificationWrites — course columns G..Z", () => {
  it("writes each course time in CDM_COURSES column order", () => {
    const a = player("p1", "Aaa");
    // Provide a distinct time per course so each column is checkable.
    // 0:10.cc -> 10s + cc centiseconds = 1000 + cc encoded (minutes=0).
    const times: Record<string, string> = {};
    CDM_COURSES.forEach((c, i) => {
      const cc = String(i).padStart(2, "0");
      times[c] = `0:10.${cc}`;
    });
    const data = emptyData({ ttEntries: [ttEntry(a, "qualification", times)] });
    const map = indexWrites(buildTTQualificationWrites(data), SHEET);
    CDM_COURSES.forEach((c, i) => {
      expectNumber(map, `${courseCol(i)}2`, 1000 + i);
    });
  });

  it("clears a course cell when that course time is missing or empty", () => {
    const a = player("p1", "Aaa");
    const data = emptyData({
      ttEntries: [ttEntry(a, "qualification", { MC1: "0:10.00", DP1: "" })],
    });
    const map = indexWrites(buildTTQualificationWrites(data), SHEET);
    expectNumber(map, "G2", 1000); // MC1 present
    expectClear(map, "H2"); // DP1 empty string -> clear, not 0
    expectClear(map, "I2"); // GV1 absent key -> clear
  });

  it("clears every course column when the entry has no times object", () => {
    const a = player("p1", "Aaa");
    const data = emptyData({ ttEntries: [ttEntry(a, "qualification", null)] });
    const map = indexWrites(buildTTQualificationWrites(data), SHEET);
    for (let i = 0; i < CDM_COURSES.length; i++) {
      expectClear(map, `${courseCol(i)}2`);
    }
  });
});

describe("buildTTQualificationWrites — formula cells and bounds", () => {
  it("never writes the formula columns A..F or AA and beyond", () => {
    const a = player("p1", "Aaa");
    const data = emptyData({
      ttEntries: [ttEntry(a, "qualification", { MC1: "1:00.00" })],
    });
    const map = indexWrites(buildTTQualificationWrites(data), SHEET);
    for (const ref of ["A2", "B2", "C2", "E2", "F2", "AA2", "AB2"]) {
      expectUntouched(map, ref);
    }
  });

  it("clears spare rows' course cells up to row 48 but never row 49", () => {
    const a = player("p1", "Aaa");
    const data = emptyData({
      ttEntries: [ttEntry(a, "qualification", { MC1: "1:00.00" })],
    });
    const writes = buildTTQualificationWrites(data);
    const map = indexWrites(writes, SHEET);
    // Spare rows 3..48 have their G..Z cleared.
    expectClear(map, "G3");
    expectClear(map, "Z48");
    expectUntouched(map, "G49"); // outside the 47-row table
    // No write should reference a row > 48.
    for (const ref of writtenRefs(writes, SHEET)) {
      const row = Number(ref.replace(/[A-Z]/g, ""));
      expect(row).toBeLessThanOrEqual(48);
    }
  });

  it("truncates to 47 players and never writes row 49", () => {
    const players = Array.from({ length: 50 }, (_, i) =>
      // zero-pad nickname so case-insensitive sort is the numeric order
      player(`p${i}`, `nick${String(i).padStart(3, "0")}`),
    );
    const data = emptyData({
      ttEntries: players.map((p) => ttEntry(p, "qualification", { MC1: "0:10.00" })),
    });
    const writes = buildTTQualificationWrites(data);
    const map = indexWrites(writes, SHEET);
    expectNumber(map, "G2", 1000); // first player
    expectNumber(map, "G48", 1000); // 47th player on row 48
    expectUntouched(map, "G49"); // 48th+ dropped
  });

  it("returns only clears (no values) when there are no TT qualification entries", () => {
    const data = emptyData();
    const writes = buildTTQualificationWrites(data);
    const map = indexWrites(writes, SHEET);
    // Every emitted op must be a clearValue (spare-row cleanup only).
    for (const w of writes) expect(w.op).toBe("clearValue");
    expectClear(map, "G2");
    expectClear(map, "Z48");
  });
});
