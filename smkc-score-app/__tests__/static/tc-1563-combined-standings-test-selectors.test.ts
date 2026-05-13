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
    const tc1565 = e2eCaseSection('TC-1565');
    const tc1566 = e2eCaseSection('TC-1566');

    expect(section).toContain('issue #1563');
    expect(section).toContain('列ヘッダー名');
    expect(section).toContain('getAllByText(...).toHaveLength(...)');
    expect(section).toContain('combined-standings-table.test.tsx');
    expect(tc1565).toContain('issue #1565');
    expect(tc1565).toContain('expect(cells).toHaveLength(headers.length)');
    expect(tc1566).toContain('issue #1566');
    expect(tc1566).toContain('正規表現');
  });

  it('keeps combined standings tests away from duplicate-text count assertions', () => {
    expect(unitTest).toContain('function cellsByHeader');
    expect(unitTest).toContain('getAllByRole("columnheader")');
    expect(unitTest).toContain('getAllByRole("cell")');
    expect(unitTest).toContain('expect(cells).toHaveLength(headers.length)');
    expect(unitTest).not.toMatch(/getAllByText\([^)]+\)\)\.toHaveLength/);
  });
});
