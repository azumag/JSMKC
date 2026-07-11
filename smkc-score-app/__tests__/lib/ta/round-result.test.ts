import { normalizeTaRoundResult, normalizeTaRoundResults } from '@/lib/ta/round-result';

describe('TA round result normalization', () => {
  it('normalizes the current result shape without mutating the input', () => {
    const input = {
      playerId: 'player-1',
      rawTimeMs: 103_000,
      handicapSeconds: -3,
      timeMs: 100_000,
      isRetry: false,
      tvNumber: 2,
    };
    const snapshot = structuredClone(input);

    expect(normalizeTaRoundResult(input)).toEqual(input);
    expect(input).toEqual(snapshot);
  });

  it('fills legacy fields and rejects invalid values safely', () => {
    expect(
      normalizeTaRoundResult({
        playerId: 'player-1',
        timeMs: 90_000,
        handicapSeconds: -2,
        tvNumber: 7,
      }),
    ).toEqual({
      playerId: 'player-1',
      rawTimeMs: 90_000,
      handicapSeconds: 0,
      timeMs: 90_000,
      isRetry: false,
      tvNumber: null,
    });

    expect(normalizeTaRoundResult({ playerId: 1, timeMs: 10 })).toBeNull();
    expect(normalizeTaRoundResult({ playerId: 'player-1', timeMs: -1 })).toBeNull();
    expect(normalizeTaRoundResult({ playerId: 'player-1', timeMs: Number.NaN })).toBeNull();
  });

  it('filters malformed entries from result arrays', () => {
    expect(
      normalizeTaRoundResults([
        { playerId: 'p1', timeMs: 1000 },
        { playerId: null, timeMs: 2000 },
        { playerId: 'p2', timeMs: 3000, isRetry: true },
      ]),
    ).toEqual([
      {
        playerId: 'p1',
        rawTimeMs: 1000,
        handicapSeconds: 0,
        timeMs: 1000,
        isRetry: false,
        tvNumber: null,
      },
      {
        playerId: 'p2',
        rawTimeMs: 3000,
        handicapSeconds: 0,
        timeMs: 3000,
        isRetry: true,
        tvNumber: null,
      },
    ]);
  });
});
