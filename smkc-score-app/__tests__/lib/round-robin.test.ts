/**
 * Round-Robin Scheduling Tests (TDD - tests written first)
 *
 * Tests for the circle-method round-robin scheduling algorithm.
 * The circle method is the standard approach used in tournament scheduling
 * (also known as the polygon scheduling algorithm).
 *
 * Reference: requirements.md §10.4 サークル方式（ラウンドロビン方式）
 */

import {
  generateRoundRobinSchedule,
  getByeMatchData,
  BREAK_PLAYER_ID,
  RoundRobinSchedule,
} from '@/lib/round-robin';

describe('generateRoundRobinSchedule', () => {
  // ============================================================
  // Basic structure tests
  // ============================================================

  describe('even number of players', () => {
    it('generates correct schedule for 4 players: 3 days × 2 matches = 6 total', () => {
      const schedule = generateRoundRobinSchedule(['A', 'B', 'C', 'D']);

      expect(schedule.totalDays).toBe(3);
      expect(schedule.hasByes).toBe(false);
      expect(schedule.matches).toHaveLength(6);
      expect(schedule.matches.every((m) => !m.isBye)).toBe(true);
    });

    it('generates correct schedule for 6 players: 5 days × 3 matches = 15 total', () => {
      const schedule = generateRoundRobinSchedule(['A', 'B', 'C', 'D', 'E', 'F']);

      expect(schedule.totalDays).toBe(5);
      expect(schedule.hasByes).toBe(false);
      expect(schedule.matches).toHaveLength(15);
    });

    it('generates correct schedule for 2 players: 1 day, 1 match', () => {
      const schedule = generateRoundRobinSchedule(['A', 'B']);

      expect(schedule.totalDays).toBe(1);
      expect(schedule.hasByes).toBe(false);
      expect(schedule.matches).toHaveLength(1);
      expect(schedule.matches[0].day).toBe(1);
    });
  });

  describe('odd number of players (with BREAK/BYE)', () => {
    it('generates correct schedule for 5 players: 5 days, 10 real + 5 bye = 15 total', () => {
      const schedule = generateRoundRobinSchedule(['A', 'B', 'C', 'D', 'E']);

      expect(schedule.totalDays).toBe(5);
      expect(schedule.hasByes).toBe(true);

      const realMatches = schedule.matches.filter((m) => !m.isBye);
      const byeMatches = schedule.matches.filter((m) => m.isBye);

      // C(5,2) = 10 real pairings
      expect(realMatches).toHaveLength(10);
      // 5 days × 1 bye per day = 5 byes
      expect(byeMatches).toHaveLength(5);
      expect(schedule.matches).toHaveLength(15);
    });

    it('generates correct schedule for 3 players: 3 days, 3 real + 3 bye = 6 total', () => {
      const schedule = generateRoundRobinSchedule(['A', 'B', 'C']);

      expect(schedule.totalDays).toBe(3);
      expect(schedule.hasByes).toBe(true);

      const realMatches = schedule.matches.filter((m) => !m.isBye);
      const byeMatches = schedule.matches.filter((m) => m.isBye);

      expect(realMatches).toHaveLength(3);
      expect(byeMatches).toHaveLength(3);
    });

    it('BYE matches contain BREAK_PLAYER_ID', () => {
      const schedule = generateRoundRobinSchedule(['A', 'B', 'C']);
      const byeMatches = schedule.matches.filter((m) => m.isBye);

      for (const m of byeMatches) {
        const hasBreak =
          m.player1Id === BREAK_PLAYER_ID || m.player2Id === BREAK_PLAYER_ID;
        expect(hasBreak).toBe(true);
      }
    });
  });

  // ============================================================
  // Completeness: every real player pair appears exactly once
  // ============================================================

  describe('pairing completeness', () => {
    it('covers all C(N,2) unique pairings for 4 players', () => {
      const schedule = generateRoundRobinSchedule(['A', 'B', 'C', 'D']);
      const pairs = extractRealPairs(schedule);

      // C(4,2) = 6
      expect(pairs.size).toBe(6);
    });

    it('covers all C(N,2) unique pairings for 6 players', () => {
      const schedule = generateRoundRobinSchedule(['A', 'B', 'C', 'D', 'E', 'F']);
      const pairs = extractRealPairs(schedule);

      expect(pairs.size).toBe(15);
    });

    it('covers all C(N,2) unique pairings for 5 players (odd)', () => {
      const schedule = generateRoundRobinSchedule(['A', 'B', 'C', 'D', 'E']);
      const pairs = extractRealPairs(schedule);

      // C(5,2) = 10
      expect(pairs.size).toBe(10);
    });

    it('has no duplicate pairings', () => {
      const schedule = generateRoundRobinSchedule(['A', 'B', 'C', 'D', 'E', 'F']);
      const realMatches = schedule.matches.filter((m) => !m.isBye);
      const pairs = new Set<string>();

      for (const m of realMatches) {
        const key = [m.player1Id, m.player2Id].sort().join('-');
        expect(pairs.has(key)).toBe(false); // no duplicate
        pairs.add(key);
      }
    });
  });

  // ============================================================
  // Day constraint: each player plays exactly once per day
  // ============================================================

  describe('day scheduling constraint', () => {
    it('each player appears exactly once per day (4 players)', () => {
      const schedule = generateRoundRobinSchedule(['A', 'B', 'C', 'D']);
      assertOneMatchPerDay(schedule, ['A', 'B', 'C', 'D']);
    });

    it('each player appears exactly once per day (6 players)', () => {
      const players = ['A', 'B', 'C', 'D', 'E', 'F'];
      const schedule = generateRoundRobinSchedule(players);
      assertOneMatchPerDay(schedule, players);
    });

    it('each player appears exactly once per day (5 players, including BYE)', () => {
      const players = ['A', 'B', 'C', 'D', 'E'];
      const schedule = generateRoundRobinSchedule(players);
      // Include BREAK_PLAYER_ID since it occupies a slot
      assertOneMatchPerDay(schedule, [...players, BREAK_PLAYER_ID]);
    });
  });

  // ============================================================
  // 1P/2P side balance
  // ============================================================

  describe('1P/2P side balance', () => {
    it('each player has balanced 1P and 2P assignments (±1) for 6 players', () => {
      const players = ['A', 'B', 'C', 'D', 'E', 'F'];
      const schedule = generateRoundRobinSchedule(players);
      assertSideBalance(schedule, players);
    });

    it('each player has balanced 1P and 2P assignments (±1) for 4 players', () => {
      const players = ['A', 'B', 'C', 'D'];
      const schedule = generateRoundRobinSchedule(players);
      assertSideBalance(schedule, players);
    });

    it('each player has balanced 1P and 2P assignments (±1) for 5 players (odd)', () => {
      const players = ['A', 'B', 'C', 'D', 'E'];
      const schedule = generateRoundRobinSchedule(players);
      assertSideBalance(schedule, players);
    });

    it('each player has balanced 1P and 2P assignments (±1) for 10 players', () => {
      const players = Array.from({ length: 10 }, (_, i) => `P${i + 1}`);
      const schedule = generateRoundRobinSchedule(players);
      assertSideBalance(schedule, players);
    });
  });

  // ============================================================
  // Determinism
  // ============================================================

  describe('determinism', () => {
    it('produces identical output for the same input', () => {
      const players = ['A', 'B', 'C', 'D', 'E'];
      const s1 = generateRoundRobinSchedule(players);
      const s2 = generateRoundRobinSchedule(players);

      expect(s1).toEqual(s2);
    });
  });

  // ============================================================
  // Edge cases
  // ============================================================

  describe('edge cases', () => {
    it('returns empty schedule for 0 players', () => {
      const schedule = generateRoundRobinSchedule([]);

      expect(schedule.totalDays).toBe(0);
      expect(schedule.matches).toHaveLength(0);
      expect(schedule.hasByes).toBe(false);
    });

    it('returns empty schedule for 1 player', () => {
      const schedule = generateRoundRobinSchedule(['A']);

      expect(schedule.totalDays).toBe(0);
      expect(schedule.matches).toHaveLength(0);
      expect(schedule.hasByes).toBe(false);
    });

    it('handles large group (20 players) correctly', () => {
      const players = Array.from({ length: 20 }, (_, i) => `P${i + 1}`);
      const schedule = generateRoundRobinSchedule(players);

      expect(schedule.totalDays).toBe(19);
      // C(20,2) = 190
      expect(schedule.matches).toHaveLength(190);
      expect(schedule.hasByes).toBe(false);

      const pairs = extractRealPairs(schedule);
      expect(pairs.size).toBe(190);
    });

    it('day numbers are 1-based and sequential', () => {
      const schedule = generateRoundRobinSchedule(['A', 'B', 'C', 'D']);
      const days = [...new Set(schedule.matches.map((m) => m.day))].sort((a, b) => a - b);

      expect(days).toEqual([1, 2, 3]);
    });
  });
});

describe('getByeMatchData', () => {
  it('returns score1: 4, score2: 0 for BM (requirements.md §10.2: BM 4-0)', () => {
    const data = getByeMatchData('bm');
    expect(data).toEqual({ score1: 4, score2: 0 });
  });

  it('returns score1: 4, score2: 0 for MR (requirements.md §10.2: MR 4-0)', () => {
    const data = getByeMatchData('mr');
    expect(data).toEqual({ score1: 4, score2: 0 });
  });

  it('returns points1: 45, points2: 0 for GP (requirements.md §10.2: GP 45-0)', () => {
    const data = getByeMatchData('gp');
    expect(data).toEqual({ points1: 45, points2: 0 });
  });
});

// ============================================================
// Test Helpers
// ============================================================

/**
 * Extract all unique real (non-BYE) player pairings as "A-B" sorted keys.
 */
function extractRealPairs(schedule: RoundRobinSchedule): Set<string> {
  const pairs = new Set<string>();
  for (const m of schedule.matches) {
    if (!m.isBye) {
      pairs.add([m.player1Id, m.player2Id].sort().join('-'));
    }
  }
  return pairs;
}

/**
 * Assert that each player appears in exactly one match per day.
 */
function assertOneMatchPerDay(schedule: RoundRobinSchedule, players: string[]) {
  for (let day = 1; day <= schedule.totalDays; day++) {
    const dayMatches = schedule.matches.filter((m) => m.day === day);
    const playersInDay: string[] = [];

    for (const m of dayMatches) {
      playersInDay.push(m.player1Id, m.player2Id);
    }

    // Each player should appear exactly once
    for (const p of players) {
      const count = playersInDay.filter((id) => id === p).length;
      expect(count).toBe(1);
    }
  }
}

/**
 * Assert that each real player's 1P/2P assignment count differs by at most 1.
 */
function assertSideBalance(schedule: RoundRobinSchedule, players: string[]) {
  for (const p of players) {
    const playerMatches = schedule.matches.filter(
      (m) => !m.isBye && (m.player1Id === p || m.player2Id === p),
    );

    let as1P = 0;
    let as2P = 0;
    for (const m of playerMatches) {
      if (m.player1Id === p) as1P++;
      else as2P++;
    }

    expect(Math.abs(as1P - as2P)).toBeLessThanOrEqual(1);
  }
}
