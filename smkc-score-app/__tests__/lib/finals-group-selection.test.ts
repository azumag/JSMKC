/**
 * Tests for finals-group-selection: per-group Top-N selection with bracket seeding
 *
 * Spec (Issue #454):
 *   2 groups: each group Top1-6 direct, Top7-12 barrage
 *   3 groups: each group Top1-4 direct, Top5-8 barrage
 *   4 groups: each group Top1-3 direct, Top4-6 barrage
 *
 * Seed pattern:
 *   2 groups: fixed CDM two-group Top-24 layout
 *   3 groups: A1, B1, C1, A2, B2, C2, A3, B3, C3, A4, B4, C4
 *   4 groups: A1, B1, C1, D1, A2, B2, C2, D2, A3, B3, C3, D3
 */

import { selectFinalsEntrantsByGroup } from '@/lib/finals-group-selection';

type TestQual = { playerId: string; group: string; player: unknown; score: number; points: number };

/**
 * Build an ordered qualification list: grouped alphabetically, and within each group
 * ordered by rank (rank 1 first). Player ID encodes group+rank (e.g. "A1", "B7").
 *
 * score/points default to being *tied across groups at the same rank*
 * (score = 1000 - rank, points = 0 for everyone), so the within-bucket
 * WDL-score tiebreak is a no-op and stable-sort preserves the canonical
 * group order (A, B, C, D) -- this keeps every pre-existing "interleaved by
 * group" assertion valid unchanged. Pass `statsFor` to give specific players
 * a distinguishing score/points and exercise the real tiebreak.
 */
function buildQuals(
  groupSizes: Record<string, number>,
  statsFor?: (playerId: string, rank: number) => { score: number; points: number },
): TestQual[] {
  const out: TestQual[] = [];
  for (const group of Object.keys(groupSizes).sort()) {
    for (let rank = 1; rank <= groupSizes[group]; rank++) {
      const playerId = `${group}${rank}`;
      const stats = statsFor?.(playerId, rank) ?? { score: 1000 - rank, points: 0 };
      out.push({ playerId, group, player: { id: playerId, name: playerId }, ...stats });
    }
  }
  return out;
}

describe('selectFinalsEntrantsByGroup', () => {
  const upperR1SeedPairs = [
    [1, 16], [8, 9], [5, 12], [4, 13],
    [3, 14], [6, 11], [7, 10], [2, 15],
  ];

  describe('2-group case (A=14, B=13)', () => {
    const quals = buildQuals({ A: 14, B: 13 });
    const result = selectFinalsEntrantsByGroup(quals);

    it('reports groupCount=2', () => {
      expect(result.groupCount).toBe(2);
    });

    it('directSeeds[] maps direct players to the handwritten Upper Bracket seeds', () => {
      expect(result.directSeeds.map(({ seed, qualification }) => [seed, qualification.playerId])).toEqual([
        [1, 'A1'],
        [2, 'B3'],
        [3, 'B1'],
        [4, 'A3'],
        [5, 'B2'],
        [6, 'A4'],
        [7, 'A2'],
        [8, 'B4'],
        [9, 'A5'],
        [11, 'B5'],
        [13, 'B6'],
        [15, 'A6'],
      ]);
    });

    it('does not expose the redundant direct[] projection for 2 groups', () => {
      expect('direct' in result).toBe(false);
    });

    it('directSeeds[] renders top-to-bottom as the handwritten 2-group Upper R1 bracket', () => {
      const directBySeed = new Map(result.directSeeds.map(({ seed, qualification }) => [seed, qualification.playerId]));
      const labelForSeed = (seed: number) => directBySeed.get(seed) ?? 'barrage';
      expect(upperR1SeedPairs.map(([p1, p2]) => [labelForSeed(p1), labelForSeed(p2)])).toEqual([
        ['A1', 'barrage'],
        ['B4', 'A5'],
        ['B2', 'barrage'],
        ['A3', 'B6'],
        ['B1', 'barrage'],
        ['A4', 'B5'],
        ['A2', 'barrage'],
        ['B3', 'A6'],
      ]);
    });

    it('barrage[] is ordered by playoff seeds 1-12 for the handwritten layout', () => {
      expect(result.barrage.map(q => q.playerId)).toEqual([
        'B8', 'B7', 'A8', 'A7',
        'B9', 'A11', 'B10', 'A12',
        'A10', 'B12', 'A9', 'B11',
      ]);
    });

    it('barrage[] creates the handwritten R1-to-bye blocks with the existing playoff structure', () => {
      const barrageBySeed = new Map(result.barrage.map((q, index) => [index + 1, q.playerId]));
      expect([
        [barrageBySeed.get(11), barrageBySeed.get(10), barrageBySeed.get(1)],
        [barrageBySeed.get(7), barrageBySeed.get(6), barrageBySeed.get(4)],
        [barrageBySeed.get(5), barrageBySeed.get(8), barrageBySeed.get(3)],
        [barrageBySeed.get(9), barrageBySeed.get(12), barrageBySeed.get(2)],
      ]).toEqual([
        ['A9', 'B12', 'B8'],
        ['B10', 'A11', 'A7'],
        ['B9', 'A12', 'A8'],
        ['A10', 'B11', 'B7'],
      ]);
    });
  });

  describe('3-group case (A=9, B=9, C=9)', () => {
    const quals = buildQuals({ A: 9, B: 9, C: 9 });
    const result = selectFinalsEntrantsByGroup(quals);

    it('reports groupCount=3', () => {
      expect(result.groupCount).toBe(3);
    });

    it('directSeeds[] is Top1-4 from each group, interleaved', () => {
      expect(result.directSeeds.map(({ seed, qualification }) => [seed, qualification.playerId])).toEqual([
        [1, 'A1'], [2, 'B1'], [3, 'C1'],
        [4, 'A2'], [5, 'B2'], [6, 'C2'],
        [7, 'A3'], [8, 'B3'], [9, 'C3'],
        [10, 'A4'], [11, 'B4'], [12, 'C4'],
      ]);
    });

    it('does not expose legacy direct[] because callers should use directSeeds[]', () => {
      expect('direct' in result).toBe(false);
      expect(result.directSeeds.map(({ qualification }) => qualification.playerId)).toEqual([
        'A1', 'B1', 'C1',
        'A2', 'B2', 'C2',
        'A3', 'B3', 'C3',
        'A4', 'B4', 'C4',
      ]);
    });

    it('barrage[] is Top5-8 from each group, interleaved', () => {
      expect(result.barrage.map(q => q.playerId)).toEqual([
        'A5', 'B5', 'C5',
        'A6', 'B6', 'C6',
        'A7', 'B7', 'C7',
        'A8', 'B8', 'C8',
      ]);
    });
  });

  describe('3-group bucket tiebreak (WDL score -> points, not group letter)', () => {
    // Regression test for the bug found in the CDM Excel template's 2-group
    // formula (docs/qualification-combined-ranking.md §3): a naive per-group
    // interleave always resolves a same-bucket tie as "earliest group letter
    // wins", silently misranking a genuinely-better later-lettered group's
    // player. Rank-1 (bucket 0) scores are set so B1 > C1 > A1; every other
    // rank keeps the tied default so the rest of the interleave is unaffected.
    const rank1Stats: Record<string, { score: number; points: number }> = {
      A1: { score: 5, points: 0 },
      B1: { score: 9, points: 0 },
      C1: { score: 7, points: 0 },
    };
    const quals = buildQuals({ A: 9, B: 9, C: 9 }, (playerId, rank) =>
      rank === 1 ? rank1Stats[playerId] : { score: 1000 - rank, points: 0 });
    const result = selectFinalsEntrantsByGroup(quals);

    it('orders bucket 0 by score (B1 > C1 > A1) instead of alphabetically', () => {
      expect(result.directSeeds.map(({ seed, qualification }) => [seed, qualification.playerId])).toEqual([
        [1, 'B1'], [2, 'C1'], [3, 'A1'],
        [4, 'A2'], [5, 'B2'], [6, 'C2'],
        [7, 'A3'], [8, 'B3'], [9, 'C3'],
        [10, 'A4'], [11, 'B4'], [12, 'C4'],
      ]);
    });
  });

  describe('4-group case (A=B=C=D=6)', () => {
    const quals = buildQuals({ A: 6, B: 6, C: 6, D: 6 });
    const result = selectFinalsEntrantsByGroup(quals);

    it('reports groupCount=4', () => {
      expect(result.groupCount).toBe(4);
    });

    it('directSeeds[] is Top1-3 from each group, interleaved', () => {
      expect(result.directSeeds.map(({ seed, qualification }) => [seed, qualification.playerId])).toEqual([
        [1, 'A1'], [2, 'B1'], [3, 'C1'], [4, 'D1'],
        [5, 'A2'], [6, 'B2'], [7, 'C2'], [8, 'D2'],
        [9, 'A3'], [10, 'B3'], [11, 'C3'], [12, 'D3'],
      ]);
    });

    it('does not expose legacy direct[] because callers should use directSeeds[]', () => {
      expect('direct' in result).toBe(false);
      expect(result.directSeeds.map(({ qualification }) => qualification.playerId)).toEqual([
        'A1', 'B1', 'C1', 'D1',
        'A2', 'B2', 'C2', 'D2',
        'A3', 'B3', 'C3', 'D3',
      ]);
    });

    it('barrage[] is Top4-6 from each group, interleaved', () => {
      expect(result.barrage.map(q => q.playerId)).toEqual([
        'A4', 'B4', 'C4', 'D4',
        'A5', 'B5', 'C5', 'D5',
        'A6', 'B6', 'C6', 'D6',
      ]);
    });
  });

  describe('4-group barrage bucket tiebreak (WDL score -> points, not group letter)', () => {
    // Same regression coverage as the 3-group direct-seed case, but for the
    // barrage range, mirroring docs/qualification-combined-ranking.md §3's
    // "B4(24) should outrank A4(23)" example -- here with a 4th group too.
    const rank4Stats: Record<string, { score: number; points: number }> = {
      A4: { score: 23, points: 0 },
      B4: { score: 24, points: 0 },
      C4: { score: 20, points: 0 },
      D4: { score: 22, points: 0 },
    };
    const quals = buildQuals({ A: 6, B: 6, C: 6, D: 6 }, (playerId, rank) =>
      rank === 4 ? rank4Stats[playerId] : { score: 1000 - rank, points: 0 });
    const result = selectFinalsEntrantsByGroup(quals);

    it('orders the barrage bucket by score (B4 > A4 > D4 > C4) instead of alphabetically', () => {
      expect(result.barrage.slice(0, 4).map(q => q.playerId)).toEqual(['B4', 'A4', 'D4', 'C4']);
    });
  });

  describe('uneven group sizes (barrage slots still filled to 12)', () => {
    it('2 groups A=20, B=12: each contributes Top1-6 direct, Top7-12 barrage', () => {
      const quals = buildQuals({ A: 20, B: 12 });
      const result = selectFinalsEntrantsByGroup(quals);
      expect(result.directSeeds.map(({ seed, qualification }) => [seed, qualification.playerId])).toEqual([
        [1, 'A1'],
        [2, 'B3'],
        [3, 'B1'],
        [4, 'A3'],
        [5, 'B2'],
        [6, 'A4'],
        [7, 'A2'],
        [8, 'B4'],
        [9, 'A5'],
        [11, 'B5'],
        [13, 'B6'],
        [15, 'A6'],
      ]);
      expect(result.barrage.map(q => q.playerId)).toEqual([
        'B8', 'B7', 'A8', 'A7',
        'B9', 'A11', 'B10', 'A12',
        'A10', 'B12', 'A9', 'B11',
      ]);
    });
  });

  describe('error cases', () => {
    it('throws when a group has fewer than perGroup*2 players (2 groups, B=11)', () => {
      const quals = buildQuals({ A: 14, B: 11 });
      expect(() => selectFinalsEntrantsByGroup(quals)).toThrow(/Not enough players in group B/);
    });

    it('throws when only 1 group is present', () => {
      const quals = buildQuals({ A: 24 });
      expect(() => selectFinalsEntrantsByGroup(quals)).toThrow(/Unsupported group count/);
    });

    it('throws when group count is not a divisor of 12', () => {
      // 5 groups would need perGroup=2.4, not supported. Not reachable via GROUPS constant (max 4),
      // but defensive check.
      const quals: TestQual[] = [];
      for (const g of ['A', 'B', 'C', 'D', 'E']) {
        for (let r = 1; r <= 6; r++) {
          quals.push({ playerId: `${g}${r}`, group: g, player: { id: `${g}${r}` }, score: 1000 - r, points: 0 });
        }
      }
      expect(() => selectFinalsEntrantsByGroup(quals)).toThrow(/Unsupported group count/);
    });

    it('throws when input is empty', () => {
      expect(() => selectFinalsEntrantsByGroup([])).toThrow();
    });
  });

  describe('input ordering is preserved within group', () => {
    it('respects the caller-provided order even if scrambled across groups', () => {
      // Caller provides interleaved A/B (out-of-group order). The function should still
      // bucket by group while preserving per-group relative order.
      const mk = (g: string, r: number): TestQual => ({
        playerId: `${g}${r}`, group: g, player: { id: `${g}${r}` }, score: 1000 - r, points: 0,
      });
      const quals: TestQual[] = [];
      for (let r = 1; r <= 12; r++) {
        quals.push(mk('A', r), mk('B', r));
      }
      const result = selectFinalsEntrantsByGroup(quals);
      expect(result.directSeeds.map(({ qualification }) => qualification.playerId)).toEqual([
        'A1', 'B3', 'B1', 'A3',
        'B2', 'A4', 'A2', 'B4',
        'A5', 'B5', 'B6', 'A6',
      ]);
      expect('direct' in result).toBe(false);
    });
  });
});
