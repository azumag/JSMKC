/**
 * TA Pair Utility Functions
 *
 * Pure functions for TA qualification pair assignment.
 * Extracted from the page component for testability.
 *
 * §3.1: Players are paired so that experienced (low seeding) and
 * inexperienced (high seeding) players are partnered together.
 * Seeding is stored per TTEntry (per-tournament), not on the Player model.
 */

/** Minimal entry shape required for pair computation */
export interface PairPlayer {
  id: string;       // entry id
  playerId: string;
  seeding: number | null; // lower = stronger; null = unranked (placed last)
}

/**
 * Compute balanced pairs using snake pairing by seeding.
 *
 * Algorithm (§3.1):
 *   1. Sort entries by seeding ascending (null → last, treated as Infinity)
 *   2. Pair sorted[0]+sorted[N-1], sorted[1]+sorted[N-2], ...
 *
 * This minimises the average skill gap across all pairs.
 * If the entry count is odd, the last sorted entry is unpaired.
 *
 * @param players - Entries to pair (typically qualification stage entries)
 * @returns Array of [stronger, weaker] entry pairs
 */
export function computeAutoPairs<T extends PairPlayer>(players: T[]): Array<[T, T]> {
  const sorted = [...players].sort((a, b) => {
    const sa = a.seeding ?? Infinity;
    const sb = b.seeding ?? Infinity;
    // Secondary sort by playerId ensures deterministic output when seeding is equal
    return sa - sb || a.playerId.localeCompare(b.playerId);
  });
  const pairs: Array<[T, T]> = [];
  const n = sorted.length;
  for (let i = 0; i < Math.floor(n / 2); i++) {
    pairs.push([sorted[i], sorted[n - 1 - i]]);
  }
  return pairs;
}

/**
 * Apply snake-pair computation over setup-dialog entries and return an updated
 * list with `partnerId` set for every entry that has a numeric seeding.
 *
 * Entries without a seeding keep their existing `partnerId` untouched so that
 * manual assignments for unranked rows survive a seeding edit elsewhere.
 */
export interface SetupEntryLike {
  playerId: string;
  seeding?: number;
  partnerId?: string | null;
}

export function applyAutoPairsToSetup<T extends SetupEntryLike>(entries: T[]): T[] {
  const seeded = entries
    .filter((e) => typeof e.seeding === "number")
    .map((e) => ({ id: e.playerId, playerId: e.playerId, seeding: e.seeding ?? null }));
  const partnerMap = new Map<string, string>();
  for (const [a, b] of computeAutoPairs(seeded)) {
    partnerMap.set(a.playerId, b.playerId);
    partnerMap.set(b.playerId, a.playerId);
  }
  return entries.map((e) =>
    typeof e.seeding === "number"
      ? { ...e, partnerId: partnerMap.get(e.playerId) ?? null }
      : e,
  );
}
