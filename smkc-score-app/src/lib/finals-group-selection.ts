/**
 * Finals entrant selection with per-group Top-N + interleaved seeding.
 *
 * Spec (Issue #454, Top-24 → Top-16 flow):
 *   - 12 direct advancers fill Upper Bracket seeds 1-12.
 *   - 12 barrage entrants fill Playoff seeds 1-12 (single-elim R1+R2 → 4 winners → Upper 13-16).
 *
 * Per-group split (based on group count G):
 *   perGroup = 12 / G (2→6, 3→4, 4→3)
 *   Each group contributes: Top 1..perGroup direct, Top (perGroup+1)..(2*perGroup) barrage.
 *
 * Seeds are assigned by **interleaving groups round-robin**, so that strong players
 * from different groups are spread across the bracket rather than clustered. This
 * keeps group-rank-1 players (A1, B1, C1, D1) at the top of the direct bracket and
 * prevents two group-1 players from meeting in the first round.
 *
 * Example (2 groups, A=14, B=13):
 *   direct:  A1, B1, A2, B2, A3, B3, A4, B4, A5, B5, A6, B6
 *   barrage: A7, B7, A8, B8, A9, B9, A10, B10, A11, B11, A12, B12
 *
 * Caller contract: `allQualifications` must already be ordered per-group by final
 * ranking (score, tiebreakers, H2H). Group bucketing preserves caller-provided order.
 */

import { GROUPS } from './group-utils';

/** Minimum shape required from a qualification record. */
export interface FinalsQualInput {
  playerId: string;
  group: string;
  player: unknown;
}

interface FinalsGroupSelection {
  /** 12 direct advancers, ordered for Upper Bracket seeds 1-12 (interleaved). */
  direct: FinalsQualInput[];
  /** 12 barrage entrants, ordered for Playoff seeds 1-12 (interleaved). */
  barrage: FinalsQualInput[];
  /** Detected group count (2, 3, or 4). */
  groupCount: 2 | 3 | 4;
}

const TOTAL_FINALS_SLOTS = 12;

/**
 * Select finals direct-advancers and barrage entrants from group-based qualifications.
 *
 * @throws Error if input is empty, if group count is not 2/3/4, or if any group
 *   has fewer than `2 * perGroup` qualified players.
 */
export function selectFinalsEntrantsByGroup(
  allQualifications: FinalsQualInput[],
): FinalsGroupSelection {
  if (allQualifications.length === 0) {
    throw new Error('selectFinalsEntrantsByGroup: qualifications array is empty');
  }

  /* Bucket preserving caller-provided order within each group. */
  const byGroup = new Map<string, FinalsQualInput[]>();
  for (const q of allQualifications) {
    const bucket = byGroup.get(q.group);
    if (bucket) bucket.push(q);
    else byGroup.set(q.group, [q]);
  }

  const groupCount = byGroup.size;
  if (groupCount < 2 || groupCount > 4 || TOTAL_FINALS_SLOTS % groupCount !== 0) {
    throw new Error(
      `selectFinalsEntrantsByGroup: Unsupported group count ${groupCount} (must be 2, 3, or 4)`,
    );
  }

  const perGroup = TOTAL_FINALS_SLOTS / groupCount;

  /* Order group keys by the canonical GROUPS sequence (A, B, C, D) for deterministic
   * interleave order; include only groups actually present. */
  const orderedGroupKeys = (GROUPS as readonly string[]).filter(g => byGroup.has(g));
  if (orderedGroupKeys.length !== groupCount) {
    throw new Error(
      `selectFinalsEntrantsByGroup: Unknown group key detected (expected one of ${GROUPS.join(', ')})`,
    );
  }

  /* Snapshot each group's bucket so repeated lookups are cheap and we can drop the
   * `byGroup.get(g)!` non-null assertions. */
  const buckets: FinalsQualInput[][] = orderedGroupKeys.map(g => byGroup.get(g) as FinalsQualInput[]);

  /* Verify each group has enough players for both direct (perGroup) and barrage (perGroup). */
  for (let i = 0; i < orderedGroupKeys.length; i++) {
    if (buckets[i].length < perGroup * 2) {
      throw new Error(
        `selectFinalsEntrantsByGroup: Not enough players in group ${orderedGroupKeys[i]} (need ${perGroup * 2}, found ${buckets[i].length})`,
      );
    }
  }

  /* Interleave round-robin: for slot k in [0, perGroup), take each group's k-th player.
   *   2 groups: [A0,B0,A1,B1,...] → A1,B1,A2,B2,... (1-indexed in spec)
   *   3 groups: [A0,B0,C0,A1,B1,C1,...] */
  const direct: FinalsQualInput[] = [];
  const barrage: FinalsQualInput[] = [];
  for (let k = 0; k < perGroup; k++) {
    for (const bucket of buckets) direct.push(bucket[k]);
  }
  for (let k = perGroup; k < perGroup * 2; k++) {
    for (const bucket of buckets) barrage.push(bucket[k]);
  }

  return {
    direct,
    barrage,
    groupCount: groupCount as 2 | 3 | 4,
  };
}
