/**
 * Tests for finals-group-selection: per-group Top-N selection with bracket seeding
 *
 * Spec (Issue #454):
 *   2 groups: each group Top1-6 direct, Top7-12 barrage
 *   3 groups: each group Top1-4 direct, Top5-8 barrage
 *   4 groups: each group Top1-3 direct, Top4-6 barrage
 *
 * Seed assignment is bucket-stacked and contiguous for every group count:
 * direct seeds are 1-12 in bucket order, barrage seeds are 13-24 in bucket
 * order. There is no same-qualifying-group Round-1 collision avoidance (see
 * the module doc comment on finals-group-selection.ts for why that was
 * removed: it was never validated against a real event and does not match
 * the CDM 2025 official results, which has same-group Winners R1 matchups).
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
 * group order (A, B, C, D) -- this keeps every "interleaved by group"
 * assertion valid unchanged. Pass `statsFor` to give specific players a
 * distinguishing score/points and exercise the real tiebreak.
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
  describe('2-group case (A=14, B=13, all ranks tied -> stable A-then-B order)', () => {
    const quals = buildQuals({ A: 14, B: 13 });
    const result = selectFinalsEntrantsByGroup(quals);

    it('reports groupCount=2', () => {
      expect(result.groupCount).toBe(2);
    });

    it('directSeeds[] is bucket-stacked 1-12 (A1,B1,A2,B2,...)', () => {
      expect(result.directSeeds.map(({ seed, qualification }) => [seed, qualification.playerId])).toEqual([
        [1, 'A1'],
        [2, 'B1'],
        [3, 'A2'],
        [4, 'B2'],
        [5, 'A3'],
        [6, 'B3'],
        [7, 'A4'],
        [8, 'B4'],
        [9, 'A5'],
        [10, 'B5'],
        [11, 'A6'],
        [12, 'B6'],
      ]);
    });

    it('barrageSeeds[] is bucket-stacked 13-24 (A7,B7,A8,B8,...)', () => {
      expect(result.barrageSeeds.map(({ seed, qualification }) => [seed, qualification.playerId])).toEqual([
        [13, 'A7'],
        [14, 'B7'],
        [15, 'A8'],
        [16, 'B8'],
        [17, 'A9'],
        [18, 'B9'],
        [19, 'A10'],
        [20, 'B10'],
        [21, 'A11'],
        [22, 'B11'],
        [23, 'A12'],
        [24, 'B12'],
      ]);
    });

    // Issue #1051: directSeeds/barrageSeeds (each { seed, qualification }) are
    // the sole public contract for every group count -- there is no redundant
    // legacy direct[]/barrage[] projection a caller could drift against.
    it('does not expose a redundant direct[]/barrage[] projection', () => {
      expect('direct' in result).toBe(false);
      expect('barrage' in result).toBe(false);
    });
  });

  describe('3-group case (A=9, B=9, C=9, all ranks tied -> stable A-then-B-then-C order)', () => {
    const quals = buildQuals({ A: 9, B: 9, C: 9 });
    const result = selectFinalsEntrantsByGroup(quals);

    it('reports groupCount=3', () => {
      expect(result.groupCount).toBe(3);
    });

    it('directSeeds[] is bucket-stacked 1-12 (A1,B1,C1,A2,B2,C2,...)', () => {
      expect(result.directSeeds.map(({ seed, qualification }) => [seed, qualification.playerId])).toEqual([
        [1, 'A1'],
        [2, 'B1'],
        [3, 'C1'],
        [4, 'A2'],
        [5, 'B2'],
        [6, 'C2'],
        [7, 'A3'],
        [8, 'B3'],
        [9, 'C3'],
        [10, 'A4'],
        [11, 'B4'],
        [12, 'C4'],
      ]);
    });

    it('barrageSeeds[] is bucket-stacked 13-24 (A5,B5,C5,A6,B6,C6,...)', () => {
      expect(result.barrageSeeds.map(({ seed, qualification }) => [seed, qualification.playerId])).toEqual([
        [13, 'A5'],
        [14, 'B5'],
        [15, 'C5'],
        [16, 'A6'],
        [17, 'B6'],
        [18, 'C6'],
        [19, 'A7'],
        [20, 'B7'],
        [21, 'C7'],
        [22, 'A8'],
        [23, 'B8'],
        [24, 'C8'],
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
      rank === 1 ? rank1Stats[playerId] : { score: 1000 - rank, points: 0 },
    );
    const result = selectFinalsEntrantsByGroup(quals);

    it('orders bucket 0 by score (B1 > C1 > A1) instead of group letter, as seeds 1-3', () => {
      const bySeed = new Map(result.directSeeds.map(({ seed, qualification }) => [seed, qualification.playerId]));
      expect([1, 2, 3].map((s) => bySeed.get(s))).toEqual(['B1', 'C1', 'A1']);
    });
  });

  describe('3-group complete-tie playoff order', () => {
    it('uses combinedRankOverride after WDL score and points are fully tied', () => {
      const quals = buildQuals({ A: 9, B: 9, C: 9 }).map((qualification) => ({
        ...qualification,
        combinedRankOverride:
          qualification.playerId === 'A1'
            ? 3
            : qualification.playerId === 'B1'
              ? 1
              : qualification.playerId === 'C1'
                ? 2
                : null,
      }));
      const result = selectFinalsEntrantsByGroup(quals);
      const bySeed = new Map(result.directSeeds.map(({ seed, qualification }) => [seed, qualification.playerId]));

      expect([1, 2, 3].map((seed) => bySeed.get(seed))).toEqual(['B1', 'C1', 'A1']);
    });
  });

  describe('4-group case (A=B=C=D=6, all ranks tied -> stable A-B-C-D order)', () => {
    const quals = buildQuals({ A: 6, B: 6, C: 6, D: 6 });
    const result = selectFinalsEntrantsByGroup(quals);

    it('reports groupCount=4', () => {
      expect(result.groupCount).toBe(4);
    });

    it('directSeeds[] is bucket-stacked 1-12 (A1,B1,C1,D1,A2,B2,C2,D2,...)', () => {
      expect(result.directSeeds.map(({ seed, qualification }) => [seed, qualification.playerId])).toEqual([
        [1, 'A1'],
        [2, 'B1'],
        [3, 'C1'],
        [4, 'D1'],
        [5, 'A2'],
        [6, 'B2'],
        [7, 'C2'],
        [8, 'D2'],
        [9, 'A3'],
        [10, 'B3'],
        [11, 'C3'],
        [12, 'D3'],
      ]);
    });

    it('barrageSeeds[] is bucket-stacked 13-24 (A4,B4,C4,D4,A5,B5,C5,D5,...)', () => {
      expect(result.barrageSeeds.map(({ seed, qualification }) => [seed, qualification.playerId])).toEqual([
        [13, 'A4'],
        [14, 'B4'],
        [15, 'C4'],
        [16, 'D4'],
        [17, 'A5'],
        [18, 'B5'],
        [19, 'C5'],
        [20, 'D5'],
        [21, 'A6'],
        [22, 'B6'],
        [23, 'C6'],
        [24, 'D6'],
      ]);
    });
  });

  describe('4-group barrage bucket tiebreak (WDL score -> points, not group letter)', () => {
    const rank4Stats: Record<string, { score: number; points: number }> = {
      A4: { score: 23, points: 0 },
      B4: { score: 24, points: 0 },
      C4: { score: 20, points: 0 },
      D4: { score: 22, points: 0 },
    };
    const quals = buildQuals({ A: 6, B: 6, C: 6, D: 6 }, (playerId, rank) =>
      rank === 4 ? rank4Stats[playerId] : { score: 1000 - rank, points: 0 },
    );
    const result = selectFinalsEntrantsByGroup(quals);

    it('orders the barrage bucket by score (B4 > A4 > D4 > C4) instead of alphabetically', () => {
      expect(result.barrageSeeds.slice(0, 4).map(({ qualification }) => qualification.playerId)).toEqual([
        'B4',
        'A4',
        'D4',
        'C4',
      ]);
    });
  });

  describe('uneven group sizes (barrage slots still filled to 12)', () => {
    it('2 groups A=20, B=12: each contributes Top1-6 direct, Top7-12 barrage', () => {
      const quals = buildQuals({ A: 20, B: 12 });
      const result = selectFinalsEntrantsByGroup(quals);
      expect(result.directSeeds.map(({ qualification }) => qualification.playerId)).toEqual([
        'A1',
        'B1',
        'A2',
        'B2',
        'A3',
        'B3',
        'A4',
        'B4',
        'A5',
        'B5',
        'A6',
        'B6',
      ]);
      expect(result.barrageSeeds.map(({ qualification }) => qualification.playerId)).toEqual([
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
      ]);
    });
  });

  describe('CDM 2025 golden regression (real qualification results)', () => {
    /*
     * Real BM qualification data from the CDM 2025 official results workbook
     * (uploaded by the user, cross-checked cell-by-cell): 3 groups of 15,
     * score = the workbook's Q column, points = the O column. This locks in
     * the exact real-world Top-24 seed list end-to-end (bucket stacking +
     * WDL score -> points tiebreak), the concrete evidence behind removing
     * anti-collision seeding (see module doc comment).
     */
    const CDM_2025_BM_QUALIFICATIONS: Record<string, Array<[string, number, number]>> = {
      A: [
        ['KVD', 966, 48],
        ['Drew', 900, 42],
        ['Kasmo', 833, 38],
        ['Zarkov', 766, 24],
        ['Thibault', 700, 18],
        ['Patrick', 666, 28],
        ['Sargoth', 633, 12],
        ['Rune', 566, 8],
        ['Rejemy', 466, 0],
        ['Sjors', 400, -8],
        ['Narnet', 333, -16],
        ['Bluh', 300, -22],
        ["L'escargot", 200, -30],
        ['Ale', 166, -40],
        ['Lio', 100, -40],
      ],
      B: [
        ['Geo', 1000, 58],
        ['Lafungo', 900, 42],
        ['Antistar', 900, 34],
        ['Moll', 766, 26],
        ['Jarmou', 733, 32],
        ['Rub', 666, 22],
        ['Flo', 600, 16],
        ['JDR', 466, -2],
        ['Chachamaxx', 400, -12],
        ['Oni', 400, -16],
        ['FF', 300, -20],
        ['Getarez', 300, -22],
        ['Lenain', 233, -24],
        ['Danny', 166, -34],
        ['BigMountain', 166, -40],
      ],
      C: [
        ['Sami', 1000, 58],
        ['Champix', 933, 38],
        ['Takashi', 833, 38],
        ['Onwa', 766, 32],
        ['Leyla', 733, 24],
        ['tif', 700, 22],
        ['Mark', 600, 16],
        ['Banana', 500, 0],
        ['Ours', 433, -8],
        ['Edwin', 433, -8],
        ['Ashley', 366, -16],
        ['Cap', 233, -32],
        ['Zip', 200, -26],
        ['Titou', 166, -36],
        ['Miku', 100, -42],
      ],
    };

    /*
     * Two bucket positions are exact score+points ties across groups
     * (Kasmo/Takashi at 833/38; Flo/Mark at 600/16), which the automatic
     * bucket tiebreak alone cannot order -- exactly the scenario
     * combinedRankOverride exists for (see "3-group complete-tie playoff
     * order" above). The real event's published seed list has Takashi ahead
     * of Kasmo and Mark ahead of Flo, so a manual cross-group sudden-death
     * decision is encoded here to reproduce that real outcome.
     */
    const COMBINED_RANK_OVERRIDES: Record<string, number> = {
      Takashi: 1,
      Kasmo: 2,
      Mark: 1,
      Flo: 2,
    };

    const quals = Object.entries(CDM_2025_BM_QUALIFICATIONS).flatMap(([group, players]) =>
      players.map(([playerId, score, points]) => ({
        playerId,
        group,
        player: { id: playerId },
        score,
        points,
        combinedRankOverride: COMBINED_RANK_OVERRIDES[playerId] ?? null,
      })),
    );
    const result = selectFinalsEntrantsByGroup(quals);

    it('reproduces the official CDM 2025 Top-12 direct seed order exactly', () => {
      expect(result.directSeeds.map(({ seed, qualification }) => [seed, qualification.playerId])).toEqual([
        [1, 'Geo'],
        [2, 'Sami'],
        [3, 'KVD'],
        [4, 'Champix'],
        [5, 'Drew'],
        [6, 'Lafungo'],
        [7, 'Antistar'],
        [8, 'Takashi'],
        [9, 'Kasmo'],
        [10, 'Onwa'],
        [11, 'Moll'],
        [12, 'Zarkov'],
      ]);
    });

    it('reproduces the official CDM 2025 seed-13-24 barrage order exactly (Jarmou=13, JDR=24)', () => {
      expect(result.barrageSeeds.map(({ seed, qualification }) => [seed, qualification.playerId])).toEqual([
        [13, 'Jarmou'],
        [14, 'Leyla'],
        [15, 'Thibault'],
        [16, 'tif'],
        [17, 'Patrick'],
        [18, 'Rub'],
        [19, 'Sargoth'],
        [20, 'Mark'],
        [21, 'Flo'],
        [22, 'Rune'],
        [23, 'Banana'],
        [24, 'JDR'],
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
        playerId: `${g}${r}`,
        group: g,
        player: { id: `${g}${r}` },
        score: 1000 - r,
        points: 0,
      });
      const quals: TestQual[] = [];
      for (let r = 1; r <= 12; r++) {
        quals.push(mk('A', r), mk('B', r));
      }
      const result = selectFinalsEntrantsByGroup(quals);
      expect(result.directSeeds.map(({ qualification }) => qualification.playerId)).toEqual([
        'A1',
        'B1',
        'A2',
        'B2',
        'A3',
        'B3',
        'A4',
        'B4',
        'A5',
        'B5',
        'A6',
        'B6',
      ]);
    });
  });
});
