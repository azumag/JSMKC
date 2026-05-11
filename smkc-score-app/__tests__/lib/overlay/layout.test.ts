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
      player3Name: { x: 1, y: 2 },
    })).toBe(false);
    expect(isOverlayBroadcastLayoutInput({
      footer: { x: Number.NaN, y: 990 },
    })).toBe(false);
  });
});
