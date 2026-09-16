import fs from 'fs';
import path from 'path';

function readMatchPage(mode: 'mr' | 'gp') {
  return fs.readFileSync(
    path.join(process.cwd(), 'src', 'app', 'tournaments', '[id]', mode, 'match', '[matchId]', 'page.tsx'),
    'utf8',
  );
}

describe('MR/GP match report error fallback contract (issue #3588)', () => {
  it.each(['mr', 'gp'] as const)('%s preserves API errors and localizes generic submit failures', (mode) => {
    const source = readMatchPage(mode);

    expect(source).toContain('const data = await response.json().catch(() => ({}));');
    expect(source).toContain("setError(data.error || tCommon('networkError'));");
    expect(source).toContain("logger.error('Failed to submit result:', { error: err });");
    expect(source).toContain("setError(tCommon('networkError'));");
  });

  it('removes the MR hard-coded English generic failure', () => {
    expect(readMatchPage('mr')).not.toContain("setError('Failed to submit result');");
  });

  it('does not use the GP submit button label as an error fallback', () => {
    expect(readMatchPage('gp')).not.toContain("setError(data.error || tMatch('submitResult'));");
  });
});
