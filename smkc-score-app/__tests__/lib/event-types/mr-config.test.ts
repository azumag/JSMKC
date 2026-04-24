/**
 * Tests for MR-specific configuration logic.
 *
 * Covers:
 * - calculateMatchResult: 0-0 is no_contest, 2-2 is tie, win/loss determination
 * - aggregatePlayerStats: 0-0 matches are skipped in standings
 */

import { mrConfig } from '@/lib/event-types/mr-config';

const { calculateMatchResult, aggregatePlayerStats } = mrConfig;

describe('calculateMatchResult', () => {
  // 0-0 is a cleared match — no_contest, not tie
  it('should return no_contest for 0-0', () => {
    const result = calculateMatchResult(0, 0);
    expect(result.winner).toBeNull();
    expect(result.result1).toBe('no_contest');
    expect(result.result2).toBe('no_contest');
  });

  // Regular ties
  it.each([
    [1, 1],
    [2, 2],
    [3, 3],
    [4, 4],
  ])('should return tie for equal scores (%i-%i)', (score1, score2) => {
    const result = calculateMatchResult(score1, score2);
    expect(result.winner).toBeNull();
    expect(result.result1).toBe('tie');
    expect(result.result2).toBe('tie');
  });

  // Player 1 wins
  it.each([
    [1, 0],
    [2, 1],
    [3, 2],
    [4, 3],
  ])('should return win for player1 when score1 > score2 (%i-%i)', (score1, score2) => {
    const result = calculateMatchResult(score1, score2);
    expect(result.winner).toBe(1);
    expect(result.result1).toBe('win');
    expect(result.result2).toBe('loss');
  });

  // Player 2 wins
  it.each([
    [0, 1],
    [1, 2],
    [2, 3],
    [3, 4],
  ])('should return win for player2 when score2 > score1 (%i-%i)', (score1, score2) => {
    const result = calculateMatchResult(score1, score2);
    expect(result.winner).toBe(2);
    expect(result.result1).toBe('loss');
    expect(result.result2).toBe('win');
  });
});

describe('aggregatePlayerStats', () => {
  const player1Id = 'p1';
  const player2Id = 'p2';

  function makeMatch(score1, score2) {
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

  // 0-0 matches should not be counted in mp
  it('should skip 0-0 matches (no_contest)', () => {
    const matches = [makeMatch(0, 0), makeMatch(2, 2), makeMatch(3, 1)];
    const result = aggregatePlayerStats(matches, player1Id, calculateMatchResult);
    // 0-0 is skipped; 2-2 is tie; 3-1 is win → mp=2, wins=1, ties=1
    expect(result.stats.mp).toBe(2);
    expect(result.stats.wins).toBe(1);
    expect(result.stats.ties).toBe(1);
    expect(result.stats.losses).toBe(0);
  });

  // Regular tie (2-2) is counted
  it('should count a 2-2 tie as a tie in standings', () => {
    const matches = [makeMatch(2, 2)];
    const result = aggregatePlayerStats(matches, player1Id, calculateMatchResult);
    expect(result.stats.mp).toBe(1);
    expect(result.stats.ties).toBe(1);
    expect(result.stats.wins).toBe(0);
    expect(result.stats.losses).toBe(0);
  });

  it('should count wins and losses correctly', () => {
    const matches = [makeMatch(3, 1), makeMatch(1, 3), makeMatch(2, 2)];
    const result = aggregatePlayerStats(matches, player1Id, calculateMatchResult);
    expect(result.stats.mp).toBe(3);
    expect(result.stats.wins).toBe(1);
    expect(result.stats.losses).toBe(1);
    expect(result.stats.ties).toBe(1);
    expect(result.stats.winRounds).toBe(3 + 1 + 2); // 6
    expect(result.stats.lossRounds).toBe(1 + 3 + 2); // 6
    expect(result.qualificationData.points).toBe(0); // tie on differential
    expect(result.score).toBe(3); // 1 win * 2 + 1 tie
  });

  it('should accumulate round differential correctly', () => {
    const matches = [makeMatch(4, 0), makeMatch(3, 1), makeMatch(0, 4)];
    const result = aggregatePlayerStats(matches, player1Id, calculateMatchResult);
    expect(result.stats.winRounds).toBe(4 + 3 + 0); // 7
    expect(result.stats.lossRounds).toBe(0 + 1 + 4); // 5
    expect(result.qualificationData.points).toBe(2); // 7 - 5
    expect(result.score).toBe(4); // 2 wins * 2 + 0 ties
  });
});
