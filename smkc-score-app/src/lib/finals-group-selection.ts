/**
 * Finals entrant selection with per-group Top-N + bracket seeding.
 *
 * Spec (Issue #454, Top-24 → Top-16 flow):
 *   - 12 direct advancers fill Upper Bracket non-barrage seeds.
 *   - 12 barrage entrants fill Playoff seeds 1-12 (single-elim R1+R2 → 4 winners → Upper barrage slots).
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
 *   direct seeds: 1:A1, 2:B3, 3:B1, 4:A3, 5:B2, 6:A4,
 *                 7:A2, 8:B4, 9:A5, 11:B5, 13:B6, 15:A6
 *   barrage seeds 1-12: B8, B7, A8, A7, B9, A11, B10, A12, A10, B12, A9, B11
 *
 * In the 16-player bracket, the Upper R1 matches render top-to-bottom as:
 *   A1 vs barrage, B4 vs A5, B2 vs barrage, A3 vs B6,
 *   B1 vs barrage, A4 vs B5, A2 vs barrage, B3 vs A6
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
  /** 12 direct advancers, in deterministic display/spec order. */
  direct: FinalsQualInput[];
  /** Direct advancers with their actual Upper Bracket seed numbers. */
  directSeeds: Array<{ seed: number; qualification: FinalsQualInput }>;
  /** 12 barrage entrants, ordered for Playoff seeds 1-12. */
  barrage: FinalsQualInput[];
  /** Detected group count (2, 3, or 4). */
  groupCount: 2 | 3 | 4;
}

const TOTAL_FINALS_SLOTS = 12;

const TWO_GROUP_DIRECT_UPPER_SEEDS = [
  { seed: 1, token: 'A1' },
  { seed: 2, token: 'B3' },
  { seed: 3, token: 'B1' },
  { seed: 4, token: 'A3' },
  { seed: 5, token: 'B2' },
  { seed: 6, token: 'A4' },
  { seed: 7, token: 'A2' },
  { seed: 8, token: 'B4' },
  { seed: 9, token: 'A5' },
  { seed: 11, token: 'B5' },
  { seed: 13, token: 'B6' },
  { seed: 15, token: 'A6' },
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
    const directSeeds = TWO_GROUP_DIRECT_UPPER_SEEDS.map(({ seed, token }) => ({
      seed,
      qualification: playerForToken(token),
    }));

    return {
      direct: directSeeds.map(({ qualification }) => qualification),
      directSeeds,
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
    directSeeds: direct.map((qualification, index) => ({
      seed: index + 1,
      qualification,
    })),
    barrage,
    groupCount: groupCount as 2 | 3 | 4,
  };
}
