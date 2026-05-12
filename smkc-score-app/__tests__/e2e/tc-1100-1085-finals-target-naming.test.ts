import fs from 'fs';
import path from 'path';

const root = path.join(process.cwd(), '..');

function readRepoFile(...parts: string[]) {
  return fs.readFileSync(path.join(root, ...parts), 'utf8');
}

describe('TC-1100-1085 finals target naming E2E guard', () => {
  it('documents the top-four target-wins naming scenario', () => {
    const cases = readRepoFile('E2E_TEST_CASES.md');
    const sectionStart = cases.indexOf('## TC-1100-1085:');
    expect(sectionStart).toBeGreaterThanOrEqual(0);

    const sectionEnd = cases.indexOf('\n## TC-', sectionStart + 1);
    const section = cases.slice(
      sectionStart,
      sectionEnd === -1 ? cases.length : sectionEnd,
    );

    expect(section).toContain('issues #1100, #1085');
    expect(section).toContain('isTopFourTargetRound');
    expect(section).toContain('losers_sf');
    expect(section).toContain('__tests__/e2e/tc-1100-1085-finals-target-naming.test.ts');
  });

  it('keeps the helper name aligned with the rounds it covers', () => {
    const source = readRepoFile(
      'smkc-score-app',
      'src',
      'lib',
      'finals-target-wins.ts',
    );

    expect(source).toContain('function isTopFourTargetRound(round?: string | null): boolean');
    expect(source).toContain("round === 'losers_sf'");
    expect(source).not.toContain('function isFinalRound(');
    expect(source).not.toContain('isFinalRound(context?.round)');
  });
});
