/**
 * Tests for finals-group-selection: per-group Top-N selection with interleaved seeding
 *
 * Spec (Issue #454):
 *   2 groups: each group Top1-6 direct, Top7-12 barrage
 *   3 groups: each group Top1-4 direct, Top5-8 barrage
 *   4 groups: each group Top1-3 direct, Top4-6 barrage
 *
 * Interleave pattern for seeds (direct seeds 1-12, playoff seeds 1-12):
 *   2 groups: A1, B1, A2, B2, A3, B3, A4, B4, A5, B5, A6, B6
 *   3 groups: A1, B1, C1, A2, B2, C2, A3, B3, C3, A4, B4, C4
 *   4 groups: A1, B1, C1, D1, A2, B2, C2, D2, A3, B3, C3, D3
 */

import { selectFinalsEntrantsByGroup } from '@/lib/finals-group-selection';

type TestQual = { playerId: string; group: string; player: unknown };

/**
 * Build an ordered qualification list: grouped alphabetically, and within each group
 * ordered by rank (rank 1 first). Player ID encodes group+rank (e.g. "A1", "B7").
 */
function buildQuals(groupSizes: Record<string, number>): TestQual[] {
  const out: TestQual[] = [];
  for (const group of Object.keys(groupSizes).sort()) {
    for (let rank = 1; rank <= groupSizes[group]; rank++) {
      const playerId = `${group}${rank}`;
      out.push({ playerId, group, player: { id: playerId, name: playerId } });
    }
  }
  return out;
}

describe('selectFinalsEntrantsByGroup', () => {
  describe('2-group case (A=14, B=13)', () => {
    const quals = buildQuals({ A: 14, B: 13 });
    const result = selectFinalsEntrantsByGroup(quals);

    it('reports groupCount=2', () => {
      expect(result.groupCount).toBe(2);
    });

    it('direct[] is A1,B1,A2,B2,...,A6,B6 (12 players, interleaved)', () => {
      expect(result.direct.map(q => q.playerId)).toEqual([
        'A1', 'B1', 'A2', 'B2', 'A3', 'B3',
        'A4', 'B4', 'A5', 'B5', 'A6', 'B6',
      ]);
    });

    it('barrage[] is A7,B7,A8,B8,...,A12,B12 (12 players, interleaved)', () => {
      expect(result.barrage.map(q => q.playerId)).toEqual([
        'A7', 'B7', 'A8', 'B8', 'A9', 'B9',
        'A10', 'B10', 'A11', 'B11', 'A12', 'B12',
      ]);
    });
  });

  describe('3-group case (A=9, B=9, C=9)', () => {
    const quals = buildQuals({ A: 9, B: 9, C: 9 });
    const result = selectFinalsEntrantsByGroup(quals);

    it('reports groupCount=3', () => {
      expect(result.groupCount).toBe(3);
    });

    it('direct[] is Top1-4 from each group, interleaved', () => {
      expect(result.direct.map(q => q.playerId)).toEqual([
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

  describe('4-group case (A=B=C=D=6)', () => {
    const quals = buildQuals({ A: 6, B: 6, C: 6, D: 6 });
    const result = selectFinalsEntrantsByGroup(quals);

    it('reports groupCount=4', () => {
      expect(result.groupCount).toBe(4);
    });

    it('direct[] is Top1-3 from each group, interleaved', () => {
      expect(result.direct.map(q => q.playerId)).toEqual([
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

  describe('uneven group sizes (barrage slots still filled to 12)', () => {
    it('2 groups A=20, B=12: each contributes Top1-6 direct, Top7-12 barrage', () => {
      const quals = buildQuals({ A: 20, B: 12 });
      const result = selectFinalsEntrantsByGroup(quals);
      expect(result.direct.map(q => q.playerId)).toEqual([
        'A1', 'B1', 'A2', 'B2', 'A3', 'B3',
        'A4', 'B4', 'A5', 'B5', 'A6', 'B6',
      ]);
      expect(result.barrage.map(q => q.playerId)).toEqual([
        'A7', 'B7', 'A8', 'B8', 'A9', 'B9',
        'A10', 'B10', 'A11', 'B11', 'A12', 'B12',
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
          quals.push({ playerId: `${g}${r}`, group: g, player: { id: `${g}${r}` } });
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
        playerId: `${g}${r}`, group: g, player: { id: `${g}${r}` },
      });
      const quals: TestQual[] = [];
      for (let r = 1; r <= 12; r++) {
        quals.push(mk('A', r), mk('B', r));
      }
      const result = selectFinalsEntrantsByGroup(quals);
      expect(result.direct.map(q => q.playerId)).toEqual([
        'A1', 'B1', 'A2', 'B2', 'A3', 'B3',
        'A4', 'B4', 'A5', 'B5', 'A6', 'B6',
      ]);
    });
  });
});
