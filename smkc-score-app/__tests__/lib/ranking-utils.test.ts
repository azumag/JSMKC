/**
 * Tests for ranking-utils.ts
 *
 * TDD: these tests are written before the implementation to specify
 * the exact behavior of tie-aware ranking for BM/MR/GP qualification pages.
 *
 * 1224 competition ranking: tied entries share the same rank number.
 * e.g., three players at rank 2 → all get _autoRank=2, next player gets _autoRank=5.
 */

import {
  buildPlayoffRankAssignments,
  collectPlayoffGroups,
  computeCombinedRanks,
  computeTieAwareRanks,
  filterActiveTiedIds,
  findUnresolvedTies,
} from "../../src/lib/ranking-utils";

// Minimal entry type matching what the pages use
interface Entry {
  id: string;
  score: number;
  points: number;
  rankOverride: number | null;
  _rank?: number;
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

  it("trusts server-provided _rank instead of recomputing via compareFn", () => {
    // Even though scores differ, the server says _rank=1 for both (H2H tiebreaker
    // or admin override pre-applied).  Client should respect _rank.
    const entries: Entry[] = [
      { id: "a", score: 10, points: 3, rankOverride: null, _rank: 1 },
      { id: "b", score: 8, points: 2, rankOverride: null, _rank: 1 },
      { id: "c", score: 6, points: 1, rankOverride: null, _rank: 3 },
    ];
    const result = computeTieAwareRanks(entries, bmCompareFn);
    expect(result.map((e) => e._autoRank)).toEqual([1, 1, 3]);
  });
});

// ── computeCombinedRanks ─────────────────────────────────────────────────────

describe("computeCombinedRanks", () => {
  it("assigns 1224 ranks across all entries using only the comparator", () => {
    const entries: Entry[] = [
      { id: "a", score: 10, points: 2, rankOverride: null },
      { id: "b", score: 10, points: 2, rankOverride: null },
      { id: "c", score: 8, points: 1, rankOverride: null },
    ];
    const result = computeCombinedRanks(entries, bmCompareFn);
    expect(result.map((e) => [e.id, e._autoRank])).toEqual([
      ["a", 1],
      ["b", 1],
      ["c", 3],
    ]);
  });

  it("ignores group-scoped rankOverride and server _rank in combined display", () => {
    const entries: Entry[] = [
      { id: "a", score: 10, points: 2, rankOverride: null, _rank: 3 },
      { id: "b", score: 8, points: 1, rankOverride: 1, _rank: 1 },
    ];
    const result = computeCombinedRanks(entries, bmCompareFn);
    expect(result.map((e) => [e.id, e._autoRank])).toEqual([
      ["a", 1],
      ["b", 2],
    ]);
  });

  it("uses the GP comparator for combined GP standings", () => {
    const entries: Entry[] = [
      { id: "a", score: 10, points: 6, rankOverride: null },
      { id: "b", score: 8, points: 9, rankOverride: null },
    ];
    const result = computeCombinedRanks(entries, gpCompareFn);
    expect(result[0].id).toBe("b");
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
    // Distinct effective ranks → no collision
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

  it("flags a 2-way tie when one member has an override that collides with the other's _autoRank", () => {
    // a gets override=1, so b (no override, _autoRank=1) collides at effective rank 1
    const entries = [
      { id: "a", score: 10, points: 2, rankOverride: 1, _autoRank: 1 },
      { id: "b", score: 10, points: 2, rankOverride: null, _autoRank: 1 },
    ];
    const ties = findUnresolvedTies(entries);
    expect(ties.has("a")).toBe(true);
    expect(ties.has("b")).toBe(true);
  });

  it("flags a 3-way tie when N-1 distinct overrides collide with the remaining _autoRank", () => {
    // a=1, b=2, c has no override so effective rank = 1 → collides with a
    const entries = [
      { id: "a", score: 10, points: 2, rankOverride: 1, _autoRank: 1 },
      { id: "b", score: 10, points: 2, rankOverride: 2, _autoRank: 1 },
      { id: "c", score: 10, points: 2, rankOverride: null, _autoRank: 1 },
    ];
    const ties = findUnresolvedTies(entries);
    // a and c share effective rank 1; b is alone at rank 2
    expect(ties.size).toBe(2);
    expect(ties.has("a")).toBe(true);
    expect(ties.has("c")).toBe(true);
    expect(ties.has("b")).toBe(false);
  });

  it("flags a 4-way tie when N-1 distinct overrides collide with the remaining _autoRank", () => {
    // a=1, b=2, c=3, d has no override so effective rank = 1 → collides with a
    const entries = [
      { id: "a", score: 5, points: 0, rankOverride: 1, _autoRank: 1 },
      { id: "b", score: 5, points: 0, rankOverride: 2, _autoRank: 1 },
      { id: "c", score: 5, points: 0, rankOverride: 3, _autoRank: 1 },
      { id: "d", score: 5, points: 0, rankOverride: null, _autoRank: 1 },
    ];
    const ties = findUnresolvedTies(entries);
    // a and d share effective rank 1; b and c are alone
    expect(ties.size).toBe(2);
    expect(ties.has("a")).toBe(true);
    expect(ties.has("d")).toBe(true);
    expect(ties.has("b")).toBe(false);
    expect(ties.has("c")).toBe(false);
  });

  it("keeps a 3-way tie unresolved when only 1 of 3 members has an override", () => {
    // Only 1 override among 3 tied entries: 2 positions remain ambiguous.
    const entries = [
      { id: "a", score: 10, points: 2, rankOverride: 1, _autoRank: 1 },
      { id: "b", score: 10, points: 2, rankOverride: null, _autoRank: 1 },
      { id: "c", score: 10, points: 2, rankOverride: null, _autoRank: 1 },
    ];
    const ties = findUnresolvedTies(entries);
    expect(ties.size).toBe(3);
  });

  it("keeps a 3-way tie unresolved when 2 overrides are set but not distinct", () => {
    // N-1=2 overrides exist, but both are rank 1 (duplicate) → still ambiguous.
    const entries = [
      { id: "a", score: 10, points: 2, rankOverride: 1, _autoRank: 1 },
      { id: "b", score: 10, points: 2, rankOverride: 1, _autoRank: 1 },
      { id: "c", score: 10, points: 2, rankOverride: null, _autoRank: 1 },
    ];
    const ties = findUnresolvedTies(entries);
    expect(ties.size).toBe(3);
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

  it("detects collision between an override and a different player's _autoRank", () => {
    // a (override=2) collides with b (_autoRank=2) even though they were never
    // tied in the original ordering.
    const entries = [
      { id: "a", score: 10, points: 2, rankOverride: 2, _autoRank: 1 },
      { id: "b", score: 8, points: 1, rankOverride: null, _autoRank: 2 },
    ];
    const ties = findUnresolvedTies(entries);
    expect(ties.has("a")).toBe(true);
    expect(ties.has("b")).toBe(true);
  });

  it("detects collision between overrides from different original autoRanks", () => {
    const entries = [
      { id: "a", score: 10, points: 2, rankOverride: 3, _autoRank: 1 },
      { id: "b", score: 8, points: 1, rankOverride: 3, _autoRank: 2 },
    ];
    const ties = findUnresolvedTies(entries);
    expect(ties.has("a")).toBe(true);
    expect(ties.has("b")).toBe(true);
  });
});

// ── filterActiveTiedIds ───────────────────────────────────────────────────────

describe("filterActiveTiedIds", () => {
  it("returns empty set when all players have mp=0 (group just set up)", () => {
    // This is the primary motivating case: suppress the tiebreaker warning
    // immediately after group setup when all scores are trivially 0-0.
    const tiedIds = new Set(["a", "b", "c"]);
    const entries = [
      { id: "a", mp: 0 },
      { id: "b", mp: 0 },
      { id: "c", mp: 0 },
    ];
    expect(filterActiveTiedIds(tiedIds, entries).size).toBe(0);
  });

  it("passes through the full set when all tied players have played", () => {
    const tiedIds = new Set(["a", "b"]);
    const entries = [
      { id: "a", mp: 2 },
      { id: "b", mp: 2 },
    ];
    const result = filterActiveTiedIds(tiedIds, entries);
    expect(result.has("a")).toBe(true);
    expect(result.has("b")).toBe(true);
  });

  it("excludes zero-mp players from a partially-played group", () => {
    // a and b have played and are genuinely tied at the same score.
    // c has not played yet (bye round or group not started) — its 0-0 tie is trivial.
    const tiedIds = new Set(["a", "b", "c"]);
    const entries = [
      { id: "a", mp: 1 },
      { id: "b", mp: 1 },
      { id: "c", mp: 0 },
    ];
    const result = filterActiveTiedIds(tiedIds, entries);
    expect(result.has("a")).toBe(true);
    expect(result.has("b")).toBe(true);
    expect(result.has("c")).toBe(false);
  });

  it("returns empty set when tiedIds is empty", () => {
    const entries = [{ id: "a", mp: 3 }];
    expect(filterActiveTiedIds(new Set(), entries).size).toBe(0);
  });

  it("full round-trip: 2-way tie resolved by distinct overrides for both shows no warning", () => {
    // Mirrors the exact page flow: admin sets distinct overrides for both players
    const groupEntries = [
      { id: "a", score: 10, points: 2, rankOverride: 1, mp: 2 },
      { id: "b", score: 10, points: 2, rankOverride: 2, mp: 2 },
    ];
    const byEffectiveRank = computeTieAwareRanks(groupEntries, bmCompareFn);
    const tiedIds = findUnresolvedTies(byEffectiveRank);
    const activeTiedIds = filterActiveTiedIds(tiedIds, groupEntries);
    expect(tiedIds.size).toBe(0);
    expect(activeTiedIds.size).toBe(0);
  });

  it("full round-trip: all-zero group is silenced after computeTieAwareRanks", () => {
    // Mirrors the exact flow in bm/mr/gp pages for a freshly set-up group
    const groupEntries = [
      { id: "a", score: 0, points: 0, rankOverride: null, mp: 0 },
      { id: "b", score: 0, points: 0, rankOverride: null, mp: 0 },
      { id: "c", score: 0, points: 0, rankOverride: null, mp: 0 },
    ];
    const byEffectiveRank = computeTieAwareRanks(groupEntries, bmCompareFn);
    const tiedIds = findUnresolvedTies(byEffectiveRank);
    const activeTiedIds = filterActiveTiedIds(tiedIds, groupEntries);
    // findUnresolvedTies sees a tie, but filterActiveTiedIds suppresses it
    expect(tiedIds.size).toBe(3);
    expect(activeTiedIds.size).toBe(0);
  });
});

describe("collectPlayoffGroups", () => {
  it("returns no groups when there are no active ties", () => {
    const entries = [
      { id: "a", _autoRank: 1, rankOverride: null },
      { id: "b", _autoRank: 2, rankOverride: null },
    ];
    expect(collectPlayoffGroups(entries, new Set()).length).toBe(0);
  });

  it("returns the full original tie block for an unresolved tie", () => {
    const entries = [
      { id: "a", _autoRank: 1, rankOverride: null },
      { id: "b", _autoRank: 1, rankOverride: null },
      { id: "c", _autoRank: 3, rankOverride: null },
    ];
    const groups = collectPlayoffGroups(entries, new Set(["a", "b"]));
    expect(groups).toHaveLength(1);
    expect(groups[0].map((entry) => entry.id)).toEqual(["a", "b"]);
  });

  it("keeps partially-resolved ties together in one playoff group", () => {
    const entries = [
      { id: "a", _autoRank: 1, rankOverride: 1 },
      { id: "b", _autoRank: 1, rankOverride: 2 },
      { id: "c", _autoRank: 1, rankOverride: null },
    ];
    const groups = collectPlayoffGroups(entries, new Set(["a", "c"]));
    expect(groups).toHaveLength(1);
    expect(groups[0].map((entry) => entry.id)).toEqual(["a", "b", "c"]);
  });
});

describe("buildPlayoffRankAssignments", () => {
  it("assigns sequential rank overrides from the shared auto rank", () => {
    const assignments = buildPlayoffRankAssignments([
      { id: "b", _autoRank: 4, rankOverride: null },
      { id: "a", _autoRank: 4, rankOverride: null },
      { id: "c", _autoRank: 4, rankOverride: null },
    ]);
    expect(assignments).toEqual([
      { id: "b", rankOverride: 4 },
      { id: "a", rankOverride: 5 },
      { id: "c", rankOverride: 6 },
    ]);
  });
});
