import { readRepoFile } from '../helpers/e2e-cases';

describe('TA sudden-death error contract', () => {
  const doc = readRepoFile('smkc-score-app', 'docs', 'ta-sudden-death-error-fallbacks.md');
  const source = readRepoFile(
    'smkc-score-app',
    'src',
    'components',
    'tournament',
    'ta-sudden-death-panel.tsx',
  );

  it('documents fail-closed HTTP failures instead of raw backend prose', () => {
    expect(doc).toContain('HTTP non-2xx');
    expect(doc).toContain('common.networkError');
    expect(doc).toContain('HTTP failure body');
    expect(doc).not.toContain('API が具体的な `error` を返した場合はその内容を優先');
  });

  it('keeps sudden-death mutation failures free of response-body parsing', () => {
    expect(source).toContain("setSaveError(tCommon('networkError'))");
    expect(source).not.toContain('response.json()');
  });
});
