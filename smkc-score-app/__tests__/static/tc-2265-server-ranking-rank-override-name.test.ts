import { e2eCaseSection, readRepoFile } from '../helpers/e2e-cases';

describe('TC-2265 server-ranking rankOverride flag naming', () => {
  it('documents the review follow-up scenario', () => {
    const section = e2eCaseSection('TC-2265');

    expect(section).toContain('issue #2265');
    expect(section).toContain('hasRankOverride');
    expect(section).toContain('overrideRank');
    expect(section).toContain('tc-2265-server-ranking-rank-override-name.test.ts');
  });

  it('uses a boolean name that cannot be confused with the override rank value', () => {
    const source = readRepoFile('smkc-score-app', 'src', 'lib', 'server-ranking.ts');

    expect(source).toContain('const rankOverride = entry.rankOverride;');
    expect(source).toContain('const hasRankOverride = rankOverride != null;');
    expect(source).toContain('if (hasRankOverride)');
    expect(source).not.toContain('const overrideRank = entry.rankOverride != null;');
  });
});
