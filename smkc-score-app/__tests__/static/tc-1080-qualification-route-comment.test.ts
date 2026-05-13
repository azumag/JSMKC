import { e2eCaseSection, readRepoFile, sectionBetween } from '../helpers/e2e-cases';

describe('TC-1080 qualification-route MR round size comment guard', () => {
  it('documents the review follow-up scenario', () => {
    const section = e2eCaseSection('TC-1080');

    expect(section).toContain('issue #1080');
    expect(section).toContain('8人ラウンドロビン');
    expect(section).toContain('8/2 = 4');
    expect(section).toContain('__tests__/static/tc-1080-qualification-route-comment.test.ts');
  });

  it('keeps the 8-player MR round-size assertion explained at the unit-test site', () => {
    const source = readRepoFile(
      'smkc-score-app',
      '__tests__',
      'lib',
      'api-factories',
      'qualification-route.test.ts',
    );
    const testBlock = sectionBetween(
      source,
      "it('should use the MR raw insert mapping for large qualification setup'",
      "it('should use the GP raw insert mapping for large qualification setup'",
    );

    expect(testBlock).toContain('8-player round-robin');
    expect(testBlock).toContain('8 / 2 = 4');
    expect(testBlock).toContain('expect(roundMatches).toHaveLength(4)');
  });
});
