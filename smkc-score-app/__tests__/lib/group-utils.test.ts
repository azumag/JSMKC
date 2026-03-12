/**
 * Tests for group-utils: seeding-based group distribution
 *
 * Based on requirements.md §10.2 シード順によるグループ分け:
 * - Snake/zigzag pattern: seed1→A, seed2→B, seed3→C, seed4→D, seed5→A...
 * - Supports 2, 3, or 4 groups
 */

import {
  GROUPS,
  assignGroupsBySeeding,
  randomlyAssignGroups,
  recommendGroupCount,
} from '@/lib/group-utils';

// Local type alias (mirrors SetupPlayer from group-utils) - avoids Babel "import type" parsing issues
type SetupPlayer = { playerId: string; group: string; seeding?: number };

describe('GROUPS constant', () => {
  it('should contain A, B, C, D for 4-group support', () => {
    expect(GROUPS).toEqual(['A', 'B', 'C', 'D']);
  });
});

describe('assignGroupsBySeeding', () => {
  /**
   * §10.2 Example: 19 players distributed to 4 groups
   * A: 1, 5, 9, 13, 17
   * B: 2, 6, 10, 14, 18
   * C: 3, 7, 11, 15, 19
   * D: 4, 8, 12, 16
   */
  it('should distribute 19 players to 4 groups per §10.2 snake pattern', () => {
    const players: SetupPlayer[] = Array.from({ length: 19 }, (_, i) => ({
      playerId: `p${i + 1}`,
      group: 'A',
      seeding: i + 1,
    }));

    const result = assignGroupsBySeeding(players, 4);

    expect(result.filter(p => p.group === 'A').map(p => p.seeding)).toEqual([1, 5, 9, 13, 17]);
    expect(result.filter(p => p.group === 'B').map(p => p.seeding)).toEqual([2, 6, 10, 14, 18]);
    expect(result.filter(p => p.group === 'C').map(p => p.seeding)).toEqual([3, 7, 11, 15, 19]);
    expect(result.filter(p => p.group === 'D').map(p => p.seeding)).toEqual([4, 8, 12, 16]);
  });

  it('should distribute players to 2 groups', () => {
    const players: SetupPlayer[] = Array.from({ length: 6 }, (_, i) => ({
      playerId: `p${i + 1}`,
      group: 'A',
      seeding: i + 1,
    }));

    const result = assignGroupsBySeeding(players, 2);

    expect(result.filter(p => p.group === 'A').map(p => p.seeding)).toEqual([1, 3, 5]);
    expect(result.filter(p => p.group === 'B').map(p => p.seeding)).toEqual([2, 4, 6]);
  });

  it('should distribute players to 3 groups', () => {
    const players: SetupPlayer[] = Array.from({ length: 9 }, (_, i) => ({
      playerId: `p${i + 1}`,
      group: 'A',
      seeding: i + 1,
    }));

    const result = assignGroupsBySeeding(players, 3);

    expect(result.filter(p => p.group === 'A').map(p => p.seeding)).toEqual([1, 4, 7]);
    expect(result.filter(p => p.group === 'B').map(p => p.seeding)).toEqual([2, 5, 8]);
    expect(result.filter(p => p.group === 'C').map(p => p.seeding)).toEqual([3, 6, 9]);
  });

  it('should sort players by seeding before distribution (handles unsorted input)', () => {
    const players: SetupPlayer[] = [
      { playerId: 'p3', group: 'A', seeding: 3 },
      { playerId: 'p1', group: 'A', seeding: 1 },
      { playerId: 'p4', group: 'A', seeding: 4 },
      { playerId: 'p2', group: 'A', seeding: 2 },
    ];

    const result = assignGroupsBySeeding(players, 2);

    expect(result.find(p => p.playerId === 'p1')!.group).toBe('A');
    expect(result.find(p => p.playerId === 'p2')!.group).toBe('B');
    expect(result.find(p => p.playerId === 'p3')!.group).toBe('A');
    expect(result.find(p => p.playerId === 'p4')!.group).toBe('B');
  });

  it('should not mutate the original array', () => {
    const players: SetupPlayer[] = [
      { playerId: 'p1', group: 'C', seeding: 1 },
      { playerId: 'p2', group: 'C', seeding: 2 },
    ];
    const original = [...players.map(p => ({ ...p }))];

    assignGroupsBySeeding(players, 2);

    expect(players).toEqual(original);
  });

  it('should handle players without seeding (placed last)', () => {
    const players: SetupPlayer[] = [
      { playerId: 'p1', group: 'A', seeding: 1 },
      { playerId: 'pNoSeed', group: 'A' },
      { playerId: 'p2', group: 'A', seeding: 2 },
    ];

    const result = assignGroupsBySeeding(players, 2);

    expect(result.find(p => p.playerId === 'p1')!.group).toBe('A');
    expect(result.find(p => p.playerId === 'p2')!.group).toBe('B');
    expect(result.find(p => p.playerId === 'pNoSeed')!.group).toBe('A');
  });

  it('should preserve player IDs and seeding values', () => {
    const players: SetupPlayer[] = [
      { playerId: 'p1', group: 'A', seeding: 1 },
      { playerId: 'p2', group: 'A', seeding: 2 },
    ];

    const result = assignGroupsBySeeding(players, 2);

    expect(result.find(p => p.playerId === 'p1')!.seeding).toBe(1);
    expect(result.find(p => p.playerId === 'p2')!.seeding).toBe(2);
  });

  it('should return empty array for empty input', () => {
    expect(assignGroupsBySeeding([], 3)).toEqual([]);
  });

  it('should handle single player', () => {
    const result = assignGroupsBySeeding(
      [{ playerId: 'p1', group: 'B', seeding: 1 }],
      3,
    );
    expect(result).toHaveLength(1);
    expect(result[0].group).toBe('A');
  });

  /* Edge case: groupCount boundary values */
  it('should clamp groupCount=0 to minimum 2 groups', () => {
    const players: SetupPlayer[] = [
      { playerId: 'p1', group: 'A', seeding: 1 },
      { playerId: 'p2', group: 'A', seeding: 2 },
    ];

    const result = assignGroupsBySeeding(players, 0);

    expect(result[0].group).toBe('A');
    expect(result[1].group).toBe('B');
  });

  it('should clamp groupCount=1 to minimum 2 groups', () => {
    const players: SetupPlayer[] = [
      { playerId: 'p1', group: 'A', seeding: 1 },
      { playerId: 'p2', group: 'A', seeding: 2 },
    ];

    const result = assignGroupsBySeeding(players, 1);

    expect(result[0].group).toBe('A');
    expect(result[1].group).toBe('B');
  });

  it('should clamp groupCount=5 to maximum 4 groups', () => {
    const players: SetupPlayer[] = Array.from({ length: 5 }, (_, i) => ({
      playerId: `p${i + 1}`,
      group: 'A',
      seeding: i + 1,
    }));

    const result = assignGroupsBySeeding(players, 5);

    /* Should use max 4 groups: A,B,C,D,A */
    expect(result[0].group).toBe('A');
    expect(result[3].group).toBe('D');
    expect(result[4].group).toBe('A');
  });

  it('should handle duplicate seeding numbers deterministically', () => {
    const players: SetupPlayer[] = [
      { playerId: 'p1', group: 'A', seeding: 1 },
      { playerId: 'p2', group: 'A', seeding: 1 },
      { playerId: 'p3', group: 'A', seeding: 2 },
    ];

    const result = assignGroupsBySeeding(players, 3);

    /* Both seed-1 players sorted to front, seed-2 last */
    expect(result).toHaveLength(3);
    expect(result[2].playerId).toBe('p3');
  });

  it('should handle non-integer groupCount by flooring', () => {
    const players: SetupPlayer[] = [
      { playerId: 'p1', group: 'A', seeding: 1 },
      { playerId: 'p2', group: 'A', seeding: 2 },
      { playerId: 'p3', group: 'A', seeding: 3 },
    ];

    /* 2.7 should floor to 2 */
    const result = assignGroupsBySeeding(players, 2.7);

    expect(result[0].group).toBe('A');
    expect(result[1].group).toBe('B');
    expect(result[2].group).toBe('A');
  });
});

describe('randomlyAssignGroups (with groupCount)', () => {
  it('should distribute players across 3 groups by default', () => {
    const players: SetupPlayer[] = Array.from({ length: 12 }, (_, i) => ({
      playerId: `p${i}`,
      group: 'A',
    }));

    const result = randomlyAssignGroups(players, 3);
    const groups = result.map(p => p.group);

    expect(groups.every(g => ['A', 'B', 'C'].includes(g))).toBe(true);
    expect(groups.filter(g => g === 'A')).toHaveLength(4);
    expect(groups.filter(g => g === 'B')).toHaveLength(4);
    expect(groups.filter(g => g === 'C')).toHaveLength(4);
  });

  it('should support 4 groups', () => {
    const players: SetupPlayer[] = Array.from({ length: 8 }, (_, i) => ({
      playerId: `p${i}`,
      group: 'A',
    }));

    const result = randomlyAssignGroups(players, 4);
    const groups = result.map(p => p.group);

    expect(groups.every(g => ['A', 'B', 'C', 'D'].includes(g))).toBe(true);
    expect(groups.filter(g => g === 'A')).toHaveLength(2);
    expect(groups.filter(g => g === 'D')).toHaveLength(2);
  });

  it('should clamp groupCount=0 to minimum 2', () => {
    const players: SetupPlayer[] = Array.from({ length: 4 }, (_, i) => ({
      playerId: `p${i}`,
      group: 'A',
    }));

    const result = randomlyAssignGroups(players, 0);

    expect(result.every(p => ['A', 'B'].includes(p.group))).toBe(true);
  });

  it('should use default groupCount=3 when not specified', () => {
    const players: SetupPlayer[] = Array.from({ length: 6 }, (_, i) => ({
      playerId: `p${i}`,
      group: 'A',
    }));

    const result = randomlyAssignGroups(players);

    expect(result.every(p => ['A', 'B', 'C'].includes(p.group))).toBe(true);
  });
});

/**
 * Tests for recommendGroupCount.
 *
 * Per §4.1: "参加プレイヤーは参加人数に基づいて2〜4のグループに分かれ"
 * Aims for 5-8 players per group as a sweet spot for round-robin scheduling.
 */
describe('recommendGroupCount', () => {
  it('should recommend 2 groups for 8 players', () => {
    expect(recommendGroupCount(8)).toBe(2);
  });

  it('should recommend 2 groups for 15 players', () => {
    expect(recommendGroupCount(15)).toBe(2);
  });

  it('should recommend 3 groups for 16 players', () => {
    expect(recommendGroupCount(16)).toBe(3);
  });

  it('should recommend 3 groups for 23 players', () => {
    expect(recommendGroupCount(23)).toBe(3);
  });

  it('should recommend 4 groups for 24 players', () => {
    expect(recommendGroupCount(24)).toBe(4);
  });

  it('should recommend 4 groups for 45 players', () => {
    expect(recommendGroupCount(45)).toBe(4);
  });

  /* Edge cases */
  it('should return 2 for very small player counts (< 8)', () => {
    expect(recommendGroupCount(4)).toBe(2);
    expect(recommendGroupCount(1)).toBe(2);
  });

  it('should return 4 for very large player counts', () => {
    expect(recommendGroupCount(100)).toBe(4);
  });

  it('should return 2 for 0 players', () => {
    expect(recommendGroupCount(0)).toBe(2);
  });

  it('should handle negative input by returning 2', () => {
    expect(recommendGroupCount(-5)).toBe(2);
  });
});
