describe('overlay toast title assertions', () => {
  let hasKnownOverlayToastTitle: (text: string) => boolean;

  beforeAll(async () => {
    const helper = await import('../../e2e/lib/overlay-toast-assertions.js') as {
      hasKnownOverlayToastTitle: (text: string) => boolean;
    };
    hasKnownOverlayToastTitle = helper.hasKnownOverlayToastTitle;
  });

  it('accepts concrete overlay event title terms', () => {
    expect(hasKnownOverlayToastTitle('Overall Ranking Updated')).toBe(true);
    expect(hasKnownOverlayToastTitle('Qualification Locked')).toBe(true);
    expect(hasKnownOverlayToastTitle('Time Attack Phase 1 Started')).toBe(true);
    expect(hasKnownOverlayToastTitle('タイムトライアル予選を完走')).toBe(true);
  });

  it('does not accept the generic Time word by itself', () => {
    expect(hasKnownOverlayToastTitle('Server Time: 2026-05-01T00:00:00.000Z')).toBe(false);
    expect(hasKnownOverlayToastTitle('Time')).toBe(false);
  });
});
