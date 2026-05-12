import fs from 'fs';
import path from 'path';

const root = path.join(process.cwd(), '..');

function readRepoFile(...parts: string[]) {
  return fs.readFileSync(path.join(root, ...parts), 'utf8');
}

describe('TC-1398-1399 bracket contract E2E guard', () => {
  it('documents the bracket type/fallback scenario in the E2E case list', () => {
    const cases = readRepoFile('E2E_TEST_CASES.md');
    const sectionStart = cases.indexOf('## TC-1398-1399:');
    expect(sectionStart).toBeGreaterThanOrEqual(0);

    const sectionEnd = cases.indexOf('\n## TC-', sectionStart + 1);
    const section = cases.slice(
      sectionStart,
      sectionEnd === -1 ? cases.length : sectionEnd,
    );

    expect(section).toContain('issues #1398, #1399');
    expect(section).toContain('BracketMatch');
    expect(section).toContain('loserPosition ?? 1');
    expect(section).toContain('__tests__/e2e/tc-1398-1399-bracket-contract.test.ts');
  });

  it('keeps the bracket component on the shared BracketMatch type', () => {
    const source = readRepoFile(
      'smkc-score-app',
      'src',
      'components',
      'tournament',
      'double-elimination-bracket.tsx',
    );

    expect(source).toMatch(/import type \{[^}]*\bBracketMatch\b[^}]*\} from "@\/types\/bracket";/);
    expect(source).toContain('bracketStructure: BracketMatch[];');
    expect(source).not.toMatch(/interface\s+BracketMatch\s*{/);
  });

  it('keeps loserPosition fallback nullish in routing code paths', () => {
    const doubleElimination = readRepoFile(
      'smkc-score-app',
      'src',
      'lib',
      'double-elimination.ts',
    );
    const finalsRoute = readRepoFile(
      'smkc-score-app',
      'src',
      'lib',
      'api-factories',
      'finals-route.ts',
    );

    expect(doubleElimination).toContain('position: match.loserPosition ?? 1');
    expect(doubleElimination).not.toContain('position: match.loserPosition || 1');
    expect(finalsRoute).toContain('const loserPosition = currentBracketMatch.loserPosition ?? 1;');
    expect(finalsRoute).not.toContain('const loserPosition = currentBracketMatch.loserPosition || 1;');
  });
});
