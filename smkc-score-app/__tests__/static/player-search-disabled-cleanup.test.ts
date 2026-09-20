import { readRepoFile } from '../helpers/e2e-cases';

describe('usePlayerSearch disabled lifecycle cleanup', () => {
  it('cancels the queued disabled-state clear after effect cleanup', () => {
    const source = readRepoFile('smkc-score-app', 'src', 'hooks', 'use-player-search.ts');
    const disabledBranch = source.match(/if \(!enabled\) \{([\s\S]*?)\n    \}\n\n    const controller/);

    expect(disabledBranch?.[1]).toBeDefined();
    expect(disabledBranch?.[1]).toContain('let cancelled = false;');
    expect(disabledBranch?.[1]).toMatch(
      /queueMicrotask\(\(\) => \{[\s\S]*if \(cancelled \|\| generationRef\.current !== generation\) return;/,
    );
    expect(disabledBranch?.[1]).toMatch(/return \(\) => \{[\s\S]*cancelled = true;[\s\S]*\};/);
  });
});
