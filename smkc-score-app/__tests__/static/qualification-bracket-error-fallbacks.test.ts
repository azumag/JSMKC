import fs from 'fs';
import path from 'path';

const legacyPageContracts = [
  { mode: 'bm', notifier: 'alert' },
  { mode: 'mr', notifier: 'toast.error' },
] as const;

function readAppFile(...parts: string[]) {
  return fs.readFileSync(path.join(process.cwd(), ...parts), 'utf8');
}

describe('qualification bracket network error contract (issue #3584)', () => {
  it.each(legacyPageContracts)(
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

  it('gp hides bracket API errors and uses common.networkError for HTTP and transport failures', () => {
    const source = readAppFile('src', 'app', 'tournaments', '[id]', 'gp', 'page-client.tsx');

    expect(source).not.toContain("alert(err.error || tc('failedResetBracket'));");
    expect(source).not.toContain("alert(err.error || tc('failedGenerateBracket'));");
    expect(source).toContain("logger.error('Failed to reset qualification bracket', {");
    expect(source).toContain("logger.error('Failed to generate qualification bracket', {");
    expect(source).toContain('status: res.status');
    expect(source).toContain(
      "logger.error('Failed to reset qualification bracket', { error, tournamentId });\n                  alert(tc('networkError'));",
    );
    expect(source).toContain(
      "logger.error('Failed to generate qualification bracket', { error, tournamentId });\n                  alert(tc('networkError'));",
    );
    expect(source).toContain('setResettingBracket(false);');
    expect(source).toContain('setGeneratingBracket(false);');
  });
});
