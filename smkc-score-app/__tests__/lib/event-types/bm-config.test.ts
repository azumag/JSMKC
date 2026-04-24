/**
 * Tests for BM-specific configuration logic.
 *
 * Covers:
 * - calculateMatchResult: 0-0 is no_contest, invalid sums, 3-1/2-2 outcomes
 * - aggregatePlayerStats: 0-0 matches skipped, scoring formula (2*wins + ties)
 * - parsePutBody: required field validation, score-rule validation
 */

import { bmConfig } from '@/lib/event-types/bm-config';

const { calculateMatchResult, aggregatePlayerStats, parsePutBody } = bmConfig;

describe('calculateMatchResult', () => {
  // 0-0 is a cleared/voided match — no_contest, not tie
  it('returns no_contest for 0-0 (cleared match)', () => {
    const result = calculateMatchResult(0, 0);
    expect(result.winner).toBeNull();
    expect(result.result1).toBe('no_contest');
    expect(result.result2).toBe('no_contest');
  });

  // Sum !== 4 is also invalid (should not occur if validation works, but guard is present)
  it.each([
    [1, 0],
    [2, 1],
    [5, 0],
    [3, 0],
  ])('returns no_contest for invalid total rounds (%i-%i, sum≠4)', (s1, s2) => {
    const result = calculateMatchResult(s1, s2);
    expect(result.winner).toBeNull();
    expect(result.result1).toBe('no_contest');
    expect(result.result2).toBe('no_contest');
  });

  // §4.1: player 1 wins when score1 >= 3 and total = 4
  it('returns player 1 win for 3-1', () => {
    const result = calculateMatchResult(3, 1);
    expect(result.winner).toBe(1);
    expect(result.result1).toBe('win');
    expect(result.result2).toBe('loss');
  });

  it('returns player 1 win for 4-0', () => {
    const result = calculateMatchResult(4, 0);
    expect(result.winner).toBe(1);
    expect(result.result1).toBe('win');
    expect(result.result2).toBe('loss');
  });

  // §4.1: player 2 wins when score2 >= 3 and total = 4
  it('returns player 2 win for 1-3', () => {
    const result = calculateMatchResult(1, 3);
    expect(result.winner).toBe(2);
    expect(result.result1).toBe('loss');
    expect(result.result2).toBe('win');
  });

  it('returns player 2 win for 0-4', () => {
    const result = calculateMatchResult(0, 4);
    expect(result.winner).toBe(2);
    expect(result.result1).toBe('loss');
    expect(result.result2).toBe('win');
  });

  // §4.1: 2-2 is a valid draw (tie)
  it('returns tie for 2-2', () => {
    const result = calculateMatchResult(2, 2);
    expect(result.winner).toBeNull();
    expect(result.result1).toBe('tie');
    expect(result.result2).toBe('tie');
  });
});

describe('aggregatePlayerStats', () => {
  const player1Id = 'p1';
  const player2Id = 'p2';

  function makeMatch(score1: number, score2: number) {
    return {
      id: 'm1',
      tournamentId: 't1',
      stage: 'qualification',
      completed: true,
      player1Id,
      player2Id,
      score1,
      score2,
    };
  }

  // 0-0 matches must be skipped (admin-cleared)
  it('skips 0-0 matches (no_contest)', () => {
    const matches = [makeMatch(0, 0), makeMatch(2, 2), makeMatch(3, 1)];
    const result = aggregatePlayerStats(matches, player1Id, calculateMatchResult);
    // 0-0 skipped; 2-2 → tie; 3-1 → win
    expect(result.stats.mp).toBe(2);
    expect(result.stats.wins).toBe(1);
    expect(result.stats.ties).toBe(1);
    expect(result.stats.losses).toBe(0);
  });

  // Scoring formula: 2*wins + ties
  it('computes score as 2*wins + ties', () => {
    const matches = [makeMatch(3, 1), makeMatch(1, 3), makeMatch(2, 2)];
    const result = aggregatePlayerStats(matches, player1Id, calculateMatchResult);
    expect(result.score).toBe(3); // 1 win * 2 + 1 tie
  });

  // Round differential is the tiebreaker (points field in qualificationData)
  it('computes round differential correctly', () => {
    const matches = [makeMatch(4, 0), makeMatch(3, 1), makeMatch(0, 4)];
    const result = aggregatePlayerStats(matches, player1Id, calculateMatchResult);
    expect(result.stats.winRounds).toBe(7); // 4+3+0
    expect(result.stats.lossRounds).toBe(5); // 0+1+4
    expect(result.qualificationData.points).toBe(2); // 7 - 5
    expect(result.score).toBe(4); // 2 wins * 2 + 0 ties
  });

  // Player 2 perspective: stats are correctly flipped
  it('accumulates stats correctly for player2 perspective', () => {
    const matches = [makeMatch(3, 1)]; // player1 wins, player2 loses
    const result = aggregatePlayerStats(matches, player2Id, calculateMatchResult);
    expect(result.stats.wins).toBe(0);
    expect(result.stats.losses).toBe(1);
    expect(result.stats.winRounds).toBe(1); // player2 won 1 round
    expect(result.stats.lossRounds).toBe(3); // player2 lost 3 rounds
  });

  // All cleared matches → mp stays 0
  it('returns zero mp when all matches are 0-0', () => {
    const matches = [makeMatch(0, 0), makeMatch(0, 0)];
    const result = aggregatePlayerStats(matches, player1Id, calculateMatchResult);
    expect(result.stats.mp).toBe(0);
    expect(result.score).toBe(0);
  });
});

describe('parsePutBody', () => {
  it('returns valid result for correct BM scores', () => {
    const result = parsePutBody({ matchId: 'abc', score1: 3, score2: 1 });
    expect(result.valid).toBe(true);
    expect(result.data).toMatchObject({ matchId: 'abc', score1: 3, score2: 1 });
  });

  it('passes rounds through when provided', () => {
    const rounds = [{ course: 1, winner: 1 }];
    const result = parsePutBody({ matchId: 'abc', score1: 2, score2: 2, rounds });
    expect(result.valid).toBe(true);
    expect(result.data?.rounds).toEqual(rounds);
  });

  it('rejects missing matchId', () => {
    const result = parsePutBody({ score1: 3, score2: 1 });
    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('rejects missing score1', () => {
    const result = parsePutBody({ matchId: 'abc', score2: 1 });
    expect(result.valid).toBe(false);
  });

  it('rejects missing score2', () => {
    const result = parsePutBody({ matchId: 'abc', score1: 3 });
    expect(result.valid).toBe(false);
  });

  // §4.1: BM scores must be non-negative integers summing to 4 (or 0-0)
  it('rejects invalid BM score (sum ≠ 4 and not 0-0)', () => {
    const result = parsePutBody({ matchId: 'abc', score1: 5, score2: 0 });
    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('rejects negative scores', () => {
    const result = parsePutBody({ matchId: 'abc', score1: -1, score2: 5 });
    expect(result.valid).toBe(false);
  });

  it('accepts 0-0 (admin-cleared match)', () => {
    const result = parsePutBody({ matchId: 'abc', score1: 0, score2: 0 });
    expect(result.valid).toBe(true);
  });
});
