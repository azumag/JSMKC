import { isCompleteFinalsSeedSnapshot, parseFinalsSeedSnapshot } from '@/lib/finals-seed-snapshot';

const entry = (seed: number, originalSeed: number) => ({
  seed,
  originalSeed,
  playerId: `p${originalSeed}`,
  player: { id: `p${originalSeed}`, name: `P${originalSeed}` },
});

describe('persisted finals seed snapshot numeric validation', () => {
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

  it('keeps a valid positive safe-integer entry', () => {
    expect(parseFinalsSeedSnapshot([entry(3, 7)])).toEqual([entry(3, 7)]);
  });

  it('does not treat a snapshot with an invalid structural seed as authoritative', () => {
    const snapshot = Array.from({ length: 8 }, (_, index) => entry(index + 1, index + 1));
    snapshot[0] = entry(Number.NaN, 1);

    expect(isCompleteFinalsSeedSnapshot(snapshot)).toBe(false);
  });
});
