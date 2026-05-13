import { e2eCaseSection, readRepoFile } from '../helpers/e2e-cases';

describe('TC-1563 combined standings test selectors', () => {
  const unitTest = readRepoFile(
    'smkc-score-app',
    '__tests__',
    'components',
    'tournament',
    'combined-standings-table.test.tsx',
  );

  it('documents the column-header based assertion scenario', () => {
    const section = e2eCaseSection('TC-1563');

    expect(section).toContain('issue #1563');
    expect(section).toContain('列ヘッダー名');
    expect(section).toContain('getAllByText(...).toHaveLength(...)');
    expect(section).toContain('combined-standings-table.test.tsx');
  });

  it('keeps combined standings tests away from duplicate-text count assertions', () => {
    expect(unitTest).toContain('function cellsByHeader');
    expect(unitTest).toContain('getAllByRole("columnheader")');
    expect(unitTest).toContain('getAllByRole("cell")');
    expect(unitTest).not.toContain('getAllByText("0")).toHaveLength');
    expect(unitTest).not.toContain('getAllByText("1")).toHaveLength');
  });
});
