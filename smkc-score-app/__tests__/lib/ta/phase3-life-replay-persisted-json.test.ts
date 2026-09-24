import { getTaPhase3Rules } from '@/lib/ta/battle-royale';
import { replayPhase3Lives } from '@/lib/ta/phase3-life-replay';

describe('Phase 3 persisted sudden-death replay normalization', () => {
  const standardRules = getTaPhase3Rules(false);

  it('filters malformed persisted sudden-death result entries before resolving a boundary tie', () => {
    const rounds = [
      {
        roundNumber: 1,
        results: [
          { playerId: 'a', timeMs: 50_000 },
          { playerId: 'b', timeMs: 60_000 },
          { playerId: 'c', timeMs: 60_000 },
          { playerId: 'd', timeMs: 90_000 },
        ],
        eliminatedIds: [],
        livesReset: false,
        suddenDeathRounds: [
          {
            sequence: 1,
            resolved: true,
            results: [
              { playerId: 'c', timeMs: 10_000 },
              { playerId: ' padded', timeMs: 12_000 },
              { playerId: 'b', timeMs: 15_000 },
              { playerId: 'nan', timeMs: Number.NaN },
            ] as unknown,
          },
        ],
      },
    ];

    const { roundLivesByPlayer, lifeLostByPlayer } = replayPhase3Lives(rounds, ['a', 'b', 'c', 'd'], standardRules);

    expect(roundLivesByPlayer.get(1)?.get('c')).toBe(3);
    expect(roundLivesByPlayer.get(1)?.get('b')).toBe(2);
    expect(lifeLostByPlayer.get(1)?.has('c')).toBe(false);
    expect(lifeLostByPlayer.get(1)?.has('b')).toBe(true);
  });

  it('ignores a resolved sudden-death row whose persisted results are not an array', () => {
    const rounds = [
      {
        roundNumber: 1,
        results: [
          { playerId: 'a', timeMs: 50_000 },
          { playerId: 'b', timeMs: 60_000 },
          { playerId: 'c', timeMs: 60_000 },
          { playerId: 'd', timeMs: 90_000 },
        ],
        eliminatedIds: [],
        livesReset: false,
        suddenDeathRounds: [
          {
            sequence: 1,
            resolved: true,
            results: { playerId: 'c', timeMs: 10_000 } as unknown,
          },
        ],
      },
    ];

    const { lifeLostByPlayer } = replayPhase3Lives(rounds, ['a', 'b', 'c', 'd'], standardRules);

    expect(lifeLostByPlayer.get(1)?.has('b')).toBe(false);
    expect(lifeLostByPlayer.get(1)?.has('c')).toBe(true);
  });
});
