import { e2eCaseSection, readRepoFile } from '../helpers/e2e-cases';

describe('TC-1004 CourseCycleStatus contract', () => {
  const helperSource = readRepoFile('smkc-score-app', 'src', 'lib', 'ta', 'course-cycle-status.ts');
  const finalsPageSource = readRepoFile(
    'smkc-score-app',
    'src',
    'app',
    'tournaments',
    '[id]',
    'ta',
    'finals',
    'page.tsx',
  );
  const eliminationSource = readRepoFile(
    'smkc-score-app',
    'src',
    'components',
    'tournament',
    'ta-elimination-phase.tsx',
  );

  it('documents the YAGNI contract in the E2E scenario list', () => {
    const section = e2eCaseSection('TC-1004');

    expect(section).toContain('issue #1004');
    expect(section).toContain('availableCount');
    expect(section).toContain('availableCourses.length');
    expect(section).toContain('tc-1004-course-cycle-status-contract.test.ts');
  });

  it('keeps CourseCycleStatus limited to fields that the TA UI consumes', () => {
    expect(helperSource).toContain('export interface CourseCycleStatus');
    expect(helperSource).not.toContain('availableCount');
    expect(helperSource).toContain('cycleNumber: number');
    expect(helperSource).toContain('playedInCycle: number');
    expect(helperSource).toContain('totalCourses: number');
    expect(helperSource).toContain('totalPlayed: number');
  });

  it('keeps available course count display sourced from the server-calculated list length', () => {
    expect(finalsPageSource).toContain('count: availableCourses.length');
    expect(eliminationSource).toContain('count: availableCourses.length');
    expect(finalsPageSource).not.toContain('courseCycleStatus.availableCount');
    expect(eliminationSource).not.toContain('courseCycleStatus.availableCount');
  });
});
