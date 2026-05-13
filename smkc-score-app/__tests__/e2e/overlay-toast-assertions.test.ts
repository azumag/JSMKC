describe('overlay toast title assertions', () => {
  let hasKnownOverlayToastTitle: (text: string) => boolean;
  let titleCases: string[];
  let rejectedTitleCases: string[];

  beforeAll(async () => {
    const helper = await import('../../e2e/lib/overlay-toast-assertions.js') as {
      OVERLAY_TOAST_TITLE_CASES: string[];
      OVERLAY_TOAST_TITLE_REJECTIONS: string[];
      hasKnownOverlayToastTitle: (text: string) => boolean;
    };
    titleCases = helper.OVERLAY_TOAST_TITLE_CASES;
    rejectedTitleCases = helper.OVERLAY_TOAST_TITLE_REJECTIONS;
    hasKnownOverlayToastTitle = helper.hasKnownOverlayToastTitle;
  });

  it('accepts concrete overlay event title terms', () => {
    for (const title of titleCases) {
      expect(hasKnownOverlayToastTitle(title)).toBe(true);
    }
  });

  it('does not accept the generic Time word by itself', () => {
    for (const title of rejectedTitleCases) {
      expect(hasKnownOverlayToastTitle(title)).toBe(false);
    }
  });
});
