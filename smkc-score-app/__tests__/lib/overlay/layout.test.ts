import {
  DEFAULT_OVERLAY_BROADCAST_LAYOUT,
  isOverlayBroadcastLayoutInput,
  normalizeOverlayBroadcastLayout,
} from '@/lib/overlay/layout';

describe('overlay broadcast layout', () => {
  it('fills missing coordinate slots with defaults', () => {
    expect(normalizeOverlayBroadcastLayout({
      player1Name: { x: 120, y: 500 },
      footer: { x: 180 },
    })).toEqual({
      ...DEFAULT_OVERLAY_BROADCAST_LAYOUT,
      player1Name: { x: 120, y: 500 },
      footer: { x: 180, y: DEFAULT_OVERLAY_BROADCAST_LAYOUT.footer.y },
    });
  });

  it('accepts only supported slots with finite numeric x/y values', () => {
    expect(isOverlayBroadcastLayoutInput({
      player1Score: { x: 150, y: 540 },
      player2Score: { x: 150 },
    })).toBe(true);
    expect(isOverlayBroadcastLayoutInput({
      player1Name: { x: 0, y: 0 },
      player2Name: { x: 1920, y: 1080 },
    })).toBe(true);

    expect(isOverlayBroadcastLayoutInput({
      player3Name: { x: 1, y: 2 },
    })).toBe(false);
    expect(isOverlayBroadcastLayoutInput({
      footer: { x: Number.NaN, y: 990 },
    })).toBe(false);
    expect(isOverlayBroadcastLayoutInput({
      footer: { x: 1921, y: 990 },
    })).toBe(false);
    expect(isOverlayBroadcastLayoutInput({
      footer: { x: 180, y: -1 },
    })).toBe(false);
    expect(isOverlayBroadcastLayoutInput({
      player1Name: { x: -1, y: 0 },
    })).toBe(false);
    expect(isOverlayBroadcastLayoutInput({
      player1Name: { x: 0, y: 1081 },
    })).toBe(false);
  });

  // TC-2583: normalizeOverlayBroadcastLayout falls back to all defaults for non-object input
  it('TC-2583: returns full defaults when input is not an object', () => {
    expect(normalizeOverlayBroadcastLayout(null)).toEqual(DEFAULT_OVERLAY_BROADCAST_LAYOUT);
    expect(normalizeOverlayBroadcastLayout(undefined)).toEqual(DEFAULT_OVERLAY_BROADCAST_LAYOUT);
    expect(normalizeOverlayBroadcastLayout('string')).toEqual(DEFAULT_OVERLAY_BROADCAST_LAYOUT);
    expect(normalizeOverlayBroadcastLayout(42)).toEqual(DEFAULT_OVERLAY_BROADCAST_LAYOUT);
    expect(normalizeOverlayBroadcastLayout([])).toEqual(DEFAULT_OVERLAY_BROADCAST_LAYOUT);
  });

  // TC-2584: normalizeOverlayBroadcastLayout falls back to slot defaults when position value is not an object
  it('TC-2584: falls back to slot default when a position value is not an object', () => {
    expect(normalizeOverlayBroadcastLayout({
      player1Name: null,
      player2Name: 'bad',
      player1Score: 999,
    })).toEqual(DEFAULT_OVERLAY_BROADCAST_LAYOUT);
  });

  // TC-2585: normalizeOverlayBroadcastLayout falls back per-coordinate for non-finite values
  it('TC-2585: falls back per-coordinate when x or y is NaN or Infinity', () => {
    const result = normalizeOverlayBroadcastLayout({
      player1Name: { x: Number.NaN, y: Number.POSITIVE_INFINITY },
      footer: { x: 180, y: Number.NaN },
    });
    expect(result.player1Name).toEqual(DEFAULT_OVERLAY_BROADCAST_LAYOUT.player1Name);
    expect(result.footer).toEqual({
      x: 180,
      y: DEFAULT_OVERLAY_BROADCAST_LAYOUT.footer.y,
    });
  });

  // TC-2586: isOverlayBroadcastLayoutInput — non-object returns false; empty object returns true
  it('TC-2586: isOverlayBroadcastLayoutInput rejects non-objects and accepts empty object', () => {
    expect(isOverlayBroadcastLayoutInput(null)).toBe(false);
    expect(isOverlayBroadcastLayoutInput(undefined)).toBe(false);
    expect(isOverlayBroadcastLayoutInput('string')).toBe(false);
    expect(isOverlayBroadcastLayoutInput(42)).toBe(false);
    // empty object is valid — no slots to violate
    expect(isOverlayBroadcastLayoutInput({})).toBe(true);
    // position value that is not an object (required to be record) → false
    expect(isOverlayBroadcastLayoutInput({ player1Name: 'bad' })).toBe(false);
  });
});
