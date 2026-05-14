import { e2eCaseSection, readRepoFile } from '../helpers/e2e-cases';

describe('TC-1053 Top-24 playoff upper seed guard', () => {
  const finalsRoute = readRepoFile(
    'smkc-score-app',
    'src',
    'lib',
    'api-factories',
    'finals-route.ts',
  );
  const unitTest = readRepoFile(
    'smkc-score-app',
    '__tests__',
    'lib',
    'api-factories',
    'finals-route.test.ts',
  );

  it('documents the malformed playoff structure regression scenario', () => {
    const section = e2eCaseSection('TC-1053');

    expect(section).toContain('issue #1053');
    expect(section).toContain('playoffUpperSeeds');
    expect(section).toContain('advancesToUpperSeed');
    expect(section).toContain('Expected 4 playoff R2 upper seeds');
    expect(section).toContain('finals-route.test.ts');
  });

  it('keeps Phase 2 from silently omitting playoff winners', () => {
    expect(finalsRoute).toContain('playoffUpperSeeds.length !== 4');
    expect(finalsRoute).toContain('Expected 4 playoff R2 upper seeds');
    expect(unitTest).toContain('malformed playoff structure is missing R2 upper seeds');
  });
});
