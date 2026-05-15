import { e2eCaseSection, readRepoFile } from '../helpers/e2e-cases';

describe('TC-1005 CourseCycleStatusPanel contract', () => {
  const panelSource = readRepoFile(
    'smkc-score-app',
    'src',
    'components',
    'tournament',
    'course-cycle-status-panel.tsx',
  );
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

  it('documents the shared TA course-cycle panel scenario', () => {
    const section = e2eCaseSection('TC-1005');

    expect(section).toContain('issue #1005');
    expect(section).toContain('CourseCycleStatusPanel');
    expect(section).toContain('availableCoursesCount');
    expect(section).toContain('tc-1005-course-cycle-panel-contract.test.ts');
  });

  it('keeps the duplicated TA course-cycle markup in one component', () => {
    expect(panelSource).toContain('export function CourseCycleStatusPanel');
    expect(panelSource).toContain('t("courseCycleLabel")');
    expect(panelSource).toContain('availableCoursesCount');

    expect(finalsPageSource).toContain('<CourseCycleStatusPanel');
    expect(eliminationSource).toContain('<CourseCycleStatusPanel');
    expect(finalsPageSource).not.toContain("tTaFinals('courseCycleLabel')");
    expect(eliminationSource).not.toContain("tElim('courseCycleLabel')");
  });
});
