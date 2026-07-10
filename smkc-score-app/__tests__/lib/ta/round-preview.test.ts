import { RETRY_PENALTY_MS } from '@/lib/constants';
import { buildTaRoundPreview } from '@/lib/ta/round-preview';

const entries = [
  { playerId: 'p1', playerName: 'P1', taHandicapSeconds: 0 },
  { playerId: 'p2', playerName: 'P2', taHandicapSeconds: -1 },
  { playerId: 'p3', playerName: 'P3', taHandicapSeconds: -3 },
  { playerId: 'p4', playerName: 'P4', taHandicapSeconds: -5 },
] as const;

describe('TA round preview', () => {
  it('sorts battle royale results by adjusted time and marks the bottom half', () => {
    const preview = buildTaRoundPreview(
      entries,
      { p1: 100_000, p2: 100_500, p3: 102_000, p4: 104_000 },
      {},
      'battle_royale',
    );

    expect(preview.map((row) => [row.playerId, row.adjustedTimeMs])).toEqual([
      ['p3', 99_000],
      ['p4', 99_000],
      ['p2', 99_500],
      ['p1', 100_000],
    ]);
    expect(preview.map((row) => row.projectedLifeLoss)).toEqual([false, false, true, true]);
  });

  it('does not apply configured handicaps in standard mode', () => {
    const preview = buildTaRoundPreview(entries, { p1: 100, p2: 200, p3: 300, p4: 400 }, {}, 'standard');
    expect(preview.map((row) => row.handicapSeconds)).toEqual([0, 0, 0, 0]);
    expect(preview.map((row) => row.adjustedTimeMs)).toEqual([100, 200, 300, 400]);
  });

  it('uses the fixed retry penalty and no handicap', () => {
    const preview = buildTaRoundPreview([entries[3]], { p4: 1 }, { p4: true }, 'battle_royale');
    expect(preview[0]).toMatchObject({
      rawTimeMs: RETRY_PENALTY_MS,
      adjustedTimeMs: RETRY_PENALTY_MS,
      handicapSeconds: 0,
      isRetry: true,
    });
  });

  it('clamps negative adjusted time and reports a life-loss boundary tie', () => {
    const preview = buildTaRoundPreview(
      [
        { playerId: 'p1', playerName: 'P1', taHandicapSeconds: -5 },
        { playerId: 'p2', playerName: 'P2', taHandicapSeconds: 0 },
        { playerId: 'p3', playerName: 'P3', taHandicapSeconds: 0 },
        { playerId: 'p4', playerName: 'P4', taHandicapSeconds: 0 },
      ],
      { p1: 1000, p2: 2000, p3: 2000, p4: 3000 },
      {},
      'battle_royale',
    );
    expect(preview[0].adjustedTimeMs).toBe(0);
    expect(preview.filter((row) => row.boundaryTie).map((row) => row.playerId)).toEqual(['p2', 'p3']);
  });

  it('rejects duplicate players and invalid/missing times', () => {
    expect(() => buildTaRoundPreview([entries[0], entries[0]], { p1: 1 }, {}, 'battle_royale')).toThrow(
      'Duplicate player IDs',
    );
    expect(() => buildTaRoundPreview([entries[0]], {}, {}, 'battle_royale')).toThrow('Invalid time');
  });
});
