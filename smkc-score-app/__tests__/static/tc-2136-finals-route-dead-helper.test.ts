import { readRepoFile } from '../helpers/e2e-cases';

describe('TC-2136 finals route test helper cleanup', () => {
  const source = readRepoFile(
    'smkc-score-app',
    '__tests__',
    'lib',
    'api-factories',
    'finals-route.test.ts',
  );
  const guardSource = readRepoFile(
    'smkc-score-app',
    '__tests__',
    'static',
    'tc-2136-finals-route-dead-helper.test.ts',
  );

  it('has removed the unused _createMockQualification helper from finals-route.test.ts', () => {
    expect(source).toContain('const createMockMatch =');
    expect(source).toContain('const createMockQualifications =');
    expect(source).not.toContain('_createMockQualification');
  });

  it('uses positive wording for the dead-helper guard description', () => {
    expect(guardSource).toContain(
      "it('has removed the unused _createMockQualification helper from finals-route.test.ts'",
    );
    expect(guardSource).not.toContain(["it('does not", ' keep'].join(''));
  });
});
