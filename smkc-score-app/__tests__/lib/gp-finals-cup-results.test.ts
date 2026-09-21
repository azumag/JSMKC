import { normalizeGpFinalsCupResults } from '@/lib/gp-finals-cup-results';

describe('normalizeGpFinalsCupResults', () => {
  it('preserves valid explicit cup points and winner resolution', () => {
    expect(
      normalizeGpFinalsCupResults([
        {
          cup: 'Mushroom',
          points1: 45,
          points2: 36,
        },
      ]),
    ).toEqual({
      results: [
        {
          cup: 'Mushroom',
          points1: 45,
          points2: 36,
          winner: 1,
        },
      ],
    });
  });

  it('rejects unsafe explicit points instead of persisting a precision-lost integer', () => {
    expect(
      normalizeGpFinalsCupResults([
        {
          cup: 'Flower',
          points1: Number.MAX_SAFE_INTEGER + 1,
          points2: 0,
        },
      ]),
    ).toEqual({ error: 'cupResults[0] requires non-negative integer points' });
  });

  it('rejects unsafe per-race points when no valid position fallback exists', () => {
    expect(
      normalizeGpFinalsCupResults([
        {
          races: [
            {
              points1: Number.MAX_SAFE_INTEGER + 1,
              points2: 0,
            },
          ],
        },
      ]),
    ).toEqual({ error: 'cupResults[0] requires non-negative integer points' });
  });

  it('rejects a race-points sum that exceeds the safe integer range', () => {
    expect(
      normalizeGpFinalsCupResults([
        {
          races: [
            { points1: Number.MAX_SAFE_INTEGER, points2: 0 },
            { points1: 1, points2: 0 },
          ],
        },
      ]),
    ).toEqual({ error: 'cupResults[0] requires non-negative integer points' });
  });

  it('keeps deriving points from race positions when explicit points are absent', () => {
    expect(
      normalizeGpFinalsCupResults([
        {
          races: [
            { position1: 1, position2: 2 },
            { position1: 3, position2: 4 },
          ],
        },
      ]),
    ).toEqual({
      results: [
        {
          cup: 'Mushroom',
          points1: 12,
          points2: 7,
          winner: 1,
          races: [
            { position1: 1, position2: 2 },
            { position1: 3, position2: 4 },
          ],
        },
      ],
    });
  });
});
