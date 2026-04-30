/**
 * Tests for computeCurrentPhase — the pure decision tree that turns four
 * primitive tournament-state inputs into the single label shown in the OBS
 * dashboard footer.
 *
 * Coverage targets one assertion per branch in priority order, plus the two
 * non-obvious behaviors:
 *  - finals priority over TA phases (a BM finals match supersedes a TA
 *    phase2 in progress, because finals = highest signal)
 *  - unknown finals round strings fall through unchanged (forward compat)
 */

import {
  buildMatchLabel,
  computeCurrentPhase,
  computeCurrentPhaseFormat,
} from "@/lib/overlay/phase";

function input(overrides: Partial<Parameters<typeof computeCurrentPhase>[0]> = {}) {
  return {
    qualificationConfirmed: false,
    taCurrentPhase: "qualification" as const,
    taLatestPhaseRoundNumber: null,
    latestFinalsRound: null,
    latestFinalsMode: null,
    ...overrides,
  };
}

describe("computeCurrentPhase", () => {
  it("returns Qualification by default when nothing has been confirmed", () => {
    expect(computeCurrentPhase(input())).toBe("Qualification");
  });

  it("returns Qualification Locked once qualification is locked but no barrage/finals exists", () => {
    expect(computeCurrentPhase(input({ qualificationConfirmed: true }))).toBe("Qualification Locked");
  });

  it("returns Time Attack Phase 1 Round <n> when TA is in phase1 with rounds", () => {
    expect(
      computeCurrentPhase(
        input({
          qualificationConfirmed: true,
          taCurrentPhase: "phase1",
          taLatestPhaseRoundNumber: 3,
        }),
      ),
    ).toBe("Time Attack Phase 1 Round 3");
  });

  it("returns Time Attack Phase 2 Round <n> when TA is in phase2 with rounds", () => {
    expect(
      computeCurrentPhase(
        input({
          qualificationConfirmed: true,
          taCurrentPhase: "phase2",
          taLatestPhaseRoundNumber: 2,
        }),
      ),
    ).toBe("Time Attack Phase 2 Round 2");
  });

  it("omits the round suffix when TA phase has entries but no rounds yet", () => {
    expect(
      computeCurrentPhase(
        input({
          qualificationConfirmed: true,
          taCurrentPhase: "phase1",
          taLatestPhaseRoundNumber: null,
        }),
      ),
    ).toBe("Time Attack Phase 1");
  });

  it("returns Time Attack Phase 3 Round <n> when TA reaches phase3", () => {
    expect(
      computeCurrentPhase(
        input({
          qualificationConfirmed: true,
          taCurrentPhase: "phase3",
          taLatestPhaseRoundNumber: 4,
        }),
      ),
    ).toBe("Time Attack Phase 3 Round 4");
  });

  it("maps known BM/MR/GP finals rounds to mode-prefixed English labels", () => {
    const cases: Array<[string, string]> = [
      ["winners_qf", "Battle Mode Finals Winners Quarter Final"],
      ["qf", "Battle Mode Finals Quarter Final"],
      ["winners_sf", "Battle Mode Finals Winners Semi Final"],
      ["winners_final", "Battle Mode Finals Winners Final"],
      ["losers_r1", "Battle Mode Finals Losers Round 1"],
      ["losers_r4", "Battle Mode Finals Losers Round 4"],
      ["losers_sf", "Battle Mode Finals Losers Semi Final"],
      ["losers_final", "Battle Mode Finals Losers Final"],
      ["grand_final", "Battle Mode Finals Grand Final"],
      ["grand_final_reset", "Battle Mode Finals Grand Final Reset"],
    ];
    for (const [round, expected] of cases) {
      expect(
        computeCurrentPhase(
          input({ qualificationConfirmed: true, latestFinalsRound: round, latestFinalsMode: "bm" }),
        ),
      ).toBe(expected);
    }
  });

  it("uses the active BM/MR/GP mode in finals labels", () => {
    expect(
      computeCurrentPhase(
        input({ qualificationConfirmed: true, latestFinalsRound: "winners_qf", latestFinalsMode: "mr" }),
      ),
    ).toBe("Match Race Finals Winners Quarter Final");
    expect(
      computeCurrentPhase(
        input({ qualificationConfirmed: true, latestFinalsRound: "winners_sf", latestFinalsMode: "gp" }),
      ),
    ).toBe("Grand Prix Finals Winners Semi Final");
  });

  it("falls through unchanged for unknown finals round strings (forward compat)", () => {
    expect(
      computeCurrentPhase(
        input({ qualificationConfirmed: true, latestFinalsRound: "weird_round_x", latestFinalsMode: "bm" }),
      ),
    ).toBe("Battle Mode Finals weird_round_x");
  });

  it("prefers a finals round over an in-progress TA phase (highest signal wins)", () => {
    // BM is in winners quarter final while TA phase2 is still running — broadcast should show
    // the bracket-finals round, not the barrage.
    expect(
      computeCurrentPhase(
        input({
          qualificationConfirmed: true,
          taCurrentPhase: "phase2",
          taLatestPhaseRoundNumber: 2,
          latestFinalsRound: "winners_qf",
          latestFinalsMode: "bm",
        }),
      ),
    ).toBe("Battle Mode Finals Winners Quarter Final");
  });
});

describe("computeCurrentPhaseFormat", () => {
  it("returns First to 5 for BM bracket finals", () => {
    expect(
      computeCurrentPhaseFormat(
        input({
          qualificationConfirmed: true,
          latestFinalsRound: "winners_qf",
          latestFinalsMode: "bm",
        }),
      ),
    ).toBe("First to 5");
  });

  it("returns First to 5 for MR bracket finals", () => {
    expect(
      computeCurrentPhaseFormat(
        input({
          qualificationConfirmed: true,
          latestFinalsRound: "grand_final",
          latestFinalsMode: "mr",
        }),
      ),
    ).toBe("First to 5");
  });

  it("returns null for GP finals (point-total, no first-to threshold)", () => {
    expect(
      computeCurrentPhaseFormat(
        input({
          qualificationConfirmed: true,
          latestFinalsRound: "winners_sf",
          latestFinalsMode: "gp",
        }),
      ),
    ).toBeNull();
  });

  it("returns null while qualification or barrage is active", () => {
    expect(computeCurrentPhaseFormat(input())).toBeNull();
    expect(
      computeCurrentPhaseFormat(
        input({ qualificationConfirmed: true, taCurrentPhase: "phase1", taLatestPhaseRoundNumber: 2 }),
      ),
    ).toBeNull();
  });

  it("returns null when TA reaches phase3 (TA finals are timed, not FT)", () => {
    expect(
      computeCurrentPhaseFormat(
        input({
          qualificationConfirmed: true,
          taCurrentPhase: "phase3",
          taLatestPhaseRoundNumber: 2,
        }),
      ),
    ).toBeNull();
  });
});

describe("buildMatchLabel", () => {
  it("prefixes pinned BM/MR/GP footer labels with their mode", () => {
    expect(buildMatchLabel("winners_qf", { winners_qf: "QF" }, "bm")).toBe(
      "Battle Mode Finals Winners Quarter Final",
    );
    expect(buildMatchLabel("winners_sf", { winners_sf: "SF" }, "mr")).toBe(
      "Match Race Finals Winners Semi Final",
    );
    expect(buildMatchLabel("grand_final", { grand_final: "Grand Final" }, "gp")).toBe(
      "Grand Prix Finals Grand Final",
    );
  });

  it("keeps the legacy no-mode label when mode is omitted", () => {
    expect(buildMatchLabel("winners_qf", { winners_qf: "QF" })).toBe("Finals Winners Quarter Final");
  });
});
