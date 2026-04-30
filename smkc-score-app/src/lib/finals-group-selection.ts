/**
 * Finals entrant selection with per-group Top-N + bracket seeding.
 *
 * Spec (Issue #454, Top-24 → Top-16 flow):
 *   - 12 direct advancers fill Upper Bracket seeds 1-12.
 *   - 12 barrage entrants fill Playoff seeds 1-12 (single-elim R1+R2 → 4 winners → Upper 13-16).
 *
 * Per-group split (based on group count G):
 *   perGroup = 12 / G (2→6, 3→4, 4→3)
 *   Each group contributes: Top 1..perGroup direct, Top (perGroup+1)..(2*perGroup) barrage.
 *
 * For 2 groups, placement is fixed by group-internal rank and the CDM two-group
 * Top-24 layout. A/B are not merged into a global ranking.
 *
 * 3+ group ordering intentionally keeps the existing round-robin group interleave;
 * combined-ranking rules for 3+ groups are a separate follow-up.
 *
 * Example (2 groups, A=14, B=13):
 *   direct seeds 1-12:  A1, A6, B1, B6, B2, A4, A2, B4, A5, B3, B5, A3
 *   barrage seeds 1-12: B8, B7, A8, A7, B9, A11, B10, A12, A10, B12, A9, B11
 *
 * In the 16-player bracket, the direct seed order above renders top-to-bottom as:
 *   A1, B4, A5, B2, A3, B6, B1, A4, B5, A2, B3, A6
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
  /** 12 direct advancers, ordered for Upper Bracket seeds 1-12. */
  direct: FinalsQualInput[];
  /** 12 barrage entrants, ordered for Playoff seeds 1-12. */
  barrage: FinalsQualInput[];
  /** Detected group count (2, 3, or 4). */
  groupCount: 2 | 3 | 4;
}

const TOTAL_FINALS_SLOTS = 12;

const TWO_GROUP_DIRECT_SEED_TOKENS = [
  'A1', 'A6', 'B1', 'B6',
  'B2', 'A4', 'A2', 'B4',
  'A5', 'B3', 'B5', 'A3',
] as const;

const TWO_GROUP_BARRAGE_SEED_TOKENS = [
  'B8', 'B7', 'A8', 'A7',
  'B9', 'A11', 'B10', 'A12',
  'A10', 'B12', 'A9', 'B11',
] as const;

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

  if (groupCount === 2) {
    const bucketByPaperGroup = new Map([
      ['A', buckets[0]],
      ['B', buckets[1]],
    ]);
    const playerForToken = (token: string): FinalsQualInput => {
      const paperGroup = token[0];
      const rank = Number(token.slice(1));
      const bucket = bucketByPaperGroup.get(paperGroup);
      const player = bucket?.[rank - 1];
      if (!player) {
        throw new Error(`selectFinalsEntrantsByGroup: Missing player for ${token}`);
      }
      return player;
    };

    return {
      direct: TWO_GROUP_DIRECT_SEED_TOKENS.map(playerForToken),
      barrage: TWO_GROUP_BARRAGE_SEED_TOKENS.map(playerForToken),
      groupCount: 2,
    };
  }

  /* Interleave round-robin for 3+ groups until the combined-ranking rule lands:
   * for slot k in [0, perGroup), take each group's k-th player.
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
