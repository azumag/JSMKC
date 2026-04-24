/**
 * @module __tests__/lib/public-modes.test.ts
 * @description Tests for sequential publication logic used to reveal qualification
 * modes (TA → BM → MR → GP) to non-admin viewers one stage at a time.
 */
import {
  MODE_REVEAL_ORDER,
  publishMode,
  unpublishMode,
  isSequentialPrefix,
} from "@/lib/public-modes";

describe("MODE_REVEAL_ORDER", () => {
  it("enforces the canonical TA → BM → MR → GP order", () => {
    expect(MODE_REVEAL_ORDER).toEqual(["ta", "bm", "mr", "gp"]);
  });
});

describe("publishMode", () => {
  it("publishing TA alone publishes only TA", () => {
    expect(publishMode("ta")).toEqual(["ta"]);
  });

  it("publishing BM cascades to include TA", () => {
    expect(publishMode("bm")).toEqual(["ta", "bm"]);
  });

  it("publishing MR cascades to include TA and BM", () => {
    expect(publishMode("mr")).toEqual(["ta", "bm", "mr"]);
  });

  it("publishing GP publishes all prior modes", () => {
    expect(publishMode("gp")).toEqual(["ta", "bm", "mr", "gp"]);
  });
});

describe("unpublishMode", () => {
  it("unpublishing TA cascades to unpublish everything", () => {
    expect(unpublishMode("ta")).toEqual([]);
  });

  it("unpublishing BM keeps TA public but hides BM/MR/GP", () => {
    expect(unpublishMode("bm")).toEqual(["ta"]);
  });

  it("unpublishing MR hides MR and GP, keeps TA and BM", () => {
    expect(unpublishMode("mr")).toEqual(["ta", "bm"]);
  });

  it("unpublishing GP only hides GP", () => {
    expect(unpublishMode("gp")).toEqual(["ta", "bm", "mr"]);
  });
});

describe("isSequentialPrefix", () => {
  it.each([
    [[]],
    [["ta"]],
    [["ta", "bm"]],
    [["ta", "bm", "mr"]],
    [["ta", "bm", "mr", "gp"]],
  ])("accepts valid prefix %p", (modes) => {
    expect(isSequentialPrefix(modes)).toBe(true);
  });

  it.each([
    // Gaps: BM without TA, MR without BM, etc.
    [["bm"]],
    [["mr"]],
    [["gp"]],
    [["ta", "mr"]],
    [["ta", "gp"]],
    // Wrong order
    [["bm", "ta"]],
    // Duplicates
    [["ta", "ta"]],
    // Unknown mode
    [["foo"]],
    // Too long
    [["ta", "bm", "mr", "gp", "extra"]],
  ])("rejects invalid sequence %p", (modes) => {
    expect(isSequentialPrefix(modes)).toBe(false);
  });
});
