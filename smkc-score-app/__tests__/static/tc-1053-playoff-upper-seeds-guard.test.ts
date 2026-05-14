import { e2eCaseSection } from '../helpers/e2e-cases';

describe('TC-1053 Top-24 playoff upper seed guard', () => {
  it('documents the malformed playoff structure regression scenario', () => {
    const section = e2eCaseSection('TC-1053');

    expect(section).toContain('issue #1053');
    expect(section).toContain('playoffUpperSeeds');
    expect(section).toContain('advancesToUpperSeed');
    expect(section).toContain('Expected 4 playoff R2 upper seeds');
    expect(section).toContain('finals-route.test.ts');
  });
});
