import { replayPhase3Lives } from '@/lib/ta/phase3-life-replay';

function replayWithLifeLoss(lifeLoss: number | null | undefined) {
  return replayPhase3Lives(
    [
      {
        roundNumber: 1,
        results: [
          { playerId: 'fast', timeMs: 1000 },
          { playerId: 'slow', timeMs: 2000 },
        ],
        lifeLoss,
      },
    ],
    ['fast', 'slow'],
    { initialLives: 5 },
  );
}

describe('Phase 3 life replay malformed lifeLoss handling', () => {
  it.each([
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['zero', 0],
    ['negative', -1],
    ['fractional', 1.5],
    ['above maximum', 10],
  ])('falls back to one life for malformed %s values', (_label, lifeLoss) => {
    const replay = replayWithLifeLoss(lifeLoss);

    expect(replay.livesByPlayer.get('fast')).toBe(5);
    expect(replay.livesByPlayer.get('slow')).toBe(4);
  });

  it('keeps a valid configured life loss', () => {
    const replay = replayWithLifeLoss(2);

    expect(replay.livesByPlayer.get('fast')).toBe(5);
    expect(replay.livesByPlayer.get('slow')).toBe(3);
  });
});
