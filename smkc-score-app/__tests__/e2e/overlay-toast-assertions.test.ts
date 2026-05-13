describe('overlay toast title assertions', () => {
  let hasKnownOverlayToastTitle: (text: string) => boolean;

  beforeAll(async () => {
    const helper = await import('../../e2e/lib/overlay-toast-assertions.js') as {
      hasKnownOverlayToastTitle: (text: string) => boolean;
    };
    hasKnownOverlayToastTitle = helper.hasKnownOverlayToastTitle;
  });

  it('accepts concrete overlay event title terms', () => {
    const cases = [
      '総合順位を更新しました',
      '予選確定',
      '試合終了',
      'スコア申告',
      'タイム更新',
      'Overall Ranking Updated',
      'Qualification Locked',
      'Match Completed',
      'Time Attack Phase 1 Started',
      'Score Reported',
      'Qualification summary',
      'Ranking snapshot',
      'タイムトライアル予選を完走',
    ];

    for (const title of cases) {
      expect(hasKnownOverlayToastTitle(title)).toBe(true);
    }
  });

  it('does not accept the generic Time word by itself', () => {
    expect(hasKnownOverlayToastTitle('Server Time: 2026-05-01T00:00:00.000Z')).toBe(false);
    expect(hasKnownOverlayToastTitle('Time')).toBe(false);
  });
});
