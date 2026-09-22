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

  it.each([
    [-1, 2, 2],
    [2, -1, 2],
    [1.5, 2, 2],
    [2, 1.5, 2],
    [Number.NaN, 2, 2],
    [2, Number.POSITIVE_INFINITY, 2],
    [Number.MAX_SAFE_INTEGER + 1, 2, 2],
  ])('rejects malformed player scores (%s-%s FT%s)', (score1, score2, targetWins) => {
    expect(isValidGpFinalsSimpleScore(score1, score2, targetWins)).toBe(false);
  });

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])(
    'rejects malformed targetWins %s',
    (targetWins) => {
      expect(isValidGpFinalsSimpleScore(2, 0, targetWins)).toBe(false);
    },
  );
});
