import fs from 'fs';
import path from 'path';

const root = path.join(process.cwd(), '..');

function readRepoFile(...parts: string[]) {
  return fs.readFileSync(path.join(root, ...parts), 'utf8');
}

describe('TC-1417 home recommendation E2E guard', () => {
  it('documents the sponsored recommendation scenario in the E2E case list', () => {
    const cases = readRepoFile('E2E_TEST_CASES.md');
    const sectionStart = cases.indexOf('## TC-1417:');
    expect(sectionStart).toBeGreaterThanOrEqual(0);

    const sectionEnd = cases.indexOf('\n## TC-', sectionStart + 1);
    const section = cases.slice(
      sectionStart,
      sectionEnd === -1 ? cases.length : sectionEnd,
    );

    expect(section).toContain('issue #1417');
    expect(section).toContain('rel="sponsored noopener noreferrer"');
    expect(section).toContain('__tests__/e2e/tc-1417-home-recommendation.test.ts');
  });

  it('keeps the home page recommendation link disclosed and safe for a new tab', () => {
    const source = readRepoFile(
      'smkc-score-app',
      'src',
      'app',
      'page.tsx',
    );

    expect(source).toContain('aria-labelledby="recommended-heading"');
    expect(source).toContain('id="recommended-heading"');
    expect(source).toContain('href="https://amzn.to/42upwDm"');
    expect(source).toContain('target="_blank"');
    expect(source).toContain('rel="sponsored noopener noreferrer"');
    expect(source).toContain("{t('affiliateLabel')}");
  });
});
