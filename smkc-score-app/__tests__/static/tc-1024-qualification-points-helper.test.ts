import { e2eCaseSection, readRepoFile } from '../helpers/e2e-cases';

describe('TC-1024 shared qualification-points helper', () => {
  const bmPage = readRepoFile(
    'smkc-score-app',
    'src',
    'app',
    'tournaments',
    '[id]',
    'bm',
    'page-client.tsx',
  );
  const mrPage = readRepoFile(
    'smkc-score-app',
    'src',
    'app',
    'tournaments',
    '[id]',
    'mr',
    'page-client.tsx',
  );
  const gpPage = readRepoFile(
    'smkc-score-app',
    'src',
    'app',
    'tournaments',
    '[id]',
    'gp',
    'page-client.tsx',
  );
  const pointsLib = readRepoFile(
    'smkc-score-app',
    'src',
    'lib',
    'points',
    'qualification-points.ts',
  );

  it('documents the shared BM/MR/GP qualification-points scenario', () => {
    const section = e2eCaseSection('TC-1024');

    expect(section).toContain('issue #1019/#1024/#1025');
    expect(section).toContain('getQualificationPoints(mp, score)');
    expect(section).toContain('calculateQualificationPointsFromMatches');
    expect(section).toContain('tc-1024-qualification-points-helper.test.ts');
  });

  it('keeps the display formula centralized in the points library', () => {
    expect(pointsLib).toContain('export function getQualificationPoints');
    expect(pointsLib).toContain('normalizePoints(score, calculateMaxMatchPoints(matchesPlayed))');
  });

  it.each([
    ['BM', bmPage],
    ['MR', mrPage],
    ['GP', gpPage],
  ] as const)('keeps %s page-client on the shared display helper', (_mode, source) => {
    expect(source).toContain('getQualificationPoints');
    expect(source).not.toMatch(/function getQualificationPoints\(/);
    expect(source).not.toContain('calculateMaxMatchPoints');
    expect(source).not.toContain('normalizePoints');
  });
});
