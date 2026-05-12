import fs from 'fs';
import path from 'path';

const root = path.join(process.cwd(), '..');

function readRepoFile(...parts: string[]) {
  return fs.readFileSync(path.join(root, ...parts), 'utf8');
}

function sectionFor(source: string, tc: string) {
  const heading = new RegExp(`^## ${tc}:`, 'm');
  const match = heading.exec(source);
  expect(match).toBeTruthy();

  const start = match!.index;
  const next = source.slice(start + 1).search(/\n## TC-/);
  const end = next === -1 ? source.length : start + 1 + next;
  return source.slice(start, end);
}

describe('TC-1090-1091 overall-ranking static guard', () => {
  it('documents the overall-ranking follow-up scenario', () => {
    const section = sectionFor(readRepoFile('E2E_TEST_CASES.md'), 'TC-1090-1091');

    expect(section).toContain('issue #1090/#1091');
    expect(section).toContain('hasCompletedRealQualificationMatch');
    expect(section).toContain('Record<MatchQualificationModel');
    expect(section).toContain('BREAK-like');
    expect(section).toContain('__tests__/lib/points/overall-ranking.test.ts');
  });

  it('keeps match-model lookup exhaustive instead of defaulting to GP', () => {
    const source = readRepoFile('smkc-score-app', 'src', 'lib', 'points', 'overall-ranking.ts');
    const helperStart = source.indexOf('async function hasCompletedRealQualificationMatch');
    expect(helperStart).toBeGreaterThanOrEqual(0);
    const helperEnd = source.indexOf('\nfunction qualificationResultsByPlayer', helperStart);
    expect(helperEnd).toBeGreaterThan(helperStart);
    const helper = source.slice(helperStart, helperEnd);

    expect(helper).toContain('Record<MatchQualificationModel');
    expect(helper).toContain('bMMatch: () => prisma.bMMatch.findMany');
    expect(helper).toContain('mRMatch: () => prisma.mRMatch.findMany');
    expect(helper).toContain('gPMatch: () => prisma.gPMatch.findMany');
    expect(helper).not.toContain(': await prisma.gPMatch.findMany');
  });
});
