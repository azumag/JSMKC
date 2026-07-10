/**
 * Finals entrant selection with per-group Top-N + bracket seeding.
 *
 * See docs/finals-entrant-selection.{ja,en}.md for a walkthrough of the
 * 2-group vs. 3-group selection rules with worked examples.
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
 * Top-24 layout (TWO_GROUP_*_SEED_TOKENS below). A/B are not merged into a global ranking.
 *
 * For 3+ groups, per docs/qualification-combined-ranking.md §2-§3 (confirmed by
 * tournament operations, §7 Q1/Q2): entries are stacked bucket by bucket (bucket
 * k = every group's (k+1)-th-ranked player), tie-broken within a bucket by WDL
 * score -> point differential -- no seeding. Seed *placement* within the bracket
 * (avoiding same-group round-1 matchups) is handled by assignAntiCollisionSeeds()
 * below, a general algorithm rather than a hand-designed token map, since the
 * group makeup of a given bucket is data-dependent for 3+ groups.
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
import { compareByScoreThenPointsAndCombinedOverride, groupBy, type CombinedOverrideEntry } from './ranking-utils';
import { generateBracketStructure, generatePlayoffStructure } from './double-elimination';

/** Minimum shape required from a qualification record. */
export interface FinalsQualInput<TPlayer = unknown> extends CombinedOverrideEntry {
  playerId: string;
  group: string;
  player: TPlayer;
}

interface FinalsGroupSelection<TPlayer = unknown> {
  /** Direct advancers with their actual Upper Bracket seed numbers. */
  directSeeds: Array<{ seed: number; qualification: FinalsQualInput<TPlayer> }>;
  /** 12 barrage entrants, ordered for Playoff seeds 1-12. */
  barrage: FinalsQualInput<TPlayer>[];
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
  'B8',
  'B7',
  'A8',
  'A7',
  'B9',
  'A11',
  'B10',
  'A12',
  'A10',
  'B12',
  'A9',
  'B11',
] as const;

/** Which round-1 seeds face a not-yet-decided opponent ("solo") vs. another seed in this same batch ("paired"). */
interface SeedPairingPlan {
  soloSeeds: number[];
  /** [lower seed, higher seed] pairs, sorted by lower seed ascending. */
  pairedSeeds: Array<[number, number]>;
}

/**
 * Derives which of the 12 Upper-Bracket seeds face each other in round 1
 * (`pairedSeeds`) vs. face a not-yet-determined barrage survivor (`soloSeeds`),
 * straight from the real 16-player bracket structure -- not a hand-copied
 * duplicate of it, so this can't drift if double-elimination.ts changes.
 */
function computeDirectSeedPairingPlan(): SeedPairingPlan {
  const barrageFedSeeds = new Set(
    generatePlayoffStructure(12)
      .map((m) => m.advancesToUpperSeed)
      .filter((seed): seed is number => seed != null),
  );
  const soloSeeds: number[] = [];
  const pairedSeeds: Array<[number, number]> = [];
  for (const m of generateBracketStructure(16)) {
    if (m.round !== 'winners_r1' || m.player1Seed == null || m.player2Seed == null) continue;
    const knownSeeds = [m.player1Seed, m.player2Seed].filter((s) => !barrageFedSeeds.has(s));
    if (knownSeeds.length === 2) {
      pairedSeeds.push([Math.min(...knownSeeds), Math.max(...knownSeeds)]);
    } else if (knownSeeds.length === 1) {
      soloSeeds.push(knownSeeds[0]);
    }
  }
  soloSeeds.sort((a, b) => a - b);
  pairedSeeds.sort(([a], [b]) => a - b);
  return { soloSeeds, pairedSeeds };
}

/** Same idea as computeDirectSeedPairingPlan(), for the 12-seed barrage/playoff bracket. */
function computePlayoffSeedPairingPlan(): SeedPairingPlan {
  const soloSeeds: number[] = [];
  const pairedSeeds: Array<[number, number]> = [];
  for (const m of generatePlayoffStructure(12)) {
    if (m.round === 'playoff_r1' && m.player1Seed != null && m.player2Seed != null) {
      pairedSeeds.push([Math.min(m.player1Seed, m.player2Seed), Math.max(m.player1Seed, m.player2Seed)]);
    } else if (m.round === 'playoff_r2' && m.player1Seed != null) {
      // player1Seed is the BYE seed; player2Seed is an R1 winner, not yet known.
      soloSeeds.push(m.player1Seed);
    }
  }
  soloSeeds.sort((a, b) => a - b);
  pairedSeeds.sort(([a], [b]) => a - b);
  return { soloSeeds, pairedSeeds };
}

/**
 * Assigns already-priority-ordered entrants (best first) to bracket seed
 * numbers per a SeedPairingPlan, guaranteeing no round-1 matchup between two
 * entrants from the same qualifying group. This generalizes the 2-group paper
 * bracket's hand-designed anti-collision layout (TWO_GROUP_*_SEED_TOKENS
 * above) to 3+ groups, where the group makeup of each rank position is
 * data-dependent (§2.2 of qualification-combined-ranking.md) rather than a
 * fixed A1/B1/... label, so a hardcoded token map isn't possible.
 *
 * Solo seeds go to the top-ranked entrants in order (seed1 = best overall),
 * matching the usual "top seed gets the least-known first opponent"
 * convention. Paired seeds are filled by greedily pairing each remaining
 * entrant, in priority order, with the next-best remaining entrant from a
 * *different* group -- always possible here because no group can hold more
 * than half of any remaining pool (every group contributes exactly one
 * entrant per bucket, so buckets 1..soloCount already drain at least one
 * entrant from every group before pairing starts).
 */
function assignAntiCollisionSeeds<T extends { group: string }>(
  orderedEntrants: T[],
  plan: SeedPairingPlan,
): Map<number, T> {
  const seedByEntrant = new Map<number, T>();

  const solo = orderedEntrants.slice(0, plan.soloSeeds.length);
  solo.forEach((entrant, i) => seedByEntrant.set(plan.soloSeeds[i], entrant));

  const pool = orderedEntrants.slice(plan.soloSeeds.length);
  for (const [lowSeed, highSeed] of plan.pairedSeeds) {
    const better = pool.shift() as T;
    const partnerIndex = pool.findIndex((entrant) => entrant.group !== better.group);
    if (partnerIndex === -1) {
      // Provably unreachable for 2-4 groups with the perGroup-per-bucket
      // invariant (exhaustively verified: every bucket contributes one
      // entrant per group, so no group can ever hold the entire remaining
      // pool here) -- fail loudly instead of silently seeding a same-group
      // round-1 pair if that invariant is ever violated by a future change.
      throw new Error(
        `assignAntiCollisionSeeds: no cross-group partner available for seed pair (${lowSeed}, ${highSeed}); ` +
          `remaining pool is all group "${better.group}"`,
      );
    }
    const worse = pool.splice(partnerIndex, 1)[0];
    seedByEntrant.set(lowSeed, better);
    seedByEntrant.set(highSeed, worse);
  }
  return seedByEntrant;
}

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
    const bucketByPaperGroup = new Map([
      ['A', buckets[0]],
      ['B', buckets[1]],
    ]);
    const playerForToken = (token: string): FinalsQualInput<TPlayer> => {
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
      directSeeds,
      barrage: TWO_GROUP_BARRAGE_SEED_TOKENS.map(playerForToken),
      groupCount: 2,
    };
  }

  /* Bucket-stack for 3+ groups (qualification-combined-ranking.md §2-§3): for
   * slot k in [0, perGroup), bucket k = every group's k-th player, tie-broken
   * within the bucket by WDL score -> point differential (no seeding). Every
   * group is guaranteed a k-th player here by the perGroup*2 validation above. */
  const direct: FinalsQualInput<TPlayer>[] = [];
  const barrage: FinalsQualInput<TPlayer>[] = [];
  for (let k = 0; k < perGroup; k++) {
    direct.push(...buckets.map((bucket) => bucket[k]).sort(compareByScoreThenPointsAndCombinedOverride));
  }
  for (let k = perGroup; k < perGroup * 2; k++) {
    barrage.push(...buckets.map((bucket) => bucket[k]).sort(compareByScoreThenPointsAndCombinedOverride));
  }

  const directSeedByEntrant = assignAntiCollisionSeeds(direct, computeDirectSeedPairingPlan());
  const barrageSeedByEntrant = assignAntiCollisionSeeds(barrage, computePlayoffSeedPairingPlan());

  return {
    // directSeeds is the sole direct-advancer contract; a parallel direct[] would risk drift between two slot representations.
    directSeeds: [...directSeedByEntrant.entries()]
      .sort(([seedA], [seedB]) => seedA - seedB)
      .map(([seed, qualification]) => ({ seed, qualification })),
    barrage: [...barrageSeedByEntrant.entries()]
      .sort(([seedA], [seedB]) => seedA - seedB)
      .map(([, qualification]) => qualification),
    groupCount: groupCount as 2 | 3 | 4,
  };
}
