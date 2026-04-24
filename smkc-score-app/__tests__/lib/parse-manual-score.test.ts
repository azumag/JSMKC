/**
 * @module __tests__/lib/parse-manual-score.test.ts
 * @description Strict-parse guard for the admin manual-score override form.
 *
 * Regression: using `Number.parseInt` on the raw input string silently
 * truncates values like `"12.5"` or `"1e2"` to `12` and `1`. Those coerced
 * integers passed the downstream `Number.isInteger`/non-negative checks and
 * could commit a different score than the admin typed, changing
 * winner/tiebreak outcomes for finals matches. See PR #589 review.
 */
import { parseManualScore } from '@/lib/parse-manual-score';

describe('parseManualScore', () => {
  describe('accepts valid non-negative integers', () => {
    test.each([
      ['0', 0],
      ['1', 1],
      ['5', 5],
      ['12', 12],
      ['100', 100],
      ['  7  ', 7], // tolerates surrounding whitespace
    ])('parses %j as %d', (input, expected) => {
      expect(parseManualScore(input)).toBe(expected);
    });
  });

  describe('rejects silently-truncated numeric notation', () => {
    // These are exactly the regressions called out in the PR review: each one
    // parses to a clean integer under parseInt but would misrepresent the
    // operator's intent.
    test.each([
      ['12.5'], // parseInt → 12
      ['5.9'],  // parseInt → 5
      ['0.1'],  // parseInt → 0
      ['1e2'],  // parseInt → 1
      ['1E2'],  // parseInt → 1
    ])('rejects %j', (input) => {
      expect(parseManualScore(input)).toBeNull();
    });
  });

  describe('rejects non-numeric and signed input', () => {
    test.each([
      [''],
      ['   '],
      ['abc'],
      ['-1'],
      ['+1'],
      ['1.0'],
      ['1 2'],
      ['0x10'],
      ['NaN'],
      ['Infinity'],
    ])('rejects %j', (input) => {
      expect(parseManualScore(input)).toBeNull();
    });
  });

  test('rejects values beyond the safe-integer range', () => {
    // 2^53 would silently lose precision once stored as a JS number.
    const unsafe = String(Number.MAX_SAFE_INTEGER) + '0';
    expect(parseManualScore(unsafe)).toBeNull();
  });
});
