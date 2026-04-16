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
 * A tie group of N members is "resolved" when at least N-1 members have
 * distinct (non-duplicate) rankOverride values — the last remaining member's
 * position is then unambiguous. A group is "unresolved" if fewer than N-1
 * distinct overrides exist, or if any override values are duplicated.
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
    // A tie group of N members is resolved when N-1 members have distinct
    // overrides — the last remaining member's position is then unambiguous.
    // This matches real-world admin workflow: setting one override in a 2-way
    // tie fully determines both positions.
    // Duplicate override values (e.g., two members both set to rank 1) still
    // count as unresolved because the ordering remains ambiguous.
    const setOverrides = group
      .map((e) => e.rankOverride)
      .filter((v): v is number => v != null);
    const distinctOverrides = new Set(setOverrides).size;
    // All set overrides must be unique (no duplicates) AND at least N-1 distinct
    const noDuplicates = distinctOverrides === setOverrides.length;
    const resolved = noDuplicates && distinctOverrides >= group.length - 1;
    if (!resolved) {
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
