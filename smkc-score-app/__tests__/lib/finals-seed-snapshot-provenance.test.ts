import { isCompleteFinalsSeedSnapshot, parseFinalsSeedSnapshot } from '@/lib/finals-seed-snapshot';

const completeSnapshot = () =>
  Array.from({ length: 8 }, (_, index) => ({
    seed: index + 1,
    originalSeed: index + 1,
    playerId: `p${index + 1}`,
    player: {
      id: `p${index + 1}`,
      name: `Player ${index + 1}`,
      nickname: null,
      country: null,
      noCamera: false,
    },
  }));

describe('finals seed snapshot parse provenance', () => {
  it('keeps a valid parsed snapshot authoritative', () => {
    const parsed = parseFinalsSeedSnapshot(completeSnapshot());

    expect(parsed).toHaveLength(8);
    expect(isCompleteFinalsSeedSnapshot(parsed)).toBe(true);
  });

  it('does not let sanitization hide a malformed persisted extra entry', () => {
    const raw = [
      ...completeSnapshot(),
      {
        seed: Number.NaN,
        originalSeed: 9,
        playerId: 'p9',
        player: { id: 'p9', name: 'Malformed extra' },
      },
    ];

    const parsed = parseFinalsSeedSnapshot(raw);

    expect(parsed).toHaveLength(8);
    expect(parsed.map((entry) => entry.playerId)).toEqual(completeSnapshot().map((entry) => entry.playerId));
    expect(JSON.parse(JSON.stringify(parsed))).toHaveLength(8);
    expect(isCompleteFinalsSeedSnapshot(parsed)).toBe(false);
    expect(isCompleteFinalsSeedSnapshot(raw)).toBe(false);
  });
});
