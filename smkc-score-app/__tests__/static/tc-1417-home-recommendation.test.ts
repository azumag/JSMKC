import { readRepoFile, sectionBetween } from '../helpers/e2e-cases';

describe('TC-1417 home recommendation static guard', () => {
  it('documents the sponsored recommendation scenario in the E2E case list', () => {
    const cases = readRepoFile('E2E_TEST_CASES.md');
    const section = sectionBetween(cases, '## TC-1417:', '\n## TC-', { allowTerminal: true });

    expect(section).toContain('issue #1417');
    expect(section).toContain('rel="sponsored noopener noreferrer"');
    expect(section).toContain('e2e/tc-all.js TC-1417');
    expect(section).toContain('__tests__/static/tc-1417-home-recommendation.test.ts');
  });

  it('keeps terminal sections from silently accepting empty slices with a marker-specific error', () => {
    expect(() => sectionBetween('prefix ## TC-1417:', '## TC-1417:', '\n## TC-', { allowTerminal: true }))
      .toThrow('terminal section for marker "## TC-1417:" has no content');
  });

  it('keeps the home page recommendation link disclosed and product-specific', () => {
    const source = readRepoFile(
      'smkc-score-app',
      'src',
      'app',
      'page.tsx',
    );

    const section = sectionBetween(source, 'Sponsored recommendation block', '\n    </div>');

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
