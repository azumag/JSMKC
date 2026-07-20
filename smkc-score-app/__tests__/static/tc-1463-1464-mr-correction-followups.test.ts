import { readRepoFile, sectionBetween } from '../helpers/e2e-cases';

describe('TC-1463-1464 MR correction follow-up guards', () => {
  it('keeps TC-1083 correction wait tied to the updated MR score instead of a fixed sleep', () => {
    const source = readRepoFile('smkc-score-app', 'e2e', 'tc-mr.js');
    const tc1083 = sectionBetween(source, 'async function runTc1083', '/**\n * TC-603');

    /* Whitespace-tolerant: Prettier may wrap `waitForFunction(` and its async
     * callback onto separate lines depending on argument count/width. */
    expect(tc1083).toMatch(/waitForFunction\(\s*async/);
    expect(tc1083).toContain('updated.score1 === 2 && updated.score2 === 2');
    expect(tc1083).not.toContain('waitForTimeout(3000)');
  });

  it('keeps the MR score editor as a page-level component reused by normal and correction forms', () => {
    const source = readRepoFile('smkc-score-app', 'src', 'app', 'tournaments', '[id]', 'mr', 'participant', 'page.tsx');

    expect(source).toContain('function MrScoreEditor({');
    expect(source).toContain('interface MrScoreEditorProps');
    expect(source.match(/<MrScoreEditor/g)?.length).toBe(2);
    expect(source).not.toContain('const renderScoreEditor');
  });
});
