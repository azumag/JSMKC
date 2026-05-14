import { e2eCaseSection, readRepoFile } from '../helpers/e2e-cases';

describe('TC-1011 finals H2H query guard coverage', () => {
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
    expect(section).toContain('__tests__/static/tc-1011-finals-h2h-guard.test.ts');
    expect(section).toContain('finals-route.test.ts');
  });

  it('keeps the documented scenario tied to the behavior-level unit regression', () => {
    expect(finalsRouteTest).toContain('does not fetch H2H matches when qualificationOrderBy is empty');
    expect(finalsRouteTest).toContain('qualificationOrderBy: []');
    expect(finalsRouteTest).toContain("args?.where?.stage === 'qualification'");
  });
});
