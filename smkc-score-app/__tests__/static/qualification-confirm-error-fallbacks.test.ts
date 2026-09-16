import fs from 'fs';
import path from 'path';

const pageContracts = [
  { mode: 'bm', notifier: 'alert' },
  { mode: 'mr', notifier: 'toast.error' },
  { mode: 'gp', notifier: 'alert' },
] as const;

function readAppFile(...parts: string[]) {
  return fs.readFileSync(path.join(process.cwd(), ...parts), 'utf8');
}

describe('qualification confirmation error fallback contract', () => {
  it.each(pageContracts)('$mode keeps API errors first and falls back to common.networkError', ({ mode, notifier }) => {
    const source = readAppFile('src', 'app', 'tournaments', '[id]', mode, 'page-client.tsx');

    expect(source).not.toContain('Failed to update qualification status');
    expect(source).toContain(`${notifier}(errorData.error || tc('networkError'));`);
    expect(source).toContain(
      `logger.error('Failed to toggle qualification confirmed', { error: err, tournamentId });\n      ${notifier}(tc('networkError'));`,
    );
  });

  it.each(['en', 'ja'])('defines common.networkError for %s', (locale) => {
    const messages = readAppFile('messages', `${locale}.json`);

    expect(messages).toMatch(/"networkError"\s*:\s*"[^"]+"/);
  });
});
