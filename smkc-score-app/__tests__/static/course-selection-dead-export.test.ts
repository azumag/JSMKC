import { readRepoFile } from '../helpers/e2e-cases';

describe('TA course-selection public API', () => {
  it('exposes getPlayedCoursesWithSuddenDeath and hides obsolete getPlayedCourses', () => {
    const helper = readRepoFile('smkc-score-app', 'src', 'lib', 'ta', 'course-selection.ts');

    expect(helper).toMatch(/\bexport\s+async\s+function\s+getPlayedCoursesWithSuddenDeath\s*\(/);
    expect(helper).not.toMatch(/\bexport\s+async\s+function\s+getPlayedCourses\s*\(/);
  });
});
