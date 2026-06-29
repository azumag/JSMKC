/**
 * Tests for the Main Hub fill map (Registration table + Qualifying/Groups inputs).
 *
 * Ground truth: /tmp/cdm-analysis/sheet2025/sheet_Main_Hub.txt
 *   - Rows are sorted by Name (column B), case-insensitive ascending
 *     (B2 "Alessandro Sona" … B5 "Charly Greffier" … not by Nickname).
 *   - B=name C=nickname D=country E..H=TT/BM/MR/GP Order I..L=Yes/No.
 *   - O3..R3 Qualifying counts (TT,BM,MR,GP), O4..R4 group counts.
 *   - A (=ROW()-1), N2:R2 (COUNTIF), T/U (spills) are formulas — never written.
 */

import { buildMainHubWrites } from "@/lib/cdm-export/fill/main-hub";
import type {
  CdmMatch,
  CdmModeQualification,
  CdmPlayer,
  CdmTTEntry,
  CdmTournamentData,
} from "@/lib/cdm-export/types";
import {
  indexWrites,
  expectString,
  expectNumber,
  expectClear,
  expectStrip,
  expectUntouched,
  writtenRefs,
} from "./write-helpers";

const SHEET = "Main Hub" as const;

function player(id: string, name: string, nickname: string, country: string | null = null): CdmPlayer {
  return { id, name, nickname, country };
}

function qual(p: CdmPlayer, group: string, seeding: number | null): CdmModeQualification {
  return { player: p, group, seeding, points: 0, score: 0 };
}

function tt(p: CdmPlayer, stage: string, seeding: number | null): CdmTTEntry {
  return { player: p, playerId: p.id, stage, seeding, lives: 3, eliminated: false };
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

describe("buildMainHubWrites — player rows", () => {
  it("sorts the player universe by name, case-insensitive ascending", () => {
    const ann = player("p1", "ann lower", "Z-nick");
    const bob = player("p2", "Bob Upper", "A-nick");
    const cara = player("p3", "Cara", "M-nick");
    const data = emptyData({
      // Deliberately out of order; TT-only player included in the universe.
      bmQualifications: [qual(cara, "A", 1), qual(bob, "A", 2)],
      ttEntries: [tt(ann, "qualification", 5)],
    });
    const map = indexWrites(buildMainHubWrites(data), SHEET);
    // name asc: "ann lower" < "Bob Upper" < "Cara"
    expectString(map, "B2", "ann lower");
    expectString(map, "B3", "Bob Upper");
    expectString(map, "B4", "Cara");
    expectString(map, "C2", "Z-nick");
  });

  it("writes nickname, country text, and STRIPS null country", () => {
    const a = player("p1", "Aaa", "Anick", "France");
    const b = player("p2", "Bbb", "Bnick", null);
    const data = emptyData({ bmQualifications: [qual(a, "A", 1), qual(b, "A", 2)] });
    const map = indexWrites(buildMainHubWrites(data), SHEET);
    expectString(map, "C2", "Anick");
    expectString(map, "D2", "France");
    expectString(map, "C3", "Bnick");
    // null country -> STRIP (not clearValue): the template D cell is a rich-value
    // shell whose `vm` points at the old CDM2025 flag; clearValue keeps `vm` and
    // Excel renders the stale country, so the cell must be fully stripped.
    expectStrip(map, "D3");
  });

  it("never writes the formula columns A, M, N or the spill columns T/U", () => {
    const a = player("p1", "Aaa", "Anick", "FR");
    const data = emptyData({ bmQualifications: [qual(a, "A", 1)] });
    const map = indexWrites(buildMainHubWrites(data), SHEET);
    for (const ref of ["A2", "M2", "N2", "T2", "U2"]) expectUntouched(map, ref);
  });
});

describe("buildMainHubWrites — Order columns E..H and Yes/No I..L", () => {
  it("writes TT Order from the qualification entry seeding and TT=Yes", () => {
    const a = player("p1", "Aaa", "Anick");
    const data = emptyData({ ttEntries: [tt(a, "qualification", 7)] });
    const map = indexWrites(buildMainHubWrites(data), SHEET);
    expectNumber(map, "E2", 7); // TT Order
    expectString(map, "I2", "Yes"); // TT participation
    expectString(map, "J2", "No"); // BM not entered
  });

  it("clears TT Order when the qualification entry has null seeding but keeps TT=Yes", () => {
    const a = player("p1", "Aaa", "Anick");
    const data = emptyData({ ttEntries: [tt(a, "qualification", null)] });
    const map = indexWrites(buildMainHubWrites(data), SHEET);
    expectClear(map, "E2"); // null seeding -> clearValue (NOT a fallback number)
    expectString(map, "I2", "Yes");
  });

  it("treats non-qualification TT stages as not TT-participating", () => {
    const a = player("p1", "Aaa", "Anick");
    // Only a phase1 entry (no qualification): TT="No", Order cleared.
    const data = emptyData({ ttEntries: [tt(a, "phase1", 3)] });
    const map = indexWrites(buildMainHubWrites(data), SHEET);
    expectString(map, "I2", "No");
    expectClear(map, "E2");
  });

  it("writes BM/MR/GP synthesized Order and Yes for participants", () => {
    // Single group of two; G=1 so Orders are 1 and 2 by seeding.
    const a = player("p1", "Aaa", "Anick");
    const b = player("p2", "Bbb", "Bnick");
    const data = emptyData({
      bmQualifications: [qual(a, "A", 1), qual(b, "A", 2)],
      mrQualifications: [qual(b, "A", 1), qual(a, "A", 2)],
    });
    const map = indexWrites(buildMainHubWrites(data), SHEET);
    // BM (F col): a seed1 -> Order 1, b seed2 -> Order 2
    expectNumber(map, "F2", 1); // a's BM Order
    expectString(map, "J2", "Yes"); // a in BM
    expectNumber(map, "F3", 2); // b's BM Order
    // MR (G col): b seed1 -> 1, a seed2 -> 2
    expectNumber(map, "G2", 2); // a's MR Order
    expectString(map, "K2", "Yes"); // a in MR
    // GP: neither entered
    expectString(map, "L2", "No");
    expectClear(map, "H2"); // a not in GP -> Order cleared
  });
});

describe("buildMainHubWrites — Qualifying counts O3..R3 and Groups O4..R4", () => {
  it("uses min(24, count) when there are no finals/playoff matches", () => {
    const players = Array.from({ length: 8 }, (_, i) =>
      player(`p${i}`, `Name${i}`, `Nick${i}`),
    );
    const data = emptyData({
      bmQualifications: players.map((p, i) => qual(p, i < 4 ? "A" : "B", (i % 4) + 1)),
      ttEntries: players.map((p) => tt(p, "qualification", 1)),
    });
    const map = indexWrites(buildMainHubWrites(data), SHEET);
    // TT count = min(24, 8) = 8 at O3; BM count = min(24, 8) = 8 at P3.
    expectNumber(map, "O3", 8);
    expectNumber(map, "P3", 8);
    // Group counts: TT=0 (O4), BM=2 distinct groups (P4).
    expectNumber(map, "O4", 0);
    expectNumber(map, "P4", 2);
  });

  it("reports 24 when a playoff stage match exists, 16 for winners_r1, 8 for winners_qf", () => {
    const a = player("p1", "Aaa", "An");
    const b = player("p2", "Bbb", "Bn");
    const mk = (round: string | null, stage: string): CdmMatch => ({
      matchNumber: 1,
      stage,
      round,
      player1: a,
      player2: b,
      completed: true,
    });
    // BM: a playoff match -> 24. MR: winners_r1 -> 16. GP: winners_qf only -> 8.
    const data = emptyData({
      bmQualifications: [qual(a, "A", 1)],
      mrQualifications: [qual(a, "A", 1)],
      gpQualifications: [qual(a, "A", 1)],
      bmMatches: [mk(null, "playoff")],
      mrMatches: [mk("winners_r1", "finals")],
      gpMatches: [mk("winners_qf", "finals")],
    });
    const map = indexWrites(buildMainHubWrites(data), SHEET);
    expectNumber(map, "P3", 24); // BM
    expectNumber(map, "Q3", 16); // MR
    expectNumber(map, "R3", 8); // GP
  });

  it("keeps O3 at min(24, qualifier count) even while phase rounds exist", () => {
    // O3 sizes the TT Finals roster spill
    // (B3 = OFFSET('TT Qualifications'!CN2,0,0,O3)), and the lives replay
    // writes a row for every top-min(24,N) qualifier with non-runners at
    // Time=0 (CDM 2025 convention). Mid-phase the phase rounds only contain a
    // subset (phase1 = ranks 17..24), so the distinct phase-player count must
    // NOT shrink O3 — otherwise the roster spill and the replay's rows
    // disagree about the row universe.
    const players = Array.from({ length: 12 }, (_, i) =>
      player(`p${i}`, `N${i}`, `K${i}`),
    );
    const data = emptyData({
      ttEntries: players.map((p) => tt(p, "qualification", 1)),
      ttPhaseRounds: [
        {
          phase: "phase1",
          roundNumber: 1,
          course: "MC1",
          results: [
            { playerId: "p0", timeMs: 1000 },
            { playerId: "p1", timeMs: 1000 },
            { playerId: "p2", timeMs: 1000 },
          ],
          livesReset: false,
        },
      ],
    });
    const map = indexWrites(buildMainHubWrites(data), SHEET);
    expectNumber(map, "O3", 12);
  });

  it("falls back to distinct phase players for O3 when no qualification entries exist", () => {
    const a = player("p1", "Aaa", "An");
    const b = player("p2", "Bbb", "Bn");
    const data = emptyData({
      ttEntries: [tt(a, "phase1", 1), tt(b, "phase1", 2)],
      ttPhaseRounds: [
        {
          phase: "phase1",
          roundNumber: 1,
          course: "MC1",
          results: [
            { playerId: "p1", timeMs: 1000 },
            { playerId: "p2", timeMs: 2000 },
          ],
          livesReset: false,
        },
      ],
    });
    const map = indexWrites(buildMainHubWrites(data), SHEET);
    expectNumber(map, "O3", 2);
  });
});

describe("buildMainHubWrites — spare rows and bounds", () => {
  it("clears B..L on every row after the players (up to row 61); strips D", () => {
    const a = player("p1", "Aaa", "An");
    const data = emptyData({ bmQualifications: [qual(a, "A", 1)] });
    const map = indexWrites(buildMainHubWrites(data), SHEET);
    // 1 player on row 2; row 3 onward must clear B..L — except D (the rich-value
    // country shell) which is STRIPPED so no stale flag renders on an empty row.
    for (const col of ["B", "C", "E", "F", "G", "H", "I", "J", "K", "L"]) {
      expectClear(map, `${col}3`);
      expectClear(map, `${col}61`);
    }
    expectStrip(map, "D3");
    expectStrip(map, "D61");
    // But never row 62 (out of the 60-row Registration table).
    expectUntouched(map, "B62");
  });

  it("truncates to 60 players and never writes row 62", () => {
    const players = Array.from({ length: 65 }, (_, i) =>
      // zero-pad so name sort is the numeric order
      player(`p${i}`, `Name${String(i).padStart(3, "0")}`, `Nick${i}`),
    );
    const data = emptyData({ bmQualifications: players.map((p) => qual(p, "A", 1)) });
    const writes = buildMainHubWrites(data);
    const map = indexWrites(writes, SHEET);
    expectString(map, "B2", "Name000");
    expectString(map, "B61", "Name059"); // 60th player on row 61
    expectUntouched(map, "B62"); // 61st+ dropped
    // No write should reference a row > 61.
    for (const ref of writtenRefs(writes, SHEET)) {
      const row = Number(ref.replace(/[A-Z]/g, ""));
      expect(row).toBeLessThanOrEqual(61);
    }
  });
});
