import { e2eCaseSection, readRepoFile } from '../helpers/e2e-cases';

function precedingJsdocForFunction(source: string, functionName: string) {
  const functionMarker = `export function ${functionName}`;
  const functionIndex = source.indexOf(functionMarker);
  expect(functionIndex).toBeGreaterThanOrEqual(0);

  const beforeFunction = source.slice(0, functionIndex);
  const jsdocStart = beforeFunction.lastIndexOf('/**');
  const jsdocEnd = beforeFunction.lastIndexOf('*/');

  expect(jsdocStart).toBeGreaterThanOrEqual(0);
  expect(jsdocEnd).toBeGreaterThan(jsdocStart);
  expect(beforeFunction.slice(jsdocEnd + 2).trim()).toBe('');

  return beforeFunction.slice(jsdocStart, jsdocEnd + 2);
}

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

  it('keeps the getQualificationPoints JSDoc focused on the non-obvious why', () => {
    const section = e2eCaseSection('TC-1652');
    const jsdoc = precedingJsdocForFunction(pointsLib, 'getQualificationPoints');

    expect(section).toContain('issue #1652');
    expect(section).toContain('@param');
    expect(section).toContain('@returns');
    expect(section).toContain('drift 防止');
    for (const mode of ['BM', 'MR', 'GP'] as const) {
      expect(jsdoc).toContain(mode);
    }
    expect(jsdoc).toMatch(/page[- ]client/i);
    // Stem match: centraliz(e|ed|ation) keeps the why guard wording-tolerant.
    expect(jsdoc).toMatch(/drift|sync|centraliz/i);
    expect(jsdoc).not.toContain('@param');
    expect(jsdoc).not.toContain('@returns');
  });

  it('keeps the JSDoc guard adjacent to the target function', () => {
    const section = e2eCaseSection('TC-1654');

    expect(section).toContain('issue #1654/#1655');
    expect(section).toContain('const unrelated = true;');
    expect(() => precedingJsdocForFunction(`
      /**
       * BM/MR/GP page-client components remain centralized.
       */
      const unrelated = true;
      export function getQualificationPoints() {}
    `, 'getQualificationPoints')).toThrow();
  });

  it('documents the centraliz stem match used by the why guard', () => {
    const section = e2eCaseSection('TC-1657');
    const source = readRepoFile(
      'smkc-score-app',
      '__tests__',
      'static',
      'tc-1024-qualification-points-helper.test.ts',
    );
    const stemCommentNeedle = 'centraliz' + '(e|ed|ation)';

    expect(section).toContain('issue #1657');
    expect(section).toContain('検索語を分割');
    expect(source).toContain(`// Stem match: ${stemCommentNeedle}`);
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
