import { e2eCaseSection, readRepoFile, sectionBetween } from '../helpers/e2e-cases';

describe('TC-1090-1091 overall-ranking static guard', () => {
  it('documents the overall-ranking follow-up scenario', () => {
    const section = e2eCaseSection('TC-1090-1091');

    expect(section).toContain('issue #1090/#1091');
    expect(section).toContain('hasCompletedRealQualificationMatch');
    expect(section).toContain('Record<MatchQualificationModel');
    expect(section).toContain('BREAK-like');
    expect(section).toContain('__tests__/lib/points/overall-ranking.test.ts');
  });

  it('keeps match-model lookup exhaustive instead of defaulting to GP', () => {
    const source = readRepoFile('smkc-score-app', 'src', 'lib', 'points', 'overall-ranking.ts');
    const helper = sectionBetween(
      source,
      'async function hasCompletedRealQualificationMatch',
      '\nfunction qualificationResultsByPlayer',
    );

    expect(helper).toContain('Record<MatchQualificationModel');
    expect(helper).toContain('const finders');
    expect(helper).not.toContain(': await prisma.gPMatch.findMany');
  });
});
