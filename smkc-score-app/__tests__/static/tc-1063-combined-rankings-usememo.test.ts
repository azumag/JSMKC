import { e2eCaseSection, readRepoFile, sectionBetween } from '../helpers/e2e-cases';

const pageClients = [
  {
    mode: 'BM',
    path: ['src', 'app', 'tournaments', '[id]', 'bm', 'page-client.tsx'],
    comparator: 'compareByScoreThenPoints',
  },
  {
    mode: 'MR',
    path: ['src', 'app', 'tournaments', '[id]', 'mr', 'page-client.tsx'],
    comparator: 'compareByScoreThenPoints',
  },
  {
    mode: 'GP',
    path: ['src', 'app', 'tournaments', '[id]', 'gp', 'page-client.tsx'],
    comparator: 'compareGpQualificationEntries',
  },
] as const;

describe('TC-1063 combined standings memoization guard', () => {
  it('documents the review follow-up scenario', () => {
    const section = e2eCaseSection('TC-1063');

    expect(section).toContain('issue #1063');
    expect(section).toContain('issue #1555/#1556');
    expect(section).toContain('useMemo');
    expect(section).toContain('BM/MR/GP');
    expect(section).toContain('tc-1063-combined-rankings-usememo.test.ts');
  });

  it.each(pageClients)('memoizes $mode combined rankings before JSX rendering', ({ path, comparator }) => {
    const source = readRepoFile('smkc-score-app', ...path);
    const declaration = sectionBetween(source, 'const combinedRankings = useMemo(', 'const qualificationConfirmed');
    const combinedTab = sectionBetween(
      source,
      '<TabsContent value="combined">',
      '{/* Matches Tab - Group-filtered, round-grouped match list */}',
    );

    expect(source).toMatch(/import\s*\{[^}]*\buseMemo\b[^}]*\}\s*from ['"]react['"]/s);
    expect(declaration).toContain('computeCombinedRanks(qualifications');
    expect(declaration).toContain(comparator);
    expect(declaration).toContain('[qualifications]');
    expect(combinedTab).toContain('combinedRankings');
    expect(combinedTab).not.toContain('const combinedRankings = computeCombinedRanks');
    expect(combinedTab).not.toContain('computeCombinedRanks(');
  });

  it('keeps BM/MR on the shared score-then-points comparator', () => {
    const bmSource = readRepoFile('smkc-score-app', 'src', 'app', 'tournaments', '[id]', 'bm', 'page-client.tsx');
    const mrSource = readRepoFile('smkc-score-app', 'src', 'app', 'tournaments', '[id]', 'mr', 'page-client.tsx');

    expect(bmSource).toContain('compareByScoreThenPoints');
    expect(mrSource).toContain('compareByScoreThenPoints');
    expect(bmSource).not.toContain('compareBmQualificationEntries');
    expect(mrSource).not.toContain('compareMrQualificationEntries');
  });

  it('keeps the shared comparator signature non-generic', () => {
    const rankingUtils = readRepoFile('smkc-score-app', 'src', 'lib', 'ranking-utils.ts');

    expect(rankingUtils).toContain(
      'export function compareByScoreThenPoints(a: ScorePointsEntry, b: ScorePointsEntry): number',
    );
    expect(rankingUtils).not.toContain('compareByScoreThenPoints<T extends ScorePointsEntry>');
  });
});
