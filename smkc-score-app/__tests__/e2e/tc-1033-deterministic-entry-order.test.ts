import { orderTaEntriesForDeterministicResultSlots } from '../../e2e/lib/deterministic-order';

describe('TC-1033 deterministic TA entry ordering', () => {
  it('sorts entries by playerId with numeric locale options before assigning result slots', () => {
    const entries = [
      { playerId: 'player-10', entryId: 'entry-10' },
      { playerId: 'player-2', entryId: 'entry-2' },
      { playerId: 'player-1', entryId: 'entry-1' },
    ];

    const ordered = orderTaEntriesForDeterministicResultSlots(entries);

    expect(ordered.map((entry) => entry.playerId)).toEqual(['player-1', 'player-2', 'player-10']);
    expect(entries.map((entry) => entry.playerId)).toEqual(['player-10', 'player-2', 'player-1']);
  });

  it('keeps TC-1033 grouped after boundary sudden-death coverage in the TA suite', async () => {
    const taSuite = await import('../../e2e/tc-ta.js') as {
      getSuite: () => { tests: Array<{ name: string }> };
    };

    const names = taSuite.getSuite().tests.map((test) => test.name);
    const tc815Index = names.indexOf('TC-815');
    const tc1033Index = names.indexOf('TC-1033');
    const tc817Index = names.indexOf('TC-817');

    expect(tc815Index).toBeGreaterThanOrEqual(0);
    expect(tc1033Index).toBeGreaterThan(tc815Index);
    expect(tc817Index).toBeGreaterThanOrEqual(0);
    expect(tc1033Index).toBeLessThan(tc817Index);
  });
});
