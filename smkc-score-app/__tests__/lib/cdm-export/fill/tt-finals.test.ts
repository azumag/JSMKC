/**
 * Tests for the CDM "TT Finals" fill map and its life-replay helper.
 *
 * Two units are exercised here:
 *
 *   1. replayTTFinals(data) — reconstructs, for every sheet round, who ran
 *      (and their time), who lost a life, what bonus lives were granted, and
 *      the input/display row orders. Its rules MUST match
 *      src/lib/ta/finals-phase-manager.ts (the authoritative engine) and the
 *      canonical in-memory replay in undoLastPhaseRound (same file). The tests
 *      pin each phase transition (phase1/2 single elimination, phase3 bottom-
 *      half life loss, phase-3 entry +2 grant, life reset to 3).
 *
 *   2. buildTTFinalsWrites(data) — turns the replay into CdmCellWrite[] against
 *      the verified template geometry (cdm-constants.ts, and the dump at
 *      /tmp/cdm-analysis/sheet2025/sheet_TT_Finals.txt). Column facts pinned by
 *      the dump:
 *        r=1: Left=C Gain=D Time=E   display Lost=K   (C3..C26=1, E19..E26=time)
 *        r=2: Left=P Gain=Q Time=R   display Lost=X   (P3 = SORT formula → never written)
 *        r=9: Gain=DD Time=DE        (DD3=2 phase-3 entry grant, DE3=5452)
 *        r=40: Left=SP Gain=SQ Time=SR display Lost=SX
 */

import {
  replayTTFinals,
  type TTFinalsReplayRound,
} from "@/lib/cdm-export/fill/tt-lives-replay";
import { buildTTFinalsWrites } from "@/lib/cdm-export/fill/tt-finals";
import {
  TT_FINALS_MAX_ROUNDS,
  TT_FINALS_FIRST_DATA_ROW,
  TT_FINALS_MAX_FINALISTS,
  CDM_COURSE_NAMES,
} from "@/lib/cdm-export/cdm-constants";
import { msToCdmTime } from "@/lib/cdm-export/time-format";
import type {
  CdmCellWrite,
  CdmPlayer,
  CdmTournamentData,
  CdmTTEntry,
  CdmTTPhaseRound,
} from "@/lib/cdm-export/types";
import {
  indexWrites,
  expectNumber,
  expectClear,
  expectString,
  expectUntouched,
} from "./write-helpers";

// --------------------------------------------------------------------------
// Fixture builders
// --------------------------------------------------------------------------

function player(id: string): CdmPlayer {
  return { id, name: `Name ${id}`, nickname: id };
}

/**
 * Build a qualification-stage TT entry. `rank` drives the round-1 universe row
 * order (1..24); points/time are only consulted on rank ties.
 */
function qualEntry(
  playerId: string,
  rank: number,
  opts: { points?: number; totalTime?: number } = {},
): CdmTTEntry {
  return {
    player: player(playerId),
    playerId,
    stage: "qualification",
    seeding: rank,
    lives: 0,
    eliminated: false,
    totalTime: opts.totalTime ?? rank * 1000,
    qualificationPoints: opts.points ?? 1000 - rank,
    rank,
  } as CdmTTEntry & { rank: number };
}

interface RoundResult {
  playerId: string;
  timeMs: number;
}

function phaseRound(
  phase: "phase1" | "phase2" | "phase3",
  roundNumber: number,
  course: string,
  results: RoundResult[],
  opts: { eliminatedIds?: string[]; livesReset?: boolean } = {},
): CdmTTPhaseRound {
  return {
    phase,
    roundNumber,
    course,
    results: results.map((r) => ({ ...r, isRetry: false })),
    eliminatedIds: opts.eliminatedIds ?? null,
    livesReset: opts.livesReset ?? false,
  };
}

/** A 24-player qualification universe (ranks 1..24 → ids p01..p24). */
function universe24(): CdmTTEntry[] {
  return Array.from({ length: 24 }, (_, i) =>
    qualEntry(`p${String(i + 1).padStart(2, "0")}`, i + 1),
  );
}

function id(n: number): string {
  return `p${String(n).padStart(2, "0")}`;
}

function emptyData(overrides: Partial<CdmTournamentData> = {}): CdmTournamentData {
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
    ...overrides,
  };
}

// --------------------------------------------------------------------------
// replayTTFinals — universe and ordering
// --------------------------------------------------------------------------

describe("replayTTFinals — universe", () => {
  it("returns no rounds when there are no phase rounds", () => {
    expect(replayTTFinals(emptyData())).toEqual([]);
  });

  it("orders the round-1 input rows by qualification rank 1..24", () => {
    const data = emptyData({
      ttEntries: universe24(),
      // One phase1 round so a round exists to inspect the row order.
      ttPhaseRounds: [
        phaseRound("phase1", 1, "MC1", [
          { playerId: id(17), timeMs: 60000 },
          { playerId: id(18), timeMs: 61000 },
          { playerId: id(19), timeMs: 62000 },
          { playerId: id(20), timeMs: 63000 },
          { playerId: id(21), timeMs: 64000 },
          { playerId: id(22), timeMs: 65000 },
          { playerId: id(23), timeMs: 66000 },
          { playerId: id(24), timeMs: 99000 },
        ], { eliminatedIds: [id(24)] }),
      ],
    });
    const rounds = replayTTFinals(data);
    expect(rounds[0].inputRowOrder).toEqual(
      Array.from({ length: 24 }, (_, i) => id(i + 1)),
    );
  });

  it("breaks rank ties with the documented comparator (points DESC, time ASC)", () => {
    // Two entries share rank 5; comparator must place higher points first.
    const entries: CdmTTEntry[] = [
      qualEntry(id(1), 1),
      qualEntry("tieLow", 5, { points: 100, totalTime: 5000 }),
      qualEntry("tieHigh", 5, { points: 200, totalTime: 9000 }),
    ];
    const data = emptyData({
      ttEntries: entries,
      ttPhaseRounds: [
        phaseRound("phase1", 1, "MC1", [
          { playerId: id(1), timeMs: 60000 },
          { playerId: "tieHigh", timeMs: 61000 },
          { playerId: "tieLow", timeMs: 99000 },
        ], { eliminatedIds: ["tieLow"] }),
      ],
    });
    const rounds = replayTTFinals(data);
    // p01 (rank1) first, then tieHigh (more points) before tieLow.
    expect(rounds[0].inputRowOrder).toEqual([id(1), "tieHigh", "tieLow"]);
  });
});

// --------------------------------------------------------------------------
// replayTTFinals — phase 1/2 single elimination
// --------------------------------------------------------------------------

describe("replayTTFinals — phase1/phase2 elimination", () => {
  it("marks exactly the eliminated runner as losing a life; survivors keep Left=1", () => {
    const runners = [17, 18, 19, 20, 21, 22, 23, 24];
    const data = emptyData({
      ttEntries: universe24(),
      ttPhaseRounds: [
        phaseRound(
          "phase1",
          1,
          "MC1",
          runners.map((n, i) => ({ playerId: id(n), timeMs: 60000 + i * 1000 })),
          { eliminatedIds: [id(24)] },
        ),
      ],
    });
    const r1 = replayTTFinals(data)[0];

    expect(r1.lostLife).toEqual(new Set([id(24)]));
    // The eliminated runner ends at 0 lives; everyone else stays at 1.
    expect(r1.livesAfter.get(id(24))).toBe(0);
    expect(r1.livesAfter.get(id(17))).toBe(1);
    // Non-runners (ranks 1..16) also keep their single life.
    expect(r1.livesAfter.get(id(1))).toBe(1);
    // No bonus lives in phase 1.
    expect(r1.gains.size).toBe(0);
  });

  it("carries lives forward across two phase-1 rounds", () => {
    const r1Runners = [17, 18, 19, 20, 21, 22, 23, 24];
    const r2Runners = [17, 18, 19, 20, 21, 22, 23]; // p24 eliminated in r1
    const data = emptyData({
      ttEntries: universe24(),
      ttPhaseRounds: [
        phaseRound(
          "phase1",
          1,
          "MC1",
          r1Runners.map((n, i) => ({ playerId: id(n), timeMs: 60000 + i * 1000 })),
          { eliminatedIds: [id(24)] },
        ),
        phaseRound(
          "phase1",
          2,
          "DP1",
          r2Runners.map((n, i) => ({ playerId: id(n), timeMs: 60000 + i * 1000 })),
          { eliminatedIds: [id(23)] },
        ),
      ],
    });
    const rounds = replayTTFinals(data);
    expect(rounds).toHaveLength(2);
    // After r2, p23 is out (0), p24 still 0 from r1, the rest 1.
    expect(rounds[1].livesAfter.get(id(23))).toBe(0);
    expect(rounds[1].livesAfter.get(id(24))).toBe(0);
    expect(rounds[1].livesAfter.get(id(17))).toBe(1);
  });

  it("loses no life when eliminatedIds is empty (survivor floor reached)", () => {
    const data = emptyData({
      ttEntries: universe24(),
      ttPhaseRounds: [
        phaseRound("phase2", 1, "MC1", [
          { playerId: id(1), timeMs: 60000 },
          { playerId: id(2), timeMs: 61000 },
          { playerId: id(3), timeMs: 62000 },
          { playerId: id(4), timeMs: 63000 },
        ]),
      ],
    });
    const r = replayTTFinals(data)[0];
    expect(r.lostLife.size).toBe(0);
  });
});

// --------------------------------------------------------------------------
// replayTTFinals — phase 3 life system
// --------------------------------------------------------------------------

describe("replayTTFinals — phase3 bottom-half life loss", () => {
  it("the bottom half by ascending time each lose one life; phase-3 entrants get +2", () => {
    // 4 phase-3 runners; bottom half = slowest 2 lose a life.
    const data = emptyData({
      ttEntries: universe24(),
      ttPhaseRounds: [
        phaseRound("phase3", 1, "MC1", [
          { playerId: id(1), timeMs: 60000 }, // fastest -> safe
          { playerId: id(2), timeMs: 61000 }, // safe
          { playerId: id(3), timeMs: 62000 }, // bottom half -> lose
          { playerId: id(4), timeMs: 63000 }, // bottom half -> lose
        ]),
      ],
    });
    const r = replayTTFinals(data)[0];

    // Bottom half = ceil(4/2)=2 → indices 2,3 → p03,p04.
    expect(r.lostLife).toEqual(new Set([id(3), id(4)]));
    // Entry grant: every runner topped from 1 → 3 (Gain +2).
    for (const n of [1, 2, 3, 4]) {
      expect(r.gains.get(id(n))).toBe(2);
    }
    // After: safe players 3 lives, bottom-half players 3-1=2.
    expect(r.livesAfter.get(id(1))).toBe(3);
    expect(r.livesAfter.get(id(2))).toBe(3);
    expect(r.livesAfter.get(id(3))).toBe(2);
    expect(r.livesAfter.get(id(4))).toBe(2);
  });

  it("treats a null time as slowest so it falls in the bottom half", () => {
    const data = emptyData({
      ttEntries: universe24(),
      ttPhaseRounds: [
        {
          phase: "phase3",
          roundNumber: 1,
          course: "MC1",
          results: [
            { playerId: id(1), timeMs: 60000 },
            { playerId: id(2), timeMs: 61000 },
            { playerId: id(3), timeMs: 62000 },
            { playerId: id(4), timeMs: null }, // no time → slowest
          ],
          eliminatedIds: null,
          livesReset: false,
        } as CdmTTPhaseRound,
      ],
    });
    const r = replayTTFinals(data)[0];
    expect(r.lostLife.has(id(4))).toBe(true);
  });

  it("grants the +2 entry top-up only once across multiple phase-3 rounds", () => {
    const data = emptyData({
      ttEntries: universe24(),
      ttPhaseRounds: [
        phaseRound("phase3", 1, "MC1", [
          { playerId: id(1), timeMs: 60000 },
          { playerId: id(2), timeMs: 61000 },
          { playerId: id(3), timeMs: 62000 },
          { playerId: id(4), timeMs: 63000 },
        ]),
        phaseRound("phase3", 2, "DP1", [
          { playerId: id(1), timeMs: 60000 },
          { playerId: id(2), timeMs: 61000 },
          { playerId: id(3), timeMs: 62000 },
          { playerId: id(4), timeMs: 63000 },
        ]),
      ],
    });
    const rounds = replayTTFinals(data);
    // Round 1 grants +2 to all; round 2 grants nothing (already entered).
    for (const n of [1, 2, 3, 4]) expect(rounds[0].gains.get(id(n))).toBe(2);
    expect(rounds[1].gains.size).toBe(0);
  });

  it("applies a life reset to 3 after eliminations hit a threshold (realistic 3-round wear-down)", () => {
    // Realistic reset: 4 phase-3 entrants start on 3 lives (round 1 grants +2
    // each). p03 and p04 are the slowest each round so they lose a life every
    // round: 3 → 2 → 1 → 0. In round 3 they reach 0 and are eliminated; the
    // active count drops to 2, which is a [8,4,2] reset threshold, so the
    // engine resets the two survivors (p01,p02) back to 3 lives (livesReset).
    // This mirrors processPhase3Result's updateMany(eliminated:false → 3).
    const fourRunners = (slowA: number, slowB: number) => [
      { playerId: id(1), timeMs: 60000 },
      { playerId: id(2), timeMs: 61000 },
      { playerId: id(slowA), timeMs: 62000 },
      { playerId: id(slowB), timeMs: 63000 },
    ];
    const data = emptyData({
      ttEntries: universe24(),
      ttPhaseRounds: [
        phaseRound("phase3", 1, "MC1", fourRunners(3, 4)),
        phaseRound("phase3", 2, "DP1", fourRunners(3, 4)),
        phaseRound("phase3", 3, "GV1", fourRunners(3, 4), {
          eliminatedIds: [id(3), id(4)],
          livesReset: true,
        }),
      ],
    });
    const rounds = replayTTFinals(data);
    const r3 = rounds[2];
    // Survivors reset to 3 (display Left); the two eliminated players to 0.
    expect(r3.livesAfter.get(id(1))).toBe(3);
    expect(r3.livesAfter.get(id(2))).toBe(3);
    expect(r3.livesAfter.get(id(3))).toBe(0);
    expect(r3.livesAfter.get(id(4))).toBe(0);
    // p01/p02 never lost a life, so they carried 3 lives into round 3. The
    // reset target is also 3, so no extra Gain is needed (display Left =
    // carried(3) + Gain(0) - Lost(0) = 3). The replay correctly emits no Gain.
    expect(r3.gains.get(id(1))).toBeUndefined();
    expect(r3.gains.get(id(2))).toBeUndefined();
  });

  it("encodes the reset top-up as Gain when a surviving player lost a life on the reset round", () => {
    // 6 phase-3 entrants (3 lives each after round 1). We wear the field so that
    // entering the reset round one survivor sits at 2 lives and loses a life on
    // that round, then is reset to 3 — exercising the Gain top-up path:
    //   display Left = carried + Gain - Lost = 3  →  Gain = 3 - carried + Lost.
    // Construction: rounds 1..3 always have the same 6 runners with p05 & p06
    // slowest, plus we rotate p04 into the bottom half on round 3 so it loses a
    // life there while surviving the reset.
    const six = (slow: number[]) => {
      const fast = [1, 2, 3, 4, 5, 6].filter((n) => !slow.includes(n));
      return [
        ...fast.map((n, i) => ({ playerId: id(n), timeMs: 60000 + i * 1000 })),
        ...slow.map((n, i) => ({ playerId: id(n), timeMs: 80000 + i * 1000 })),
      ];
    };
    const data = emptyData({
      ttEntries: universe24(),
      ttPhaseRounds: [
        // bottom half of 6 = 3 slowest. p05,p06 lose every round; the 3rd
        // bottom-half slot rotates so p04 reaches the reset round at 2 lives.
        phaseRound("phase3", 1, "MC1", six([2, 5, 6])), // p02,p05,p06 → 2 lives
        phaseRound("phase3", 2, "DP1", six([2, 5, 6])), // p02,p05,p06 → 1 life
        // Round 3: p05,p06 reach 0 (eliminated) → count 4 hits threshold; p04
        // is also in the bottom half (loses a life 3→2) but survives → reset to 3.
        phaseRound("phase3", 3, "GV1", six([4, 5, 6]), {
          eliminatedIds: [id(5), id(6)],
          livesReset: true,
        }),
      ],
    });
    const r3 = replayTTFinals(data)[2];
    // p04 lost a life this round (carried 3 → 2 after loss) then reset to 3:
    // Gain = 3 - 3 + 1 = 1.
    expect(r3.lostLife.has(id(4))).toBe(true);
    expect(r3.livesAfter.get(id(4))).toBe(3);
    expect(r3.gains.get(id(4))).toBe(1);
    // Eliminated players end at 0.
    expect(r3.livesAfter.get(id(5))).toBe(0);
    expect(r3.livesAfter.get(id(6))).toBe(0);
  });

  it("does NOT reset universe bystanders that never entered phase 3", () => {
    // The engine resets only phase-3 participants (processPhase3Result:793-802 —
    // updateMany where stage:"phase3", eliminated:false). A universe finalist who
    // never ran a phase-3 round still holds their single starting life and must
    // stay at 1 through a reset round — not be lifted to 3 (which would corrupt
    // the ledger and the next round's SORTBY-by-ending-lives input order).
    // 6-player universe; only p01..p04 ever run (all in phase 3). p05,p06 are
    // bystanders. Round 3 eliminates the worn-down pair and triggers a reset.
    const four = (slowA: number, slowB: number) => [
      { playerId: id(1), timeMs: 60000 },
      { playerId: id(2), timeMs: 61000 },
      { playerId: id(slowA), timeMs: 62000 },
      { playerId: id(slowB), timeMs: 63000 },
    ];
    const data = emptyData({
      ttEntries: Array.from({ length: 6 }, (_, i) => qualEntry(id(i + 1), i + 1)),
      ttPhaseRounds: [
        phaseRound("phase3", 1, "MC1", four(3, 4)),
        phaseRound("phase3", 2, "DP1", four(3, 4)),
        phaseRound("phase3", 3, "GV1", four(3, 4), {
          eliminatedIds: [id(3), id(4)],
          livesReset: true,
        }),
      ],
    });
    const r3 = replayTTFinals(data)[2];
    // Bystanders keep their single life and receive no bonus Gain.
    expect(r3.livesAfter.get(id(5))).toBe(1);
    expect(r3.livesAfter.get(id(6))).toBe(1);
    expect(r3.gains.get(id(5))).toBeUndefined();
    expect(r3.gains.get(id(6))).toBeUndefined();
    // Phase-3 survivors still reset to 3.
    expect(r3.livesAfter.get(id(1))).toBe(3);
    expect(r3.livesAfter.get(id(2))).toBe(3);
  });
});

// --------------------------------------------------------------------------
// replayTTFinals — row ordering across rounds
// --------------------------------------------------------------------------

describe("replayTTFinals — row ordering", () => {
  it("round r>=2 input order = previous display order sorted by ending lives DESC (stable)", () => {
    // Round 1: 4 runners, p03 & p04 lose a life (end at 0 / single-life model
    // via phase1). Round 2 input order should put higher-lives players first,
    // keeping prior display order among equal lives.
    const data = emptyData({
      ttEntries: Array.from({ length: 4 }, (_, i) => qualEntry(id(i + 1), i + 1)),
      ttPhaseRounds: [
        phaseRound(
          "phase1",
          1,
          "MC1",
          [
            { playerId: id(1), timeMs: 60000 },
            { playerId: id(2), timeMs: 61000 },
            { playerId: id(3), timeMs: 62000 },
            { playerId: id(4), timeMs: 99000 },
          ],
          { eliminatedIds: [id(4)] },
        ),
        phaseRound(
          "phase1",
          2,
          "DP1",
          [
            { playerId: id(1), timeMs: 60000 },
            { playerId: id(2), timeMs: 61000 },
            { playerId: id(3), timeMs: 62000 },
          ],
          { eliminatedIds: [id(3)] },
        ),
      ],
    });
    const rounds = replayTTFinals(data);
    // After r1: p04 has 0 lives, p01..p03 have 1. r2 input = survivors-first,
    // preserving r1 display order, with p04 (0 lives) last.
    const r2Input = rounds[1].inputRowOrder;
    expect(r2Input[r2Input.length - 1]).toBe(id(4)); // lowest lives last
    expect(new Set(r2Input)).toEqual(new Set([id(1), id(2), id(3), id(4)]));
  });

  it("display order = input order sorted by this round's time ASC; non-runners (time 0) first", () => {
    const data = emptyData({
      ttEntries: Array.from({ length: 4 }, (_, i) => qualEntry(id(i + 1), i + 1)),
      ttPhaseRounds: [
        // Only p02 and p03 run; p01 and p04 sit out (rank 1 and 4).
        phaseRound("phase1", 1, "MC1", [
          { playerId: id(2), timeMs: 70000 },
          { playerId: id(3), timeMs: 65000 },
        ], { eliminatedIds: [id(2)] }),
      ],
    });
    const r = replayTTFinals(data)[0];
    // Non-runners p01, p04 (time 0) come first in input order; among runners,
    // p03 (65s) before p02 (70s).
    const display = r.displayRowOrder;
    // p01 & p04 occupy the first two slots (order between them = input order).
    expect(new Set(display.slice(0, 2))).toEqual(new Set([id(1), id(4)]));
    // p03 before p02 among the runners.
    expect(display.indexOf(id(3))).toBeLessThan(display.indexOf(id(2)));
  });

  // TC-2567: timeMs=null ランナーの displayRowOrder ソート動作 (issue #2575)
  it("TC-2567: a runner with timeMs=null sorts with non-runners (key=0) ahead of positive-time runners", () => {
    // The display sort key is `t ?? 0` where t = participants.get(id).
    // Non-runners (t=undefined → 0) and null-time runners (t=null → 0) both
    // get key 0, so they appear before any positive-time runner. This is
    // distinct from the loss-step, where timeForSort(null)=Infinity treats a
    // null-time runner as the slowest. The behaviour difference is intentional
    // (sheet encodes null as 0, same as a non-runner) and must be documented.
    const data = emptyData({
      ttEntries: Array.from({ length: 4 }, (_, i) => qualEntry(id(i + 1), i + 1)),
      ttPhaseRounds: [
        {
          phase: "phase3" as const,
          roundNumber: 1,
          course: "MC1",
          results: [
            { playerId: id(1), timeMs: 60000 },
            { playerId: id(2), timeMs: null }, // null-time runner → key 0
            { playerId: id(3), timeMs: 70000 },
            // p04 is a non-runner → key 0
          ],
          eliminatedIds: null,
          livesReset: false,
        } as CdmTTPhaseRound,
      ],
    });
    const r = replayTTFinals(data)[0];
    const display = r.displayRowOrder;
    // Null-time runner (p02) and non-runner (p04) both have key=0; both must
    // appear before positive-time runners p01 (60000) and p03 (70000).
    expect(display.indexOf(id(2))).toBeLessThan(display.indexOf(id(1)));
    expect(display.indexOf(id(4))).toBeLessThan(display.indexOf(id(1)));
    // Among positive-time runners, p01 (60000) before p03 (70000).
    expect(display.indexOf(id(1))).toBeLessThan(display.indexOf(id(3)));
  });

  // TC-2568: 同一 timeMs 時の安定ソート動作 (issue #2576)
  it("TC-2568: equal timeMs values preserve their relative input order (stable sort)", () => {
    // stableSort tiebreaks equal keys by original index, reproducing Excel
    // SORTBY stable semantics. Two runners sharing the same timeMs must appear
    // in the same order they held in inputRowOrder (qualification rank order for
    // round 1). TC-2564 only covered distinct times; this pins the tie case.
    const data = emptyData({
      ttEntries: Array.from({ length: 4 }, (_, i) => qualEntry(id(i + 1), i + 1)),
      ttPhaseRounds: [
        phaseRound("phase1", 1, "MC1", [
          { playerId: id(1), timeMs: 60000 }, // tied with p02
          { playerId: id(2), timeMs: 60000 }, // tied with p01
          { playerId: id(3), timeMs: 70000 },
          { playerId: id(4), timeMs: 80000 },
        ], { eliminatedIds: [id(4)] }),
      ],
    });
    const r = replayTTFinals(data)[0];
    const display = r.displayRowOrder;
    // p01 (rank 1) and p02 (rank 2) share timeMs=60000. Round-1 inputRowOrder
    // is qualification rank order, so p01 precedes p02 → stable sort must keep
    // p01 before p02 in the display order.
    expect(display.indexOf(id(1))).toBeLessThan(display.indexOf(id(2)));
    // Both tied runners appear before p03 (70000).
    expect(display.indexOf(id(2))).toBeLessThan(display.indexOf(id(3)));
  });
});

// --------------------------------------------------------------------------
// replayTTFinals — phase order & overflow
// --------------------------------------------------------------------------

describe("replayTTFinals — ordering and overflow", () => {
  it("plays phase1 rounds, then phase2, then phase3 regardless of input array order", () => {
    const mk = (phase: "phase1" | "phase2" | "phase3", rn: number, course: string) =>
      phaseRound(phase, rn, course, [
        { playerId: id(1), timeMs: 60000 },
        { playerId: id(2), timeMs: 61000 },
      ], { eliminatedIds: [id(2)] });
    const data = emptyData({
      ttEntries: universe24(),
      // Deliberately shuffled input order.
      ttPhaseRounds: [
        mk("phase3", 1, "RR"),
        mk("phase1", 2, "DP1"),
        mk("phase2", 1, "GV1"),
        mk("phase1", 1, "MC1"),
      ],
    });
    const rounds = replayTTFinals(data);
    expect(rounds.map((r) => r.course)).toEqual(["MC1", "DP1", "GV1", "RR"]);
  });

  it("drops rounds beyond TT_FINALS_MAX_ROUNDS", () => {
    const many: CdmTTPhaseRound[] = Array.from(
      { length: TT_FINALS_MAX_ROUNDS + 5 },
      (_, i) =>
        phaseRound("phase1", i + 1, "MC1", [
          { playerId: id(1), timeMs: 60000 },
          { playerId: id(2), timeMs: 61000 },
        ], { eliminatedIds: [id(2)] }),
    );
    const rounds = replayTTFinals(emptyData({ ttEntries: universe24(), ttPhaseRounds: many }));
    expect(rounds).toHaveLength(TT_FINALS_MAX_ROUNDS);
  });

  it("ignores a result for a player outside the 24-player universe", () => {
    const data = emptyData({
      ttEntries: universe24(),
      ttPhaseRounds: [
        phaseRound("phase1", 1, "MC1", [
          { playerId: id(17), timeMs: 60000 },
          { playerId: "ghost", timeMs: 61000 }, // not in universe
          { playerId: id(18), timeMs: 99000 },
        ], { eliminatedIds: [id(18)] }),
      ],
    });
    const r = replayTTFinals(data)[0];
    expect(r.participants.has("ghost")).toBe(false);
    expect(r.participants.has(id(17))).toBe(true);
  });
});

// --------------------------------------------------------------------------
// replayTTFinals — full three-phase progression
// --------------------------------------------------------------------------

describe("replayTTFinals — three-phase progression", () => {
  it("plays phase1, then phase2, then phase3 and carries the ledger across phases", () => {
    // Minimal-but-valid three-phase run. We only assert the phase ordering and
    // that the phase-3 entry grant fires when phase-3 begins, since the precise
    // per-round wear-down is covered by the focused tests above.
    const elim = (p: number, ...runners: number[]) =>
      runners.map((n, i) => ({
        playerId: id(n),
        timeMs: n === p ? 99000 : 60000 + i * 1000,
      }));
    const data = emptyData({
      ttEntries: universe24(),
      ttPhaseRounds: [
        // phase1: ranks 17..24, eliminate the slowest until 4 remain.
        phaseRound("phase1", 1, "MC1", elim(24, 17, 18, 19, 20, 21, 22, 23, 24), {
          eliminatedIds: [id(24)],
        }),
        // phase2: survivors + ranks 13..16 (model with a single elimination).
        phaseRound("phase2", 1, "DP1", elim(16, 13, 14, 15, 16, 17, 18, 19, 20), {
          eliminatedIds: [id(16)],
        }),
        // phase3: top 12 + phase2 survivors begin the life system.
        phaseRound("phase3", 1, "GV1", [
          { playerId: id(1), timeMs: 60000 },
          { playerId: id(2), timeMs: 61000 },
          { playerId: id(3), timeMs: 62000 },
          { playerId: id(4), timeMs: 63000 },
        ]),
      ],
    });
    const rounds = replayTTFinals(data);
    expect(rounds.map((r) => r.course)).toEqual(["MC1", "DP1", "GV1"]);
    // Phase-3 round grants the +2 entry top-up to its runners.
    expect(rounds[2].gains.get(id(1))).toBe(2);
    // Phase-1 / phase-2 rounds never grant lives.
    expect(rounds[0].gains.size).toBe(0);
    expect(rounds[1].gains.size).toBe(0);
  });
});

// --------------------------------------------------------------------------
// replayTTFinals — sudden-death outcomes (folded into the parent round)
// --------------------------------------------------------------------------

describe("replayTTFinals — sudden-death resolution", () => {
  // CdmTournamentData has no sudden-death field (the export include does not
  // fetch TTPhaseSuddenDeathRound). This is by design: submitSuddenDeathResults
  // writes the resolved eliminatedIds / livesReset back onto the PARENT
  // TTPhaseRound (finals-phase-manager.ts:1666-1673), so the parent round
  // already carries the final outcome and the replay reconstructs it without a
  // separate SD round. A standalone SD ledger row would double-count the life
  // change. These tests pin that the parent-round outcome drives the ledger.

  it("phase1: uses the parent round's resolved eliminatedIds even when the stored times tie", () => {
    // Two players tie for slowest; a sudden death resolved p18 as the loser.
    // The parent round's results keep the original (tied) times, but its
    // eliminatedIds was set to the SD loser. The replay must mark p18, not p17.
    const data = emptyData({
      ttEntries: universe24(),
      ttPhaseRounds: [
        phaseRound("phase1", 1, "MC1", [
          { playerId: id(17), timeMs: 70000 }, // tie
          { playerId: id(18), timeMs: 70000 }, // tie → lost the sudden death
          { playerId: id(19), timeMs: 60000 },
          { playerId: id(20), timeMs: 61000 },
        ], { eliminatedIds: [id(18)] }),
      ],
    });
    const r = replayTTFinals(data)[0];
    expect(r.lostLife).toEqual(new Set([id(18)]));
    expect(r.livesAfter.get(id(18))).toBe(0);
    expect(r.livesAfter.get(id(17))).toBe(1);
  });

  it("phase3: honours a livesReset that a sudden death produced on the parent round", () => {
    // Wear two players to their last life, then a tie-broken round eliminates
    // both (count hits threshold 2) and the parent round records livesReset.
    const fourRunners = (slowA: number, slowB: number) => [
      { playerId: id(1), timeMs: 60000 },
      { playerId: id(2), timeMs: 61000 },
      { playerId: id(slowA), timeMs: 70000 },
      { playerId: id(slowB), timeMs: 70000 }, // tie resolved via sudden death
    ];
    const data = emptyData({
      ttEntries: universe24(),
      ttPhaseRounds: [
        phaseRound("phase3", 1, "MC1", fourRunners(3, 4)),
        phaseRound("phase3", 2, "DP1", fourRunners(3, 4)),
        phaseRound("phase3", 3, "GV1", fourRunners(3, 4), {
          eliminatedIds: [id(3), id(4)],
          livesReset: true,
        }),
      ],
    });
    const r3 = replayTTFinals(data)[2];
    expect(r3.livesAfter.get(id(1))).toBe(3);
    expect(r3.livesAfter.get(id(2))).toBe(3);
    expect(r3.livesAfter.get(id(3))).toBe(0);
    expect(r3.livesAfter.get(id(4))).toBe(0);
  });
});

// --------------------------------------------------------------------------
// buildTTFinalsWrites — no-data clearing path
// --------------------------------------------------------------------------

describe("buildTTFinalsWrites — no TT finals data", () => {
  it("clears every input cell of all 40 round blocks (template carries CDM 2025 data)", () => {
    const writes = buildTTFinalsWrites(emptyData());
    const map = indexWrites(writes, "TT Finals");

    // Round 1: Left C, Gain D, Time E rows 3..26; display Lost K rows 3..26;
    // header at G1 cleared.
    for (let row = 3; row <= 26; row++) {
      expectClear(map, `C${row}`);
      expectClear(map, `D${row}`);
      expectClear(map, `E${row}`);
      expectClear(map, `K${row}`);
    }
    expectClear(map, "G1"); // round-1 display header
    // Round 40: Gain SQ, Time SR, display Lost SX rows 3..26; Left SP is a
    // formula and must NOT be cleared (Left typed only in round 1).
    for (let row = 3; row <= 26; row++) {
      expectClear(map, `SQ${row}`);
      expectClear(map, `SR${row}`);
      expectClear(map, `SX${row}`);
    }
    expectClear(map, "ST1"); // round-40 display header
  });

  it("does NOT clear the Left column for rounds >= 2 (it is a spill formula)", () => {
    const writes = buildTTFinalsWrites(emptyData());
    const map = indexWrites(writes, "TT Finals");
    // r=2 Left is column P → must be untouched.
    for (let row = 3; row <= 26; row++) {
      expectUntouched(map, `P${row}`);
    }
  });

  it("never writes to the final standings block TA..TD", () => {
    const writes = buildTTFinalsWrites(emptyData());
    for (const w of writes) {
      expect(w.ref).not.toMatch(/^T[A-D]\d+$/);
    }
  });
});

// --------------------------------------------------------------------------
// buildTTFinalsWrites — data path
// --------------------------------------------------------------------------

describe("buildTTFinalsWrites — round 1 (phase1, 8 runners)", () => {
  function buildRound1Map(): Map<string, CdmCellWrite> {
    const runners = [17, 18, 19, 20, 21, 22, 23, 24];
    const data = emptyData({
      ttEntries: universe24(),
      ttPhaseRounds: [
        phaseRound(
          "phase1",
          1,
          "MC1",
          runners.map((n, i) => ({ playerId: id(n), timeMs: 60000 + i * 1000 })),
          { eliminatedIds: [id(24)] },
        ),
      ],
    });
    return indexWrites(buildTTFinalsWrites(data), "TT Finals");
  }

  it("writes the round header 'Round 1 - <full course name>' at G1", () => {
    expectString(buildRound1Map(), "G1", `Round 1 - ${CDM_COURSE_NAMES["MC1"]}`);
  });

  it("writes Left=1 for every universe row in round 1 (C3..C26)", () => {
    const map = buildRound1Map();
    for (let row = 3; row <= 26; row++) {
      expectNumber(map, `C${row}`, 1);
    }
  });

  it("writes each runner's time (MSSCC) and 0 for non-runners in the Time column", () => {
    // Round-1 input row order is rank 1..24, so row = 3 + (rank-1).
    // p17 (rank 17) → row 19, time 60000ms → msToCdmTime.
    const map = buildRound1Map();
    expectNumber(map, "E19", msToCdmTime(60000)); // p17, first runner
    expectNumber(map, "E26", msToCdmTime(60000 + 7 * 1000)); // p24, slowest runner
    // A non-runner (rank 1 → row 3) gets Time 0.
    expectNumber(map, "E3", 0);
  });

  it("clears the Gain column for round 1 (no phase-3 entry / reset here)", () => {
    const map = buildRound1Map();
    for (let row = 3; row <= 26; row++) {
      expectClear(map, `D${row}`);
    }
  });

  it("writes Lost=1 on the eliminated player's display row and clears the rest", () => {
    // p24 (slowest) lost a life. Display order sorts by time ASC with non-
    // runners first; p24 is the slowest runner → last display row = K26.
    const map = buildRound1Map();
    expectNumber(map, "K26", 1);
    expectClear(map, "K3");
  });
});

describe("buildTTFinalsWrites — runner with a null time writes 0", () => {
  it("encodes a present-but-null runner time as 0 in the Time column", () => {
    // A runner present in the round but with no recorded time should write 0
    // (matching how the replay sorts a null time with the non-runners). Such
    // data should not arise from submitRoundResults, but the writer is defensive.
    const data = emptyData({
      ttEntries: Array.from({ length: 4 }, (_, i) => qualEntry(id(i + 1), i + 1)),
      ttPhaseRounds: [
        {
          phase: "phase1",
          roundNumber: 1,
          course: "MC1",
          results: [
            { playerId: id(1), timeMs: 60000 },
            { playerId: id(2), timeMs: null }, // runner, no time
            { playerId: id(3), timeMs: 62000 },
            { playerId: id(4), timeMs: 99000 },
          ],
          eliminatedIds: [id(4)],
          livesReset: false,
        } as CdmTTPhaseRound,
      ],
    });
    const map = indexWrites(buildTTFinalsWrites(data), "TT Finals");
    // p02 (rank 2 → input row 4) has a null time → Time cell E4 = 0.
    expectNumber(map, "E4", 0);
    // A real runner still gets its encoded time (p03 rank 3 → row 5).
    expectNumber(map, "E5", msToCdmTime(62000));
  });
});

describe("buildTTFinalsWrites — phase-3 entry round writes the +2 Gain", () => {
  it("emits Gain=2 on each phase-3 entrant row and the round's times", () => {
    // Single phase-3 round as the only round → it is sheet round 1 (columns
    // C/D/E). The +2 entry grant lands in the Gain column.
    const data = emptyData({
      ttEntries: Array.from({ length: 4 }, (_, i) => qualEntry(id(i + 1), i + 1)),
      ttPhaseRounds: [
        phaseRound("phase3", 1, "MC1", [
          { playerId: id(1), timeMs: 60000 },
          { playerId: id(2), timeMs: 61000 },
          { playerId: id(3), timeMs: 62000 },
          { playerId: id(4), timeMs: 63000 },
        ]),
      ],
    });
    const map = indexWrites(buildTTFinalsWrites(data), "TT Finals");
    // Input rows: ranks 1..4 → rows 3..6. All four get Gain +2.
    for (let row = 3; row <= 6; row++) {
      expectNumber(map, `D${row}`, 2);
    }
    // Rows 7..26 have no runner and no gain → Gain cleared.
    expectClear(map, "D7");
  });
});

describe("buildTTFinalsWrites — second round uses the r=2 column block", () => {
  it("writes round 2 Time into column R and the header at T1, leaving Left (P) untouched", () => {
    const data = emptyData({
      ttEntries: universe24(),
      ttPhaseRounds: [
        phaseRound("phase1", 1, "MC1", [
          { playerId: id(17), timeMs: 60000 },
          { playerId: id(18), timeMs: 61000 },
          { playerId: id(19), timeMs: 62000 },
          { playerId: id(20), timeMs: 99000 },
        ], { eliminatedIds: [id(20)] }),
        phaseRound("phase1", 2, "DP1", [
          { playerId: id(17), timeMs: 60000 },
          { playerId: id(18), timeMs: 61000 },
          { playerId: id(19), timeMs: 62000 },
        ], { eliminatedIds: [id(19)] }),
      ],
    });
    const map = indexWrites(buildTTFinalsWrites(data), "TT Finals");
    expectString(map, "T1", `Round 2 - ${CDM_COURSE_NAMES["DP1"]}`);
    // Some R-column cell carries a written time; Left column P is never written.
    let rWritten = false;
    for (let row = 3; row <= 26; row++) {
      const w = map.get(`R${row}`);
      if (w && w.op === "number" && w.value > 0) rWritten = true;
      expectUntouched(map, `P${row}`); // Left is a formula for r>=2
    }
    expect(rWritten).toBe(true);
  });
});

describe("buildTTFinalsWrites — unused trailing rounds", () => {
  it("clears the input cells of round blocks that have no data", () => {
    const data = emptyData({
      ttEntries: universe24(),
      ttPhaseRounds: [
        phaseRound("phase1", 1, "MC1", [
          { playerId: id(17), timeMs: 60000 },
          { playerId: id(18), timeMs: 99000 },
        ], { eliminatedIds: [id(18)] }),
      ],
    });
    const map = indexWrites(buildTTFinalsWrites(data), "TT Finals");
    // Round 2 (columns Q Gain, R Time, X Lost) is unused → cleared.
    for (let row = 3; row <= 26; row++) {
      expectClear(map, `R${row}`);
      expectClear(map, `Q${row}`);
      expectClear(map, `X${row}`);
    }
  });
});

// --------------------------------------------------------------------------
// buildTTFinalsWrites — structural guarantees
// --------------------------------------------------------------------------

describe("buildTTFinalsWrites — structural", () => {
  it("emits one op per cell (no duplicate refs)", () => {
    const data = emptyData({
      ttEntries: universe24(),
      ttPhaseRounds: [
        phaseRound("phase1", 1, "MC1", [
          { playerId: id(17), timeMs: 60000 },
          { playerId: id(18), timeMs: 99000 },
        ], { eliminatedIds: [id(18)] }),
      ],
    });
    // indexWrites throws on a duplicate ref.
    expect(() => indexWrites(buildTTFinalsWrites(data), "TT Finals")).not.toThrow();
  });

  it("only writes to the 'TT Finals' sheet", () => {
    const writes = buildTTFinalsWrites(emptyData());
    for (const w of writes) expect(w.sheet).toBe("TT Finals");
  });

  it("confirms the data-row span matches TT_FINALS_FIRST_DATA_ROW..+23", () => {
    // Guards the constant wiring: 24 finalists, rows 3..26.
    expect(TT_FINALS_FIRST_DATA_ROW).toBe(3);
    expect(TT_FINALS_MAX_FINALISTS).toBe(24);
  });
});

// --------------------------------------------------------------------------
// Type-shape guard for the replay round (compile-time + a trivial runtime use)
// --------------------------------------------------------------------------

describe("TTFinalsReplayRound shape", () => {
  it("exposes the fields the writer consumes", () => {
    const round: TTFinalsReplayRound = {
      course: "MC1",
      participants: new Map(),
      lostLife: new Set(),
      gains: new Map(),
      inputRowOrder: [],
      displayRowOrder: [],
      livesAfter: new Map(),
    };
    expect(round.course).toBe("MC1");
  });
});
