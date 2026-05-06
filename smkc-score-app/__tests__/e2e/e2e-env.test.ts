import * as e2eEnv from '../../e2e/lib/env';

describe('E2E environment resolution', () => {
  it('defaults to the preview URL and preview profile', () => {
    expect(e2eEnv.resolveE2EBaseUrl({})).toBe('https://preview.smkc.bluemoon.works');
    expect(e2eEnv.resolveE2EProfileDir({})).toBe('/tmp/playwright-smkc-preview-profile');
  });

  it('rejects production unless explicitly allowed', () => {
    expect(() => e2eEnv.resolveE2EBaseUrl({
      E2E_BASE_URL: 'https://smkc.bluemoon.works',
    })).toThrow(/Refusing to run E2E against production/);
  });

  it('allows production only with the emergency override', () => {
    expect(e2eEnv.resolveE2EBaseUrl({
      E2E_BASE_URL: 'https://smkc.bluemoon.works/',
      E2E_ALLOW_PRODUCTION: '1',
    })).toBe('https://smkc.bluemoon.works');
  });
});
