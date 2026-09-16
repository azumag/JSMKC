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

describe('qualification bracket network error contract (issue #3584)', () => {
  it.each(pageContracts)(
    '$mode preserves API errors and surfaces fetch rejection with common.networkError',
    ({ mode, notifier }) => {
      const source = readAppFile('src', 'app', 'tournaments', '[id]', mode, 'page-client.tsx');

      expect(source).toContain(`${notifier}(err.error || tc('failedResetBracket'));`);
      expect(source).toContain(`${notifier}(err.error || tc('failedGenerateBracket'));`);
      expect(source).toContain(
        `logger.error('Failed to reset qualification bracket', { error, tournamentId });\n                  ${notifier}(tc('networkError'));`,
      );
      expect(source).toContain(
        `logger.error('Failed to generate qualification bracket', { error, tournamentId });\n                  ${notifier}(tc('networkError'));`,
      );
      expect(source).toContain('setResettingBracket(false);');
      expect(source).toContain('setGeneratingBracket(false);');
    },
  );
});
