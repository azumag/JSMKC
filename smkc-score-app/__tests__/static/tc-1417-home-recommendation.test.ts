import fs from 'fs';
import path from 'path';

const root = path.join(process.cwd(), '..');

function readRepoFile(...parts: string[]) {
  return fs.readFileSync(path.join(root, ...parts), 'utf8');
}

describe('TC-1417 home recommendation static guard', () => {
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
    expect(section).toContain('e2e/tc-all.js TC-1417');
    expect(section).toContain('__tests__/static/tc-1417-home-recommendation.test.ts');
  });

  it('keeps the home page recommendation link disclosed and product-specific', () => {
    const source = readRepoFile(
      'smkc-score-app',
      'src',
      'app',
      'page.tsx',
    );

    const sectionStart = source.indexOf('Sponsored recommendation block');
    expect(sectionStart).toBeGreaterThanOrEqual(0);
    const sectionEnd = source.indexOf('\n    </div>', sectionStart);
    expect(sectionEnd).toBeGreaterThan(sectionStart);
    const section = source.slice(sectionStart, sectionEnd);

    expect(section).toContain('aria-labelledby="recommended-heading"');
    expect(section).toContain('id="recommended-heading"');
    expect(section).toContain('href="https://amzn.to/42upwDm"');
    expect(section).toContain('target="_blank"');
    expect(section).toContain('rel="sponsored noopener noreferrer"');
    expect(section).toContain("{t('affiliateLabel')}");
    expect(section).toContain("{t('recommendedProductName')}");
    expect(section).toContain("{t('recommendedProductDesc')}");
    expect(section).toContain('tabular-nums');
    expect(section).not.toMatch(/className="[^"]*\btabular\s/);
  });
});
