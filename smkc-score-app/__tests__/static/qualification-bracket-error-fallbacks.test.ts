import fs from 'fs';
import path from 'path';

const failClosedPageContracts = [
  { mode: 'bm', notifier: 'alert' },
  { mode: 'mr', notifier: 'toast.error' },
  { mode: 'gp', notifier: 'alert' },
] as const;

function readAppFile(...parts: string[]) {
  return fs.readFileSync(path.join(process.cwd(), ...parts), 'utf8');
}

describe('qualification bracket network error contract (issue #3584)', () => {
  it.each(failClosedPageContracts)(
    '$mode hides bracket API errors and uses common.networkError for HTTP and transport failures',
    ({ mode, notifier }) => {
      const source = readAppFile('src', 'app', 'tournaments', '[id]', mode, 'page-client.tsx');

      expect(source).not.toContain(`${notifier}(err.error || tc('failedResetBracket'));`);
      expect(source).not.toContain(`${notifier}(err.error || tc('failedGenerateBracket'));`);
      expect(source).not.toContain('const err = await res.json().catch(() => ({}));');

      expect(source).toContain("logger.error('Failed to reset qualification bracket', {");
      expect(source).toContain("logger.error('Failed to generate qualification bracket', {");
      expect(source).toContain('status: res.status');
      expect(source).toContain("logger.error('Failed to reset qualification bracket', { error, tournamentId });");
      expect(source).toContain("logger.error('Failed to generate qualification bracket', { error, tournamentId });");
      expect(source).toContain(`${notifier}(tc('networkError'));`);
      expect(source).toContain('setResettingBracket(false);');
      expect(source).toContain('setGeneratingBracket(false);');
    },
  );
});
