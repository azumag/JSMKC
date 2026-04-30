/**
 * @module __tests__/lib/public-modes.test.ts
 * @description Tests for the independent per-mode publish helpers used to reveal
 * each tournament section to non-admin viewers. Each section toggles
 * independently — there is no cascade or ordering constraint.
 */
import {
  MODE_REVEAL_ORDER,
  addPublicMode,
  removePublicMode,
  isValidPublicModes,
} from "@/lib/public-modes";

describe("MODE_REVEAL_ORDER", () => {
  it("enforces the canonical display order", () => {
    expect(MODE_REVEAL_ORDER).toEqual(["ta", "bm", "mr", "gp", "overall"]);
  });
});

describe("addPublicMode", () => {
  it("adds a mode to an empty set", () => {
    expect(addPublicMode([], "bm")).toEqual(["bm"]);
  });

  it("adds a mode without affecting other modes (no cascade)", () => {
    expect(addPublicMode([], "mr")).toEqual(["mr"]);
    expect(addPublicMode(["gp"], "ta")).toEqual(["ta", "gp"]);
    expect(addPublicMode(["bm"], "overall")).toEqual(["bm", "overall"]);
  });

  it("is idempotent — adding the same mode twice does not duplicate", () => {
    expect(addPublicMode(["bm"], "bm")).toEqual(["bm"]);
  });

  it("normalizes output to MODE_REVEAL_ORDER for stable storage", () => {
    expect(addPublicMode(["overall", "gp", "bm"], "ta")).toEqual([
      "ta",
      "bm",
      "gp",
      "overall",
    ]);
  });

  it("filters out invalid mode names from existing array", () => {
    expect(addPublicMode(["foo", "bm"] as string[], "ta")).toEqual(["ta", "bm"]);
  });
});

describe("removePublicMode", () => {
  it("removes only the named mode (no cascade to other modes)", () => {
    expect(removePublicMode(["ta", "bm", "mr", "gp", "overall"], "bm")).toEqual([
      "ta",
      "mr",
      "gp",
      "overall",
    ]);
  });

  it("returns an unchanged set when the mode is not present", () => {
    expect(removePublicMode(["ta"], "gp")).toEqual(["ta"]);
  });

  it("returns empty when removing the only public mode", () => {
    expect(removePublicMode(["bm"], "bm")).toEqual([]);
  });

  it("normalizes output to MODE_REVEAL_ORDER and dedupes", () => {
    expect(
      removePublicMode(["gp", "bm", "ta", "bm"] as string[], "bm")
    ).toEqual(["ta", "gp"]);
  });

  it("filters out invalid mode names", () => {
    expect(removePublicMode(["foo", "ta"] as string[], "ta")).toEqual([]);
  });
});

describe("isValidPublicModes", () => {
  it.each([
    [[]],
    [["ta"]],
    [["bm"]],
    [["mr"]],
    [["gp"]],
    [["overall"]],
    [["ta", "bm"]],
    // Non-prefix subsets are now valid (independent toggling)
    [["bm", "gp"]],
    [["ta", "mr"]],
    [["mr", "gp"]],
    [["gp", "overall"]],
    [["ta", "bm", "mr", "gp", "overall"]],
    // Order is irrelevant — the API will store as-is
    [["overall", "gp", "ta"]],
  ])("accepts valid subset %p", (modes) => {
    expect(isValidPublicModes(modes)).toBe(true);
  });

  it.each([
    // Unknown mode names
    [["foo"]],
    [["ta", "foo"]],
    // Duplicates
    [["ta", "ta"]],
    [["bm", "mr", "bm"]],
    // Non-string entries
    [[1] as unknown[]],
    [[null] as unknown[]],
  ])("rejects invalid input %p", (modes) => {
    expect(isValidPublicModes(modes)).toBe(false);
  });
});
