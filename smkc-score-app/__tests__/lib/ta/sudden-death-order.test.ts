import { orderResultsWithSuddenDeathChain } from '@/lib/ta/sudden-death-order';

describe('orderResultsWithSuddenDeathChain', () => {
  const base = [
    { playerId: 'a', timeMs: 100 },
    { playerId: 'b', timeMs: 100 },
    { playerId: 'c', timeMs: 120 },
    { playerId: 'd', timeMs: 130 },
  ];

  it('sorts by base time when no sudden-death rounds exist', () => {
    expect(orderResultsWithSuddenDeathChain(base, []).map((r) => r.playerId)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('resolves a tied pair by their sudden-death times', () => {
    const ordered = orderResultsWithSuddenDeathChain(base, [
      [
        { playerId: 'a', timeMs: 150 },
        { playerId: 'b', timeMs: 140 },
      ],
    ]);
    expect(ordered.map((r) => r.playerId)).toEqual(['b', 'a', 'c', 'd']);
  });

  it('lets the LATEST shared sudden-death round decide a pair (issue #2773 chain)', () => {
    // Round 1 decides a vs b (b wins), round 2 (a later bronze race) does not
    // involve b but reverses c vs a order. b's pair decision must stay.
    const ordered = orderResultsWithSuddenDeathChain(
      [
        { playerId: 'a', timeMs: 100 },
        { playerId: 'b', timeMs: 100 },
        { playerId: 'c', timeMs: 100 },
      ],
      [
        [
          { playerId: 'a', timeMs: 120 },
          { playerId: 'b', timeMs: 110 },
        ],
        [
          { playerId: 'a', timeMs: 130 },
          { playerId: 'c', timeMs: 125 },
        ],
      ],
    );
    expect(ordered.map((r) => r.playerId)).toEqual(['b', 'c', 'a']);
  });

  it('falls back to base time for pairs that never raced together', () => {
    const ordered = orderResultsWithSuddenDeathChain(
      [
        { playerId: 'a', timeMs: 100 },
        { playerId: 'b', timeMs: 110 },
        { playerId: 'c', timeMs: 100 },
      ],
      [
        [
          { playerId: 'a', timeMs: 200 },
          { playerId: 'b', timeMs: 190 },
        ],
      ],
    );
    // a/b decided by sudden death (b first); c has no race so base time 100
    // puts it ahead of b's 190 while keeping a's chain order intact.
    expect(ordered.map((r) => r.playerId)).toEqual(['c', 'b', 'a']);
  });

  it('does not reorder when sudden-death times are equal', () => {
    const ordered = orderResultsWithSuddenDeathChain(
      [
        { playerId: 'a', timeMs: 100 },
        { playerId: 'b', timeMs: 100 },
      ],
      [
        [
          { playerId: 'a', timeMs: 200 },
          { playerId: 'b', timeMs: 200 },
        ],
      ],
    );
    expect(ordered.map((r) => r.playerId)).toEqual(['a', 'b']);
  });

  it('handles an empty base array', () => {
    expect(orderResultsWithSuddenDeathChain([], [[{ playerId: 'a', timeMs: 1 }]])).toEqual([]);
  });

  it('keeps non-participants in base order relative to decided players', () => {
    const ordered = orderResultsWithSuddenDeathChain(
      [
        { playerId: 'x', timeMs: 90 },
        { playerId: 'a', timeMs: 100 },
        { playerId: 'b', timeMs: 100 },
      ],
      [
        [
          { playerId: 'a', timeMs: 150 },
          { playerId: 'b', timeMs: 140 },
        ],
      ],
    );
    expect(ordered.map((r) => r.playerId)).toEqual(['x', 'b', 'a']);
  });

  it('does not mutate the input arrays', () => {
    const baseCopy = [...base];
    const sd = [
      [
        { playerId: 'a', timeMs: 150 },
        { playerId: 'b', timeMs: 140 },
      ],
    ];
    orderResultsWithSuddenDeathChain(baseCopy, sd);
    expect(baseCopy).toEqual(base);
    expect(sd).toEqual([
      [
        { playerId: 'a', timeMs: 150 },
        { playerId: 'b', timeMs: 140 },
      ],
    ]);
  });
});
