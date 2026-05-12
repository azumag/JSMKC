import { e2eCaseSection, readRepoFile, sectionBetween } from '../helpers/e2e-cases';

describe('TC-1088 qualification-route round-robin comment guard', () => {
  it('documents the review follow-up scenario', () => {
    const section = e2eCaseSection('TC-1088');

    expect(section).toContain('issue #1088');
    expect(section).toContain('4人ラウンドロビン');
    expect(section).toContain('C(4,2)/2');
    expect(section).toContain('__tests__/static/tc-1088-qualification-route-comment.test.ts');
  });

  it('keeps the 3-round GP fixture assertion explained at the unit-test site', () => {
    const source = readRepoFile(
      'smkc-score-app',
      '__tests__',
      'lib',
      'api-factories',
      'qualification-route.test.ts',
    );
    const testBlock = sectionBetween(
      source,
      "it('should assign the same GP cup to all real matches in the same round'",
      "it('rejects non-positive GP round numbers before cup assignment",
    );

    expect(testBlock).toContain('4-player round-robin => 3 rounds (C(4,2)/2)');
    expect(testBlock).toContain('expect(matchesByRound.size).toBe(3)');
  });
});
