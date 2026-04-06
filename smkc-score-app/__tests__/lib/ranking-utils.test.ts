/**
 * Tests for ranking-utils.ts
 *
 * TDD: these tests are written before the implementation to specify
 * the exact behavior of tie-aware ranking for BM/MR/GP qualification pages.
 *
 * 1224 competition ranking: tied entries share the same rank number.
 * e.g., three players at rank 2 → all get _autoRank=2, next player gets _autoRank=5.
 */

import { computeTieAwareRanks, findUnresolvedTies } from "../../src/lib/ranking-utils";

// Minimal entry type matching what the pages use
interface Entry {
  id: string;
  score: number;
  points: number;
  rankOverride: number | null;
}

/** Standard BM/MR comparator: score desc, points desc */
const bmCompareFn = (a: Entry, b: Entry) =>
  b.score - a.score || b.points - a.points;

/** GP comparator: points (driver points) desc, score desc */
const gpCompareFn = (a: Entry, b: Entry) =>
  b.points - a.points || b.score - a.score;

// ── computeTieAwareRanks ──────────────────────────────────────────────────────

describe("computeTieAwareRanks", () => {
  it("assigns sequential ranks when all entries are unique", () => {
    const entries: Entry[] = [
      { id: "a", score: 10, points: 3, rankOverride: null },
      { id: "b", score: 8, points: 2, rankOverride: null },
      { id: "c", score: 6, points: 1, rankOverride: null },
    ];
    const result = computeTieAwareRanks(entries, bmCompareFn);
    expect(result.map((e) => e._autoRank)).toEqual([1, 2, 3]);
  });

  it("assigns the same _autoRank to tied entries (1224 competition ranking)", () => {
    // a and b are tied at score=10, points=2
    const entries: Entry[] = [
      { id: "a", score: 10, points: 2, rankOverride: null },
      { id: "b", score: 10, points: 2, rankOverride: null },
      { id: "c", score: 6, points: 1, rankOverride: null },
    ];
    const result = computeTieAwareRanks(entries, bmCompareFn);
    const rankMap = Object.fromEntries(result.map((e) => [e.id, e._autoRank]));
    expect(rankMap["a"]).toBe(1);
    expect(rankMap["b"]).toBe(1);
    // c skips rank 2 and becomes rank 3 (1224 ranking)
    expect(rankMap["c"]).toBe(3);
  });

  it("handles three-way tie correctly", () => {
    const entries: Entry[] = [
      { id: "a", score: 5, points: 0, rankOverride: null },
      { id: "b", score: 5, points: 0, rankOverride: null },
      { id: "c", score: 5, points: 0, rankOverride: null },
      { id: "d", score: 2, points: 0, rankOverride: null },
    ];
    const result = computeTieAwareRanks(entries, bmCompareFn);
    const rankMap = Object.fromEntries(result.map((e) => [e.id, e._autoRank]));
    expect(rankMap["a"]).toBe(1);
    expect(rankMap["b"]).toBe(1);
    expect(rankMap["c"]).toBe(1);
    expect(rankMap["d"]).toBe(4);
  });

  it("sorts output by effective rank (rankOverride ?? _autoRank)", () => {
    // c has rankOverride=1 so should appear first
    const entries: Entry[] = [
      { id: "a", score: 10, points: 3, rankOverride: null },
      { id: "b", score: 8, points: 2, rankOverride: null },
      { id: "c", score: 6, points: 1, rankOverride: 1 },
    ];
    const result = computeTieAwareRanks(entries, bmCompareFn);
    expect(result[0].id).toBe("c"); // override=1 moves c to top
    expect(result[1].id).toBe("a");
    expect(result[2].id).toBe("b");
  });

  it("uses GP comparator (points primary, score secondary)", () => {
    const entries: Entry[] = [
      { id: "a", score: 8, points: 6, rankOverride: null },
      { id: "b", score: 10, points: 9, rankOverride: null },
      { id: "c", score: 5, points: 3, rankOverride: null },
    ];
    const result = computeTieAwareRanks(entries, gpCompareFn);
    expect(result[0].id).toBe("b"); // highest driver points
    expect(result[1].id).toBe("a");
    expect(result[2].id).toBe("c");
  });

  it("places overridden entry before auto-ranked entry when effective ranks collide", () => {
    // a has override=2; b has _autoRank=2 via sort; both effective rank = 2
    // Admin-overridden entries should sort first among equal effective ranks
    const entries: Entry[] = [
      { id: "a", score: 10, points: 3, rankOverride: 2 },
      { id: "b", score: 8, points: 2, rankOverride: null },
      { id: "c", score: 6, points: 1, rankOverride: null },
    ];
    const result = computeTieAwareRanks(entries, bmCompareFn);
    const aIdx = result.findIndex((e) => e.id === "a");
    const bIdx = result.findIndex((e) => e.id === "b");
    expect(aIdx).toBeLessThan(bIdx);
  });

  it("returns empty array for empty input", () => {
    expect(computeTieAwareRanks([], bmCompareFn)).toEqual([]);
  });
});

// ── findUnresolvedTies ────────────────────────────────────────────────────────

describe("findUnresolvedTies", () => {
  it("returns empty set when there are no ties", () => {
    const entries = [
      { id: "a", score: 10, points: 2, rankOverride: null, _autoRank: 1 },
      { id: "b", score: 8, points: 1, rankOverride: null, _autoRank: 2 },
    ];
    expect(findUnresolvedTies(entries).size).toBe(0);
  });

  it("returns IDs of both tied entries when unresolved", () => {
    const entries = [
      { id: "a", score: 10, points: 2, rankOverride: null, _autoRank: 1 },
      { id: "b", score: 10, points: 2, rankOverride: null, _autoRank: 1 },
      { id: "c", score: 6, points: 1, rankOverride: null, _autoRank: 3 },
    ];
    const ties = findUnresolvedTies(entries);
    expect(ties.has("a")).toBe(true);
    expect(ties.has("b")).toBe(true);
    expect(ties.has("c")).toBe(false);
  });

  it("does NOT include a tie group if ALL members have distinct overrides", () => {
    // Only when every tied member has a unique rankOverride is the group fully resolved
    const entries = [
      { id: "a", score: 10, points: 2, rankOverride: 1, _autoRank: 1 },
      { id: "b", score: 10, points: 2, rankOverride: 2, _autoRank: 1 },
    ];
    expect(findUnresolvedTies(entries).size).toBe(0);
  });

  it("still flags a group as unresolved when override values are duplicated", () => {
    // Admin accidentally assigns the same rank to two tied players — still ambiguous
    const entries = [
      { id: "a", score: 10, points: 2, rankOverride: 1, _autoRank: 1 },
      { id: "b", score: 10, points: 2, rankOverride: 1, _autoRank: 1 },
    ];
    const ties = findUnresolvedTies(entries);
    expect(ties.has("a")).toBe(true);
    expect(ties.has("b")).toBe(true);
  });

  it("treats a group as unresolved if only SOME members have overrides", () => {
    // Partial override: one member resolved, one still ambiguous — still unresolved
    const entries = [
      { id: "a", score: 10, points: 2, rankOverride: 1, _autoRank: 1 },
      { id: "b", score: 10, points: 2, rankOverride: null, _autoRank: 1 },
    ];
    const ties = findUnresolvedTies(entries);
    expect(ties.has("a")).toBe(true);
    expect(ties.has("b")).toBe(true);
  });

  it("handles multiple independent tie groups", () => {
    const entries = [
      { id: "a", score: 10, points: 2, rankOverride: null, _autoRank: 1 },
      { id: "b", score: 10, points: 2, rankOverride: null, _autoRank: 1 },
      { id: "c", score: 5, points: 1, rankOverride: null, _autoRank: 3 },
      { id: "d", score: 5, points: 1, rankOverride: null, _autoRank: 3 },
    ];
    const ties = findUnresolvedTies(entries);
    expect(ties.size).toBe(4);
  });
});
