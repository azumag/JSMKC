import { isCanonicalTaPlayerId } from '@/lib/ta/player-id';

describe('TA canonical player ID validation', () => {
  it.each(['player-1', 'legacy-player', '0'])('accepts canonical non-empty ID %p', (value) => {
    expect(isCanonicalTaPlayerId(value)).toBe(true);
  });

  it.each([null, undefined, 1, '', '   ', ' player-1', 'player-1 ', '\nplayer-1'])(
    'rejects malformed ID %p',
    (value) => {
      expect(isCanonicalTaPlayerId(value)).toBe(false);
    },
  );
});
