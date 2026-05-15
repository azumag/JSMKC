// This helper is a CommonJS module used by the runtime E2E scripts, so the
// Jest contract test loads it synchronously instead of adding an async setup
// hook that would hide simple module-load failures behind a Promise boundary.
// eslint-disable-next-line @typescript-eslint/no-require-imports -- TC-1002 intentionally verifies the CJS helper through the same synchronous loader shape as the E2E scripts.
const helper = require('../../e2e/lib/overlay-toast-assertions.js') as {
  OVERLAY_TOAST_TITLE_CASES: string[];
  OVERLAY_TOAST_TITLE_REJECTIONS: string[];
  hasKnownOverlayToastTitle: (text: string) => boolean;
};

const {
  OVERLAY_TOAST_TITLE_CASES: titleCases,
  OVERLAY_TOAST_TITLE_REJECTIONS: rejectedTitleCases,
  hasKnownOverlayToastTitle,
} = helper;

describe('overlay toast title assertions', () => {
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
