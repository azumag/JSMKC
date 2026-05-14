import { e2eCaseSection, readRepoFile } from '../helpers/e2e-cases';

describe('TC-1011 finals H2H query guard coverage', () => {
  const finalsRoute = readRepoFile(
    'smkc-score-app',
    'src',
    'lib',
    'api-factories',
    'finals-route.ts',
  );
  const finalsRouteTest = readRepoFile(
    'smkc-score-app',
    '__tests__',
    'lib',
    'api-factories',
    'finals-route.test.ts',
  );

  it('documents the empty qualificationOrderBy defensive finals scenario', () => {
    const section = e2eCaseSection('TC-1011');

    expect(section).toContain('issue #1011');
    expect(section).toContain('qualificationOrderBy: []');
    expect(section).toContain("stage: 'qualification'");
    expect(section).toContain('vacuous truth');
    expect(section).toContain('tc-1011-finals-h2h-guard.test.ts');
    expect(section).toContain('finals-route.test.ts');
  });

  it('keeps the implementation and unit regression tied to the documented scenario', () => {
    expect(finalsRoute).toContain('rankingOrder.length === 0');
    expect(finalsRouteTest).toContain('does not fetch H2H matches when qualificationOrderBy is empty');
    expect(finalsRouteTest).toContain('qualificationOrderBy: []');
    expect(finalsRouteTest).toContain("args?.where?.stage === 'qualification'");
  });
});
