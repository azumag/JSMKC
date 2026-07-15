/**
 * Finals entrant selection with per-group Top-N + bracket seeding.
 *
 * See docs/finals-entrant-selection.{ja,en}.md for a walkthrough of the
 * selection rules with worked examples.
 *
 * Spec (Issue #454, Top-24 → Top-16 flow):
 *   - 12 direct advancers fill Upper Bracket seeds 1-12.
 *   - 12 barrage entrants fill seeds 13-24 (single-elim R1+R2 → 4 winners,
 *     each keeping their own seed number when they enter the Upper Bracket).
 *
 * Per-group split (based on group count G):
 *   perGroup = 12 / G (2→6, 3→4, 4→3)
 *   Each group contributes: Top 1..perGroup direct, Top (perGroup+1)..(2*perGroup) barrage.
 *
 * Seed assignment (all group counts, 2-4) per
 * docs/qualification-combined-ranking.md §2-§3 (confirmed by tournament
 * operations, §7 Q1/Q2): entries are stacked bucket by bucket (bucket k =
 * every group's (k+1)-th-ranked player), tie-broken within a bucket by WDL
 * score -> point differential -> combinedRankOverride. Bucket order IS the
 * final seed order (seed 1 = bucket 0's top entrant, seed 12 = bucket
 * (perGroup-1)'s last entrant, seed 13 = the barrage range's bucket 0, etc.)
 *
 * This used to additionally reorder seeds within a group count to avoid a
 * same-qualifying-group Round-1 matchup (a hand-designed token map for 2
 * groups, a general backtracking algorithm for 3-4). That scheme was never
 * validated against a real event and, when checked against the CDM 2025
 * official results workbook, did not match: the real Upper Bracket has no
 * collision avoidance at all (Drew vs Zarkov, both group A, met in Winners
 * R1; Lafungo vs Moll, both group B, likewise) and simply uses the plain
 * bucket-stacked seed order below. It has been removed so the app's bracket
 * placement matches the verified real-world behavior instead of an
 * unvalidated assumption.
 *
 * Example (2 groups, A=14, B=13, all bucket ties resolved alphabetically):
 *   direct seeds:  1:A1  2:B1  3:A2  4:B2  5:A3  6:B3  7:A4  8:B4  9:A5 10:B5 11:A6 12:B6
 *   barrage seeds: 13:A7 14:B7 15:A8 16:B8 17:A9 18:B9 19:A10 20:B10 21:A11 22:B11 23:A12 24:B12
 *
 * Caller contract: `allQualifications` must already be ordered per-group by final
 * ranking (score, tiebreakers, H2H). Group bucketing preserves caller-provided order.
 */

import { GROUPS } from './group-utils';
import { compareByScoreThenPointsAndCombinedOverride, groupBy, type CombinedOverrideEntry } from './ranking-utils';

/** Minimum shape required from a qualification record. */
export interface FinalsQualInput<TPlayer = unknown> extends CombinedOverrideEntry {
  playerId: string;
  group: string;
  player: TPlayer;
}

/** A qualification assigned to a specific Upper Bracket (1-12) or barrage (13-24) seed. */
export type FinalsSeedEntry<TPlayer = unknown> = {
  seed: number;
  qualification: FinalsQualInput<TPlayer>;
};

interface FinalsGroupSelection<TPlayer = unknown> {
  /** Direct advancers, seeds 1-12. */
  directSeeds: FinalsSeedEntry<TPlayer>[];
  /** 12 barrage entrants, seeds 13-24 (a bye winner keeps this same seed in the Upper Bracket). */
  barrageSeeds: FinalsSeedEntry<TPlayer>[];
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
export function selectFinalsEntrantsByGroup<TPlayer = unknown>(
  allQualifications: FinalsQualInput<TPlayer>[],
): FinalsGroupSelection<TPlayer> {
  if (allQualifications.length === 0) {
    throw new Error('selectFinalsEntrantsByGroup: qualifications array is empty');
  }

  /* Bucket preserving caller-provided order within each group. */
  const byGroup = groupBy(allQualifications, (q) => q.group);

  const groupCount = byGroup.size;
  if (groupCount < 2 || groupCount > 4 || TOTAL_FINALS_SLOTS % groupCount !== 0) {
    throw new Error(`selectFinalsEntrantsByGroup: Unsupported group count ${groupCount} (must be 2, 3, or 4)`);
  }

  const perGroup = TOTAL_FINALS_SLOTS / groupCount;

  /* Order group keys by the canonical GROUPS sequence (A, B, C, D) for deterministic
   * interleave order; include only groups actually present. */
  const orderedGroupKeys = (GROUPS as readonly string[]).filter((g) => byGroup.has(g));
  if (orderedGroupKeys.length !== groupCount) {
    throw new Error(`selectFinalsEntrantsByGroup: Unknown group key detected (expected one of ${GROUPS.join(', ')})`);
  }

  /* Snapshot each group's bucket so repeated lookups are cheap and we can drop the
   * `byGroup.get(g)!` non-null assertions. */
  const buckets: FinalsQualInput<TPlayer>[][] = orderedGroupKeys.map(
    (g) => byGroup.get(g) as FinalsQualInput<TPlayer>[],
  );

  /* Verify each group has enough players for both direct (perGroup) and barrage (perGroup). */
  for (let i = 0; i < orderedGroupKeys.length; i++) {
    if (buckets[i].length < perGroup * 2) {
      throw new Error(
        `selectFinalsEntrantsByGroup: Not enough players in group ${orderedGroupKeys[i]} (need ${perGroup * 2}, found ${buckets[i].length})`,
      );
    }
  }

  /* Bucket-stack (qualification-combined-ranking.md §2-§3): for slot k in
   * [0, perGroup), bucket k = every group's k-th player, tie-broken within
   * the bucket by WDL score -> point differential -> combinedRankOverride.
   * Every group is guaranteed a k-th player here by the perGroup*2 validation
   * above. Bucket order is the final seed order (see module doc comment). */
  const direct: FinalsQualInput<TPlayer>[] = [];
  const barrage: FinalsQualInput<TPlayer>[] = [];
  for (let k = 0; k < perGroup; k++) {
    direct.push(...buckets.map((bucket) => bucket[k]).sort(compareByScoreThenPointsAndCombinedOverride));
  }
  for (let k = perGroup; k < perGroup * 2; k++) {
    barrage.push(...buckets.map((bucket) => bucket[k]).sort(compareByScoreThenPointsAndCombinedOverride));
  }

  return {
    directSeeds: direct.map((qualification, index) => ({ seed: index + 1, qualification })),
    /* Barrage seeds start at 13 so a bye winner's seed number is already the
     * real overall seed they keep when entering the Upper Bracket. */
    barrageSeeds: barrage.map((qualification, index) => ({ seed: TOTAL_FINALS_SLOTS + index + 1, qualification })),
    groupCount: groupCount as 2 | 3 | 4,
  };
}
