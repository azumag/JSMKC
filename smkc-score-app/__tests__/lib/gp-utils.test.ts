/**
 * Tests for gp-utils.ts
 *
 * Covers formatGpPosition: English ordinal suffixes (with 11th/12th/13th
 * edge cases), Japanese locale, and position=0 game-over sentinel.
 */

import { formatGpPosition } from "../../src/lib/gp-utils";

describe("formatGpPosition", () => {
  // ── Position 0 (game-over sentinel) ────────────────────────────────────────

  it("returns gameOverLabel when position is 0", () => {
    expect(formatGpPosition(0, "en", "Game Over")).toBe("Game Over");
    expect(formatGpPosition(0, "ja", "ゲームオーバー")).toBe("ゲームオーバー");
  });

  // ── Japanese locale ────────────────────────────────────────────────────────

  it("formats Japanese ordinals as N位", () => {
    expect(formatGpPosition(1, "ja", "")).toBe("1位");
    expect(formatGpPosition(5, "ja", "")).toBe("5位");
    expect(formatGpPosition(11, "ja", "")).toBe("11位");
    expect(formatGpPosition(100, "ja", "")).toBe("100位");
  });

  // ── English locale: standard suffixes ──────────────────────────────────────

  it("formats 1st, 2nd, 3rd correctly", () => {
    expect(formatGpPosition(1, "en", "")).toBe("1st");
    expect(formatGpPosition(2, "en", "")).toBe("2nd");
    expect(formatGpPosition(3, "en", "")).toBe("3rd");
  });

  it("formats 4th and above with -th suffix", () => {
    expect(formatGpPosition(4, "en", "")).toBe("4th");
    expect(formatGpPosition(5, "en", "")).toBe("5th");
    expect(formatGpPosition(8, "en", "")).toBe("8th");
    expect(formatGpPosition(10, "en", "")).toBe("10th");
  });

  // ── English locale: 11th/12th/13th edge cases ─────────────────────────────

  it("handles 11th, 12th, 13th (not 11st, 12nd, 13rd)", () => {
    expect(formatGpPosition(11, "en", "")).toBe("11th");
    expect(formatGpPosition(12, "en", "")).toBe("12th");
    expect(formatGpPosition(13, "en", "")).toBe("13th");
  });

  // ── English locale: 21st, 22nd, 23rd ──────────────────────────────────────

  it("handles 21st, 22nd, 23rd correctly", () => {
    expect(formatGpPosition(21, "en", "")).toBe("21st");
    expect(formatGpPosition(22, "en", "")).toBe("22nd");
    expect(formatGpPosition(23, "en", "")).toBe("23rd");
  });

  // ── Non-"ja" locale falls through to English ordinal ──────────────────────

  it("treats unknown locales as English", () => {
    expect(formatGpPosition(1, "de", "")).toBe("1st");
    expect(formatGpPosition(3, "fr", "")).toBe("3rd");
  });
});
