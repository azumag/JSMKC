import { readRepoFile } from '../helpers/e2e-cases';

describe('TA course-selection public API', () => {
  it('does not expose the obsolete single-phase getPlayedCourses helper', () => {
    const helper = readRepoFile('smkc-score-app', 'src', 'lib', 'ta', 'course-selection.ts');
    const phasesRouteTest = readRepoFile(
      'smkc-score-app',
      '__tests__',
      'app',
      'api',
      'tournaments',
      '[id]',
      'ta',
      'phases',
      'route.test.ts',
    );

    expect(helper).not.toMatch(/\bexport\s+async\s+function\s+getPlayedCourses\s*\(/);
    expect(phasesRouteTest).not.toContain('getPlayedCourses: jest.fn()');
  });
});
