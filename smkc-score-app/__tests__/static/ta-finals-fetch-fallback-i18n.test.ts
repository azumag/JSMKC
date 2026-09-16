import fs from 'node:fs';
import path from 'node:path';

describe('TA finals fetch fallback i18n', () => {
  const eliminationPhase = fs.readFileSync(
    path.join(process.cwd(), 'src', 'components', 'tournament', 'ta-elimination-phase.tsx'),
    'utf8',
  );
  const finalsPage = fs.readFileSync(
    path.join(process.cwd(), 'src', 'app', 'tournaments', '[id]', 'ta', 'finals', 'page.tsx'),
    'utf8',
  );
  const enMessages = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'messages', 'en.json'), 'utf8')) as {
    common: { networkError?: string };
  };
  const jaMessages = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'messages', 'ja.json'), 'utf8')) as {
    common: { networkError?: string };
  };

  it('uses the shared localized fallback in phase 1/2 and phase 3 fetch paths', () => {
    for (const source of [eliminationPhase, finalsPage]) {
      expect(source).toMatch(/errorData\.error\s*\|\|\s*tCommon\('networkError'\)/);
      expect(source).toMatch(/err instanceof Error \? err\.message : tCommon\('networkError'\)/);
    }
  });

  it('removes the user-visible English fetch fallbacks without changing logger diagnostics', () => {
    expect(eliminationPhase).not.toContain('`Failed to fetch ${phase} data: ${response.status}`');
    expect(finalsPage).not.toContain('`Failed to fetch finals data: ${response.status}`');
    expect(eliminationPhase).toContain("logger.error('Failed to fetch data:'");
    expect(finalsPage).toContain("logger.error('Failed to fetch data:'");
  });

  it('keeps the shared fallback translated in English and Japanese', () => {
    expect(enMessages.common.networkError).toBeTruthy();
    expect(jaMessages.common.networkError).toBeTruthy();
    expect(enMessages.common.networkError).not.toBe(jaMessages.common.networkError);
  });
});
