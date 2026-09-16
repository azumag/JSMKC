import fs from 'node:fs';
import path from 'node:path';

describe('TA participant fallback error i18n', () => {
  const participantPage = fs.readFileSync(
    path.join(process.cwd(), 'src', 'app', 'tournaments', '[id]', 'ta', 'participant', 'page.tsx'),
    'utf8',
  );
  const enMessages = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'messages', 'en.json'), 'utf8')) as {
    common: { networkError?: string };
  };
  const jaMessages = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'messages', 'ja.json'), 'utf8')) as {
    common: { networkError?: string };
  };

  it('routes user-visible client fallbacks through the common message catalog', () => {
    expect(participantPage).toContain("tCommon('networkError')");

    for (const literal of [
      'Failed to load tournament data.',
      'Failed to submit times',
      'Failed to submit partner times',
      'Failed to report time',
      'Failed to add to time attack',
    ]) {
      expect(participantPage).not.toContain(literal);
    }
  });

  it('keeps concrete server errors ahead of the localized fallback', () => {
    expect(participantPage).toMatch(/errorData\.error\s*\|\|\s*tCommon\('networkError'\)/);
    expect(participantPage).toMatch(/json\.error\s*\|\|\s*tCommon\('networkError'\)/);
  });

  it('keeps the shared fallback translated in English and Japanese', () => {
    expect(enMessages.common.networkError).toBeTruthy();
    expect(jaMessages.common.networkError).toBeTruthy();
    expect(enMessages.common.networkError).not.toBe(jaMessages.common.networkError);
  });
});
