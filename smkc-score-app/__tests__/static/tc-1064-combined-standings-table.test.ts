import { e2eCaseSection, readRepoFile, sectionBetween } from '../helpers/e2e-cases';

describe('TC-1064 combined standings table extraction', () => {
  const component = readRepoFile(
    'smkc-score-app',
    'src',
    'components',
    'tournament',
    'combined-standings-table.tsx',
  );

  it('documents the shared BM/MR combined standings component scenario', () => {
    const section = e2eCaseSection('TC-1064');

    expect(section).toContain('issue #1064');
    expect(section).toContain('CombinedStandingsTable');
    expect(section).toContain('combined-standings-table.test.tsx');
    expect(section).toContain('tc-1064-combined-standings-table.test.ts');
  });

  it.each([
    ['BM', ['src', 'app', 'tournaments', '[id]', 'bm', 'page-client.tsx']],
    ['MR', ['src', 'app', 'tournaments', '[id]', 'mr', 'page-client.tsx']],
  ] as const)('renders $0 combined standings through the shared table', (_mode, path) => {
    const source = readRepoFile('smkc-score-app', ...path);
    const combinedTab = sectionBetween(
      source,
      '<TabsContent value="combined">',
      '{/* Matches Tab - Group-filtered, round-grouped match list */}',
    );

    expect(source).toContain('CombinedStandingsTable');
    expect(combinedTab).toContain('<CombinedStandingsTable');
    expect(combinedTab).toContain('rankings={combinedRankings}');
    expect(combinedTab).toContain('getQualificationPoints={(q) => getQualificationPoints(q.mp, q.score)}');
    expect(combinedTab).not.toContain('<TableHeader>');
    expect(combinedTab).not.toContain('combinedRankings.map');
  });

  it('keeps table structure centralized in CombinedStandingsTable', () => {
    expect(component).toContain('export interface CombinedStandingsEntry');
    expect(component).toContain('export function CombinedStandingsTable');
    expect(component).toContain('rankings.map');
    expect(component).toContain('getQualificationPoints(entry)');
  });
});
