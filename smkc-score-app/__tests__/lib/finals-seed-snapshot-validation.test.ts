import { isCompleteFinalsSeedSnapshot, parseFinalsSeedSnapshot } from '@/lib/finals-seed-snapshot';

const entry = (seed: number, originalSeed: number) => ({
  seed,
  originalSeed,
  playerId: `p${originalSeed}`,
  player: { id: `p${originalSeed}`, name: `P${originalSeed}` },
});

describe('persisted finals seed snapshot validation', () => {
  it.each([
    ['zero', 0],
    ['negative', -1],
    ['fractional', 1.5],
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['unsafe integer', Number.MAX_SAFE_INTEGER + 1],
  ])('rejects an invalid structural seed: %s', (_label, invalidSeed) => {
    expect(parseFinalsSeedSnapshot([entry(invalidSeed, 1)])).toEqual([]);
  });

  it.each([
    ['zero', 0],
    ['negative', -1],
    ['fractional', 1.5],
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['unsafe integer', Number.MAX_SAFE_INTEGER + 1],
  ])('rejects an invalid original seed: %s', (_label, invalidOriginalSeed) => {
    expect(parseFinalsSeedSnapshot([entry(1, invalidOriginalSeed)])).toEqual([]);
  });

  it.each([
    ['empty playerId', { ...entry(1, 1), playerId: '' }],
    ['whitespace playerId', { ...entry(1, 1), playerId: '   ' }],
    ['empty embedded player id', { ...entry(1, 1), player: { id: '', name: 'P1' } }],
    ['whitespace embedded player id', { ...entry(1, 1), player: { id: '   ', name: 'P1' } }],
    ['mismatched player ids', { ...entry(1, 1), player: { id: 'other-player', name: 'P1' } }],
  ])('rejects invalid player identity: %s', (_label, invalidEntry) => {
    expect(parseFinalsSeedSnapshot([invalidEntry])).toEqual([]);
  });

  it('keeps a valid positive safe-integer entry with matching player identity', () => {
    expect(parseFinalsSeedSnapshot([entry(3, 7)])).toEqual([entry(3, 7)]);
  });

  it('does not treat a snapshot with an invalid structural seed as authoritative', () => {
    const snapshot = Array.from({ length: 8 }, (_, index) => entry(index + 1, index + 1));
    snapshot[0] = entry(Number.NaN, 1);

    expect(isCompleteFinalsSeedSnapshot(snapshot)).toBe(false);
  });

  it('does not treat a snapshot with an extra invalid entry as authoritative', () => {
    const snapshot = Array.from({ length: 8 }, (_, index) => entry(index + 1, index + 1));
    snapshot.push(entry(Number.NaN, 9));

    expect(parseFinalsSeedSnapshot(snapshot)).toHaveLength(8);
    expect(isCompleteFinalsSeedSnapshot(snapshot)).toBe(false);
  });

  it('allows Top-24 barrage routing to reuse a structural slot while preserving the original seed', () => {
    const snapshot = Array.from({ length: 24 }, (_, index) => entry(index + 1, index + 1));
    snapshot[16] = entry(16, 17);

    expect(isCompleteFinalsSeedSnapshot(snapshot)).toBe(true);
  });

  it('does not treat a snapshot with an out-of-range structural seed as authoritative', () => {
    const snapshot = Array.from({ length: 8 }, (_, index) => entry(index + 1, index + 1));
    snapshot[7] = entry(9, 8);

    expect(isCompleteFinalsSeedSnapshot(snapshot)).toBe(false);
  });

  it('does not treat a snapshot with duplicate player identities as authoritative', () => {
    const snapshot = Array.from({ length: 8 }, (_, index) => entry(index + 1, index + 1));
    snapshot[7] = { ...entry(8, 8), playerId: 'p1', player: { id: 'p1', name: 'Duplicate P1' } };

    expect(isCompleteFinalsSeedSnapshot(snapshot)).toBe(false);
  });

  it('does not treat a snapshot with duplicate original seeds as authoritative', () => {
    const snapshot = Array.from({ length: 8 }, (_, index) => entry(index + 1, index + 1));
    snapshot[7] = { ...entry(8, 7), playerId: 'p8', player: { id: 'p8', name: 'P8' } };

    expect(isCompleteFinalsSeedSnapshot(snapshot)).toBe(false);
  });

  it('does not treat a snapshot with mismatched player identity as authoritative', () => {
    const snapshot = Array.from({ length: 8 }, (_, index) => entry(index + 1, index + 1));
    snapshot[0] = { ...snapshot[0], player: { id: 'other-player', name: 'P1' } };

    expect(isCompleteFinalsSeedSnapshot(snapshot)).toBe(false);
  });
});
