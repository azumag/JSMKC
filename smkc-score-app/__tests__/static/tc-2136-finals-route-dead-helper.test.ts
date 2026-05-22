import { readRepoFile } from '../helpers/e2e-cases';

describe('TC-2136 finals route test helper cleanup', () => {
  const source = readRepoFile(
    'smkc-score-app',
    '__tests__',
    'lib',
    'api-factories',
    'finals-route.test.ts',
  );
  it('has removed the unused _createMockQualification helper from finals-route.test.ts', () => {
    // Keep static checks structural; wording changes are not stability guarantees.
    expect(source).toContain('const createMockMatch =');
    expect(source).toContain('const createMockQualifications =');
    expect(source).not.toContain('_createMockQualification');
  });
});
