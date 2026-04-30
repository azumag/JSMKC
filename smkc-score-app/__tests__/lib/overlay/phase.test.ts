/**
 * Tests for computeCurrentPhase — the pure decision tree that turns four
 * primitive tournament-state inputs into the single Japanese label shown in
 * the OBS dashboard footer.
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
  it("returns 予選 by default when nothing has been confirmed", () => {
    expect(computeCurrentPhase(input())).toBe("予選");
  });

  it("returns 予選確定 once qualification is locked but no barrage/finals exists", () => {
    expect(computeCurrentPhase(input({ qualificationConfirmed: true }))).toBe("予選確定");
  });

  it("returns TA フェーズ1 ラウンド<n> when TA is in phase1 with rounds", () => {
    expect(
      computeCurrentPhase(
        input({
          qualificationConfirmed: true,
          taCurrentPhase: "phase1",
          taLatestPhaseRoundNumber: 3,
        }),
      ),
    ).toBe("TA フェーズ1 ラウンド3");
  });

  it("returns TA フェーズ2 ラウンド<n> when TA is in phase2 with rounds", () => {
    expect(
      computeCurrentPhase(
        input({
          qualificationConfirmed: true,
          taCurrentPhase: "phase2",
          taLatestPhaseRoundNumber: 2,
        }),
      ),
    ).toBe("TA フェーズ2 ラウンド2");
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
    ).toBe("TA フェーズ1");
  });

  it("returns TA フェーズ3 ラウンド<n> when TA reaches phase3", () => {
    expect(
      computeCurrentPhase(
        input({
          qualificationConfirmed: true,
          taCurrentPhase: "phase3",
          taLatestPhaseRoundNumber: 4,
        }),
      ),
    ).toBe("TA フェーズ3 ラウンド4");
  });

  it("maps known BM/MR/GP finals rounds to mode-prefixed Japanese labels", () => {
    const cases: Array<[string, string]> = [
      ["winners_qf", "BM 決勝 QF"],
      ["qf", "BM 決勝 QF"],
      ["winners_sf", "BM 決勝 SF"],
      ["winners_final", "BM 決勝 勝者決勝"],
      ["losers_r1", "BM 決勝 敗者R1"],
      ["losers_r4", "BM 決勝 敗者R4"],
      ["losers_sf", "BM 決勝 敗者準決勝"],
      ["losers_final", "BM 決勝 敗者決勝"],
      ["grand_final", "BM 決勝 グランドF"],
      ["grand_final_reset", "BM 決勝 リセット"],
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
    ).toBe("MR 決勝 QF");
    expect(
      computeCurrentPhase(
        input({ qualificationConfirmed: true, latestFinalsRound: "winners_sf", latestFinalsMode: "gp" }),
      ),
    ).toBe("GP 決勝 SF");
  });

  it("falls through unchanged for unknown finals round strings (forward compat)", () => {
    expect(
      computeCurrentPhase(
        input({ qualificationConfirmed: true, latestFinalsRound: "weird_round_x", latestFinalsMode: "bm" }),
      ),
    ).toBe("BM 決勝 weird_round_x");
  });

  it("prefers a finals round over an in-progress TA phase (highest signal wins)", () => {
    // BM is in QF while TA phase2 is still running — broadcast should show
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
    ).toBe("BM 決勝 QF");
  });
});

describe("computeCurrentPhaseFormat", () => {
  it("returns FT5 for BM bracket finals", () => {
    expect(
      computeCurrentPhaseFormat(
        input({
          qualificationConfirmed: true,
          latestFinalsRound: "winners_qf",
          latestFinalsMode: "bm",
        }),
      ),
    ).toBe("FT5");
  });

  it("returns FT5 for MR bracket finals", () => {
    expect(
      computeCurrentPhaseFormat(
        input({
          qualificationConfirmed: true,
          latestFinalsRound: "grand_final",
          latestFinalsMode: "mr",
        }),
      ),
    ).toBe("FT5");
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
    expect(buildMatchLabel("winners_qf", { winners_qf: "QF" }, "bm")).toBe("BM 決勝 QF");
    expect(buildMatchLabel("winners_sf", { winners_sf: "SF" }, "mr")).toBe("MR 決勝 SF");
    expect(buildMatchLabel("grand_final", { grand_final: "グランドF" }, "gp")).toBe("GP 決勝 グランドF");
  });

  it("keeps the legacy no-mode label when mode is omitted", () => {
    expect(buildMatchLabel("winners_qf", { winners_qf: "QF" })).toBe("決勝 QF");
  });
});
