/**
 * TA Pair Utility Functions
 *
 * Pure functions for TA qualification pair assignment.
 * Extracted from the page component for testability.
 *
 * §3.1: Players are paired so that experienced (low ttSeeding) and
 * inexperienced (high ttSeeding) players are partnered together.
 */

/** Minimal player shape required for pair computation */
export interface PairPlayer {
  id: string;       // entry id
  playerId: string;
  ttSeeding: number | null; // lower = stronger; null = unranked (placed last)
}

/**
 * Compute balanced pairs using snake pairing by ttSeeding.
 *
 * Algorithm (§3.1):
 *   1. Sort players by ttSeeding ascending (null → last, treated as Infinity)
 *   2. Pair sorted[0]+sorted[N-1], sorted[1]+sorted[N-2], ...
 *
 * This minimises the average skill gap across all pairs.
 * If the player count is odd, the last sorted player is unpaired.
 *
 * @param players - Entries to pair (typically qualification stage entries)
 * @returns Array of [stronger, weaker] entry pairs
 */
export function computeAutoPairs<T extends PairPlayer>(players: T[]): Array<[T, T]> {
  const sorted = [...players].sort((a, b) => {
    const sa = a.ttSeeding ?? Infinity;
    const sb = b.ttSeeding ?? Infinity;
    return sa - sb;
  });
  const pairs: Array<[T, T]> = [];
  const n = sorted.length;
  for (let i = 0; i < Math.floor(n / 2); i++) {
    pairs.push([sorted[i], sorted[n - 1 - i]]);
  }
  return pairs;
}
