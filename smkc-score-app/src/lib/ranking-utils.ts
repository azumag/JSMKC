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
}

export type EntryWithAutoRank<T extends RankableEntry> = T & {
  _autoRank: number;
};

/**
 * Assign 1224 competition ranks to entries, then sort by effective rank.
 *
 * @param entries   Raw qualification records for one group
 * @param compareFn Sort comparator defining the "better" direction per mode.
 *                  BM/MR: (a, b) => b.score - a.score || b.points - a.points
 *                  GP:    (a, b) => b.points - a.points || b.score - a.score
 * @returns         Entries with `_autoRank` attached, sorted by effective rank
 *                  (rankOverride ?? _autoRank) ascending.
 */
export function computeTieAwareRanks<T extends RankableEntry>(
  entries: T[],
  compareFn: (a: T, b: T) => number
): EntryWithAutoRank<T>[] {
  if (entries.length === 0) return [];

  // Step 1: Sort by mode-specific criteria to establish natural order
  const sorted = [...entries].sort(compareFn);

  // Step 2: Assign 1224 competition ranks using an imperative loop so we can
  // access the previous entry's _autoRank without TDZ issues (can't reference
  // the result array inside its own Array.map initializer).
  // Two consecutive entries are tied when compareFn returns 0 (equal on all criteria).
  // Tied entries share the previous rank; the next non-tied entry gets its 1-based index.
  const withAutoRank: EntryWithAutoRank<T>[] = [];
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
 * Find the set of entry IDs involved in unresolved ties.
 *
 * A tie group is "unresolved" when NOT ALL members of the tied group have a
 * rankOverride set. If even one member still has rankOverride=null, the whole
 * group is considered unresolved (ambiguous ordering remains).
 *
 * Returns a Set<id> for O(1) membership testing in render loops.
 */
export function findUnresolvedTies<T extends RankableEntry & { _autoRank: number }>(
  entries: T[]
): Set<string> {
  // Group entries by _autoRank to find tied sets
  const rankGroups = new Map<number, T[]>();
  for (const entry of entries) {
    const group = rankGroups.get(entry._autoRank) ?? [];
    group.push(entry);
    rankGroups.set(entry._autoRank, group);
  }

  const tiedIds = new Set<string>();
  for (const group of rankGroups.values()) {
    // Only a group with 2+ entries can be a tie
    if (group.length < 2) continue;
    // The group is unresolved if:
    // (a) at least one member lacks an override, OR
    // (b) two members share the same override value (duplicate overrides remain ambiguous)
    const overrides = group.map((e) => e.rankOverride);
    const allSet = overrides.every((v) => v != null);
    const allDistinct = allSet && new Set(overrides).size === group.length;
    const allResolved = allSet && allDistinct;
    if (!allResolved) {
      for (const entry of group) {
        tiedIds.add(entry.id);
      }
    }
  }
  return tiedIds;
}
