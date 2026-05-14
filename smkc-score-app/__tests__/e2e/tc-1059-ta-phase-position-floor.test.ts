import { e2eCaseSection, readRepoFile } from '../helpers/e2e-cases';

describe('TC-1059 TA phase position floor coverage', () => {
  it('documents and backs issue #1059 with TA finals position unit coverage', () => {
    const section = e2eCaseSection('TC-1059');
    const unitTest = readRepoFile(
      'smkc-score-app',
      '__tests__',
      'lib',
      'points',
      'overall-ranking.test.ts',
    );

    expect(section).toContain('issue #1059');
    expect(section).toContain('Phase 2');
    expect(section).toContain('17〜20位');
    expect(section).toContain('Phase 1');
    expect(section).toContain('21〜24位');
    expect(unitTest).toContain('p16-overflow');
    expect(unitTest).toContain('p20-overflow');
  });
});
