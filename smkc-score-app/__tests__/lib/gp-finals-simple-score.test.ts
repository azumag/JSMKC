import { isValidGpFinalsSimpleScore } from '@/lib/gp-finals-simple-score';

describe('isValidGpFinalsSimpleScore', () => {
  it.each([
    [2, 0, 2],
    [2, 1, 2],
    [0, 2, 2],
    [3, 2, 3],
    [1, 2, 2],
    [2, 3, 3],
  ])('accepts exactly one side reaching targetWins (%s-%s FT%s)', (score1, score2, targetWins) => {
    expect(isValidGpFinalsSimpleScore(score1, score2, targetWins)).toBe(true);
  });

  it.each([
    [null, 0, 2],
    [0, null, 2],
    [1, 0, 2],
    [2, 2, 2],
    [3, 0, 2],
    [0, 3, 2],
  ])('rejects incomplete, tied, and above-target scores (%s-%s FT%s)', (score1, score2, targetWins) => {
    expect(isValidGpFinalsSimpleScore(score1, score2, targetWins)).toBe(false);
  });
});
