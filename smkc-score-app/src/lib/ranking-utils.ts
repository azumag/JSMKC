/**
 * Tie-aware ranking utilities for BM/MR/GP qualification standings.
 *
 * The standings API already computes 1224 competition ranks server-side, but the
 * page-level qualification tab fetches raw records and computes ranks client-side.
 * This module provides the same logic as a pure, testable function so all three
 * pages share a single implementation.
 *
 * 1224 (standard competition) ranking: tied entries share the same rank number,
 * and the next rank skips accordingly (e.g., 1, 1, 3 — not 1, 1, 2).
 */

/** Minimum shape required by the ranking utilities */
export interface RankableEntry {
  id: string;
  rankOverride: number | null;
  /** Server-computed rank (from qualification API). When present, client skips recomputation. */
  _rank?: number;
}

export type EntryWithAutoRank<T extends RankableEntry> = T & {
  _autoRank: number;
};

export interface RankAssignment {
  id: string;
  rankOverride: number;
}

export interface ScorePointsEntry {
  score: number;
  points: number;
}

export function compareByScoreThenPoints(a: ScorePointsEntry, b: ScorePointsEntry): number {
  return b.score - a.score || b.points - a.points;
}

/** Shape required by computeCombinedRanks: a group label to bucket entries by. */
export interface GroupedRankableEntry extends RankableEntry {
  group: string;
}

/** Groups entries by a derived key, preserving each group's relative input order. */
export function groupBy<T>(entries: T[], keyFn: (entry: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const entry of entries) {
    const key = keyFn(entry);
    const group = groups.get(key);
    if (group) group.push(entry);
    else groups.set(key, [entry]);
  }
  return groups;
}

/**
 * Assign 1224 competition ranks to entries, then sort by effective rank.
 *
 * @param entries   Raw qualification records for one group
 * @param compareFn Sort comparator defining the "better" direction per mode.
 *                  BM/MR: (a, b) => b.score - a.score || b.points - a.points
 *                  GP:    (a, b) => b.score - a.score || b.points - a.points
 * @returns         Entries with `_autoRank` attached, sorted by effective rank
 *                  (rankOverride ?? _autoRank) ascending.
 */
export function computeTieAwareRanks<T extends RankableEntry>(
  entries: T[],
  compareFn: (a: T, b: T) => number
): EntryWithAutoRank<T>[] {
  if (entries.length === 0) return [];

  const withAutoRank: EntryWithAutoRank<T>[] = [];
  // When the server has already computed _rank (includes H2H + 1224 + override),
  // trust it instead of re-computing on the client.  This eliminates mismatches
  // where the server resolves ties via H2H but the client would recreate them.
  const hasServerRank = entries.length > 0 && entries[0]._rank != null;

  if (hasServerRank) {
    for (const entry of entries) {
      withAutoRank.push({ ...entry, _autoRank: entry._rank! });
    }
  } else {
    // Fallback: client-side computation for legacy paths without server _rank.
    // Step 1: Sort by mode-specific criteria to establish natural order
    const sorted = [...entries].sort(compareFn);

    // Step 2: Assign 1224 competition ranks using an imperative loop so we can
    // access the previous entry's _autoRank without TDZ issues.
    // Two consecutive entries are tied when compareFn returns 0.
    for (let i = 0; i < sorted.length; i++) {
      let autoRank: number;
      if (i === 0) {
        autoRank = 1;
      } else {
        const isTied = compareFn(sorted[i - 1], sorted[i]) === 0;
        autoRank = isTied
          ? withAutoRank[i - 1]._autoRank // share the same rank as the previous tied entry
          : i + 1; // 1-based index (skips over tied positions)
      }
      withAutoRank.push({ ...sorted[i], _autoRank: autoRank });
    }
  }

  // Step 3: Re-sort by effective rank so the row order on screen reflects
  // admin overrides. When two entries have the same effective rank,
  // overridden entries sort first (admin authority over auto-rank).
  return [...withAutoRank].sort((a, b) => {
    const ra = a.rankOverride ?? a._autoRank;
    const rb = b.rankOverride ?? b._autoRank;
    if (ra !== rb) return ra - rb;
    // Stable secondary sort: overridden entries before auto-ranked entries
    const ao = a.rankOverride != null ? 0 : 1;
    const bo = b.rankOverride != null ? 0 : 1;
    return ao - bo;
  });
}

/**
 * Assign 1224 competition ranks across a combined (cross-group) standings pool
 * using the "rank-within-group bucket" rule from
 * docs/qualification-combined-ranking.md §2: all groups' Nth-place finishers
 * form "bucket N"; bucket N always outranks bucket N+1 in full regardless of
 * any individual's stats, and only ties *within* a bucket fall back to
 * `compareFn` (WDL score -> point differential). Seeding is never consulted
 * (§7 Q1/Q2, confirmed by tournament operations: no seed-based tiebreak).
 *
 * A group's "rank within group" is its *final* resolved rank -- i.e. it goes
 * through computeTieAwareRanks first, so a group-scoped `rankOverride` or
 * server-computed `_rank` (H2H, sudden death) determines bucket membership,
 * per §1 ("グループ内最終順位...を入力として使う"). Groups of uneven size
 * simply have no entry in a bucket past their last player -- no special-casing
 * needed (§2.3/§2.4).
 */
export function computeCombinedRanks<T extends GroupedRankableEntry>(
  entries: T[],
  compareFn: (a: T, b: T) => number
): EntryWithAutoRank<T>[] {
  if (entries.length === 0) return [];

  const bucketById = new Map<string, number>();
  for (const groupEntries of groupBy(entries, (entry) => entry.group).values()) {
    for (const ranked of computeTieAwareRanks(groupEntries, compareFn)) {
      bucketById.set(ranked.id, ranked.rankOverride ?? ranked._autoRank);
    }
  }

  // Single comparator shared by the sort and the tie-check below, so the two
  // can never drift apart: bucket is the absolute primary key, compareFn only
  // breaks ties within the same bucket.
  const combinedCompare = (a: T, b: T) => {
    const bucketDiff = bucketById.get(a.id)! - bucketById.get(b.id)!;
    return bucketDiff !== 0 ? bucketDiff : compareFn(a, b);
  };
  const sorted = [...entries].sort(combinedCompare);

  const withAutoRank: EntryWithAutoRank<T>[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const tiedWithPrevious = i > 0 && combinedCompare(sorted[i - 1], sorted[i]) === 0;
    const autoRank = tiedWithPrevious ? withAutoRank[i - 1]._autoRank : i + 1;
    withAutoRank.push({ ...sorted[i], _autoRank: autoRank });
  }

  return withAutoRank;
}

/**
 * Find the set of entry IDs involved in unresolved ties.
 *
 * A tie is defined as two or more entries sharing the same **effective rank**
 * (rankOverride ?? _autoRank).  This detects:
 *   • Raw score ties where no overrides have been set
 *   • Duplicate rankOverride values
 *   • An override that collides with another entry's _autoRank
 *   • An override that collides with a different entry's override
 *
 * Returns a Set<id> for O(1) membership testing in render loops.
 */
export function findUnresolvedTies<T extends RankableEntry & { _autoRank: number }>(
  entries: T[]
): Set<string> {
  // Group entries by effective rank to detect any collision
  const effectiveRankGroups = new Map<number, T[]>();
  for (const entry of entries) {
    const effectiveRank = entry.rankOverride ?? entry._autoRank;
    const group = effectiveRankGroups.get(effectiveRank) ?? [];
    group.push(entry);
    effectiveRankGroups.set(effectiveRank, group);
  }

  const tiedIds = new Set<string>();
  for (const group of effectiveRankGroups.values()) {
    // Any group with 2+ members sharing the same effective rank is unresolved
    if (group.length >= 2) {
      for (const entry of group) {
        tiedIds.add(entry.id);
      }
    }
  }
  return tiedIds;
}

/**
 * Filter a set of tied IDs to only those whose players have actually played
 * at least one match. This suppresses spurious tie warnings at group-setup time
 * when all players share identical zero scores — those "ties" are trivial and
 * do not require admin resolution.
 *
 * The filter operates per-entry rather than per-group: a 0-0 pair at the
 * bottom of a partially-played group is still ignored, while a genuine score
 * collision among players who have played is correctly flagged.
 *
 * @param tiedIds  Set of IDs returned by findUnresolvedTies
 * @param entries  Raw qualification records for the group (must include `mp`)
 * @returns        Subset of tiedIds where the player has mp > 0
 */
export function filterActiveTiedIds(
  tiedIds: Set<string>,
  entries: Array<{ id: string; mp: number }>
): Set<string> {
  const mpById = new Map(entries.map((e) => [e.id, e.mp]));
  return new Set([...tiedIds].filter((id) => (mpById.get(id) ?? 0) > 0));
}

/**
 * Collect unresolved playoff groups from an already-ranked standings slice.
 *
 * Groups are keyed by `_autoRank`, not effective rank, so a partially-resolved
 * 3-way tie still opens as one playoff group containing all three original
 * contenders. This lets the admin record the final sudden-death order in one
 * place and re-apply a full sequential rank block.
 */
export function collectPlayoffGroups<T extends RankableEntry & { _autoRank: number }>(
  entries: T[],
  activeTiedIds: Set<string>
): T[][] {
  if (entries.length === 0 || activeTiedIds.size === 0) return [];

  const groups = new Map<number, T[]>();
  for (const entry of entries) {
    const group = groups.get(entry._autoRank) ?? [];
    group.push(entry);
    groups.set(entry._autoRank, group);
  }

  return [...groups.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, group]) => group)
    .filter((group) => group.length > 1 && group.some((entry) => activeTiedIds.has(entry.id)));
}

/**
 * Convert a playoff finishing order into concrete rankOverride writes.
 *
 * The first player receives the original shared `_autoRank`, the second player
 * receives `_autoRank + 1`, and so on, yielding a fully-resolved 1-2-3 style
 * ordering for that tie block.
 */
export function buildPlayoffRankAssignments<T extends RankableEntry & { _autoRank: number }>(
  entries: T[]
): RankAssignment[] {
  if (entries.length === 0) return [];

  const baseRank = Math.min(...entries.map((entry) => entry._autoRank));
  return entries.map((entry, index) => ({
    id: entry.id,
    rankOverride: baseRank + index,
  }));
}
