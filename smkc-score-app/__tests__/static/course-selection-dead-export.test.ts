import { readRepoFile } from '../helpers/e2e-cases';

describe('TA course-selection public API', () => {
  it('does not expose the obsolete single-phase getPlayedCourses helper', () => {
    const helper = readRepoFile('smkc-score-app', 'src', 'lib', 'ta', 'course-selection.ts');

    expect(helper).not.toMatch(/\bexport\s+async\s+function\s+getPlayedCourses\s*\(/);
  });
});
