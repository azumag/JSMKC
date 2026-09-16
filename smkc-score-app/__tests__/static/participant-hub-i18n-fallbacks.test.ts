import fs from 'node:fs';
import path from 'node:path';

describe('participant hub fetch fallback i18n', () => {
  const participantPage = fs.readFileSync(
    path.join(process.cwd(), 'src', 'app', 'tournaments', '[id]', 'participant', 'page.tsx'),
    'utf8',
  );
  const enMessages = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'messages', 'en.json'), 'utf8')) as {
    common: { networkError?: string };
  };
  const jaMessages = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'messages', 'ja.json'), 'utf8')) as {
    common: { networkError?: string };
  };

  it('routes both user-visible fetch failure paths through common.networkError', () => {
    const localizedFallbacks = participantPage.match(/setError\(tCommon\('networkError'\)\)/g) ?? [];

    expect(localizedFallbacks).toHaveLength(2);
    expect(participantPage).not.toContain('Failed to load tournament information');
    expect(participantPage).not.toContain('Failed to load tournament data. Please check your connection.');
  });

  it('keeps the translator in the fetch effect dependencies', () => {
    expect(participantPage).toContain('[tournamentId, sessionStatus, hasAccess, tCommon]');
  });

  it('keeps the shared fallback translated in English and Japanese', () => {
    expect(enMessages.common.networkError).toBeTruthy();
    expect(jaMessages.common.networkError).toBeTruthy();
    expect(enMessages.common.networkError).not.toBe(jaMessages.common.networkError);
  });
});
