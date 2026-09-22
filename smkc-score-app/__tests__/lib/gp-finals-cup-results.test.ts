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

  it('rejects an explicit cup outside the supported GP cup domain', () => {
    expect(
      normalizeGpFinalsCupResults([
        {
          cup: 'Unknown',
          points1: 45,
          points2: 36,
        },
      ]),
    ).toEqual({ error: 'cupResults[0].cup must be a valid cup' });
  });

  it('rejects a whitespace-only explicit cup instead of treating it as a label', () => {
    expect(
      normalizeGpFinalsCupResults([
        {
          cup: '   ',
          points1: 45,
          points2: 36,
        },
      ]),
    ).toEqual({ error: 'cupResults[0].cup must be a valid cup' });
  });

  it('rejects unsafe explicit points instead of falling back to otherwise valid races', () => {
    expect(
      normalizeGpFinalsCupResults([
        {
          cup: 'Flower',
          points1: Number.MAX_SAFE_INTEGER + 1,
          points2: 0,
          races: [{ position1: 1, position2: 2 }],
        },
      ]),
    ).toEqual({ error: 'cupResults[0] requires non-negative integer points' });
  });

  it('rejects unsafe per-race points instead of falling back to a valid position', () => {
    expect(
      normalizeGpFinalsCupResults([
        {
          races: [
            {
              points1: Number.MAX_SAFE_INTEGER + 1,
              points2: 0,
              position1: 1,
              position2: 2,
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

  it.each([-1, 9, 1.5, Number.MAX_SAFE_INTEGER + 1])('rejects invalid derived race position %s', (position1) => {
    expect(
      normalizeGpFinalsCupResults([
        {
          races: [{ position1, position2: 1 }],
        },
      ]),
    ).toEqual({ error: 'cupResults[0] requires non-negative integer points' });
  });

  it('preserves legal legacy game-over and eighth-place positions', () => {
    expect(
      normalizeGpFinalsCupResults([
        {
          races: [{ position1: 0, position2: 8 }],
        },
      ]),
    ).toEqual({
      results: [
        {
          cup: 'Mushroom',
          points1: 0,
          points2: 0,
          winner: null,
          races: [{ position1: 0, position2: 8 }],
        },
      ],
    });
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
