import { e2eCaseSection, readRepoFile, sectionBetween } from '../helpers/e2e-cases';

describe('TC-1579 combined standings tooltip label contract', () => {
  const component = readRepoFile(
    'smkc-score-app',
    'src',
    'components',
    'tournament',
    'combined-standings-table.tsx',
  );
  const unitTest = readRepoFile(
    'smkc-score-app',
    '__tests__',
    'components',
    'tournament',
    'combined-standings-table.test.tsx',
  );

  it('documents the required tooltip label scenario', () => {
    const section = e2eCaseSection('TC-1579');

    expect(section).toContain('issue #1579');
    expect(section).toContain('qualificationPointsTooltip');
    expect(section).toContain('必須フィールド');
    expect(section).toContain('combined-standings-table.test.tsx');
    expect(section).toContain('tc-1579-combined-standings-tooltip-contract.test.ts');
  });

  it('requires CombinedStandingsTableLabels.qualificationPointsTooltip', () => {
    const labelsInterface = sectionBetween(
      component,
      'export interface CombinedStandingsTableLabels {',
      '\n}\n\ninterface CombinedStandingsTableProps',
    );

    expect(labelsInterface).toContain('qualificationPointsTooltip: string;');
    expect(labelsInterface).not.toContain('qualificationPointsTooltip?:');
    expect(component).toContain('title={labels.qualificationPointsTooltip}');
    expect(unitTest).toContain('satisfies CombinedStandingsTableLabels');
  });

  it.each([
    ['BM', ['src', 'app', 'tournaments', '[id]', 'bm', 'page-client.tsx']],
    ['MR', ['src', 'app', 'tournaments', '[id]', 'mr', 'page-client.tsx']],
  ] as const)('passes the localized tooltip label from %0 combined standings', (_mode, path) => {
    const source = readRepoFile('smkc-score-app', ...path);
    const combinedTab = sectionBetween(
      source,
      '<TabsContent value="combined">',
      '{/* Matches Tab - Group-filtered, round-grouped match list */}',
    );

    expect(combinedTab).toContain('qualificationPointsTooltip: tc(\'qualificationPointsTooltip\')');
  });
});
