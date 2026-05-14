import { readRepoFile } from '../helpers/e2e-cases';

describe('TC-1046 Top-24 qualifier-count guard', () => {
  it('keeps Top-24 qualifier count separate from playoff entrant count', () => {
    const source = readRepoFile(
      'smkc-score-app',
      'src',
      'lib',
      'api-factories',
      'finals-route.ts',
    );

    expect(source).toContain('const TOP24_QUALIFIER_COUNT = 24');
    expect(source).toContain('const PLAYOFF_ENTRANT_COUNT = 12');

    const previewGuard = source.match(/if \(qualifications\.length < TOP24_QUALIFIER_COUNT\) return null;/g) ?? [];
    const postGuard = source.match(/if \(qualifications\.length < TOP24_QUALIFIER_COUNT\) \{/g) ?? [];

    expect(previewGuard).toHaveLength(1);
    expect(postGuard).toHaveLength(1);
    expect(source).toContain('`Not enough players qualified. Need ${TOP24_QUALIFIER_COUNT}, found ${qualifications.length}`');
  });
});
