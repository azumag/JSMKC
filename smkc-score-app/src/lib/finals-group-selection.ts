/**
 * Finals entrant selection with per-group Top-N + bracket seeding.
 *
 * See docs/finals-entrant-selection.{ja,en}.md for a walkthrough of the
 * selection rules with worked examples.
 *
 * Spec (Issue #454, Top-24 → Top-16 flow):
 *   - 12 direct advancers fill the layout's direct Upper-Bracket slots.
 *   - 12 barrage entrants fill displayed seeds 13-24 (single-elim R1+R2 →
 *     4 winners; their Upper destinations depend on the group-count layout).
 *
 * Per-group split (based on group count G):
 *   perGroup = 12 / G (2→6, 3→4, 4→3)
 *   Each group contributes: Top 1..perGroup direct, Top (perGroup+1)..(2*perGroup) barrage.
 *
 * Seed assignment is intentionally different by group count:
 *   - 2 groups use the fixed alternating A/B displayed-seed map below. Actual
 *     cross-group WDL statistics must not move those placements.
 *   - 3 groups use the dynamic bucket order from
 *     docs/qualification-combined-ranking.md §2-§3. A fixed layout cannot
 *     distribute three groups evenly, so each same-rank bucket is ordered by
 *     WDL score -> point differential -> combinedRankOverride.
 *   - 4 groups remain internal-only until tournament operations supplies the
 *     official fixed placement map.
 *
 * Example (2 groups, A=14, B=13):
 *   direct Upper slots: 1:A1 2:B1 3:A2 4:B2 5:A3 6:B3
 *                       7:A4 8:B4 9:A5 10:B5 11:A6 12:B6
 *   barrage slots 13-24: A7, B7, A8, B8, A9, B9,
 *                         A10, B10, A11, B11, A12, B12
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

/** A qualification assigned to a specific Upper-Bracket slot or displayed barrage seed. */
export type FinalsSeedEntry<TPlayer = unknown> = {
  seed: number;
  qualification: FinalsQualInput<TPlayer>;
};

interface FinalsGroupSelection<TPlayer = unknown> {
  /** Direct advancers in their group-count-specific Upper-Bracket slots. */
  directSeeds: FinalsSeedEntry<TPlayer>[];
  /** 12 barrage entrants with displayed seeds 13-24. */
  barrageSeeds: FinalsSeedEntry<TPlayer>[];
  /** Detected group count (2, 3, or 4). */
  groupCount: 2 | 3 | 4;
}

const TOTAL_FINALS_SLOTS = 12;

export const TWO_GROUP_DIRECT_UPPER_SEEDS = [
  { seed: 1, token: 'A1' },
  { seed: 2, token: 'B1' },
  { seed: 3, token: 'A2' },
  { seed: 4, token: 'B2' },
  { seed: 5, token: 'A3' },
  { seed: 6, token: 'B3' },
  { seed: 7, token: 'A4' },
  { seed: 8, token: 'B4' },
  { seed: 9, token: 'A5' },
  { seed: 10, token: 'B5' },
  { seed: 11, token: 'A6' },
  { seed: 12, token: 'B6' },
] as const;

const TWO_GROUP_BARRAGE_TOKENS = [
  'A7',
  'B7',
  'A8',
  'B8',
  'A9',
  'B9',
  'A10',
  'B10',
  'A11',
  'B11',
  'A12',
  'B12',
] as const;

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

  if (groupCount === 2) {
    const bucketByGroup = new Map(orderedGroupKeys.map((group, index) => [group, buckets[index]]));
    const playerForToken = (token: string): FinalsQualInput<TPlayer> => {
      const group = token[0];
      const rank = Number(token.slice(1));
      const player = bucketByGroup.get(group)?.[rank - 1];
      if (!player) {
        throw new Error(`selectFinalsEntrantsByGroup: Missing player for ${token}`);
      }
      return player;
    };

    return {
      directSeeds: TWO_GROUP_DIRECT_UPPER_SEEDS.map(({ seed, token }) => ({
        seed,
        qualification: playerForToken(token),
      })),
      barrageSeeds: TWO_GROUP_BARRAGE_TOKENS.map((token, index) => ({
        seed: TOTAL_FINALS_SLOTS + index + 1,
        qualification: playerForToken(token),
      })),
      groupCount: 2,
    };
  }

  /* Bucket-stack for the three-group production path (and provisional four-group
   * internal path; qualification-combined-ranking.md §2-§3): for slot k in
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
    /* In the three-group production path, the bye winner keeps this displayed
     * seed when entering the Upper Bracket. Four groups remain provisional. */
    barrageSeeds: barrage.map((qualification, index) => ({ seed: TOTAL_FINALS_SLOTS + index + 1, qualification })),
    groupCount: groupCount as 2 | 3 | 4,
  };
}
