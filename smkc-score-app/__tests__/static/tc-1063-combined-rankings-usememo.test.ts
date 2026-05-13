import { e2eCaseSection, readRepoFile, sectionBetween } from '../helpers/e2e-cases';

const pageClients = [
  {
    mode: 'BM',
    path: ['src', 'app', 'tournaments', '[id]', 'bm', 'page-client.tsx'],
    comparator: 'compareBmQualificationEntries',
  },
  {
    mode: 'MR',
    path: ['src', 'app', 'tournaments', '[id]', 'mr', 'page-client.tsx'],
    comparator: 'compareMrQualificationEntries',
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
    expect(section).toContain('useMemo');
    expect(section).toContain('BM/MR/GP');
    expect(section).toContain('tc-1063-combined-rankings-usememo.test.ts');
  });

  it.each(pageClients)('memoizes $mode combined rankings before JSX rendering', ({ path, comparator }) => {
    const source = readRepoFile('smkc-score-app', ...path);
    const declaration = sectionBetween(
      source,
      'const combinedRankings = useMemo(',
      '/* Whether qualification scores are locked by admin confirmation */',
    );
    const combinedTab = sectionBetween(
      source,
      '<TabsContent value="combined">',
      '{/* Matches Tab - Group-filtered, round-grouped match list */}',
    );

    expect(source).toContain('useMemo } from "react"');
    expect(declaration).toContain('computeCombinedRanks(qualifications');
    expect(declaration).toContain(comparator);
    expect(declaration).toContain('[qualifications]');
    expect(combinedTab).toContain('combinedRankings.map');
    expect(combinedTab).not.toContain('const combinedRankings = computeCombinedRanks');
    expect(combinedTab).not.toContain('computeCombinedRanks(');
  });
});
