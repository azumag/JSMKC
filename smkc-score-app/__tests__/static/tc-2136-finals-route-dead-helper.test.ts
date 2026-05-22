import { readRepoFile } from '../helpers/e2e-cases';

describe('TC-2136 finals route test helper cleanup', () => {
  const source = readRepoFile(
    'smkc-score-app',
    '__tests__',
    'lib',
    'api-factories',
    'finals-route.test.ts',
  );

  it('does not keep the unused qualification helper in finals-route.test.ts', () => {
    expect(source).toContain('const createMockMatch =');
    expect(source).toContain('const createMockQualifications =');
    expect(source).not.toContain('_createMockQualification');
  });
});
