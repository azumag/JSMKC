import { e2eCaseSection, readRepoFile, sectionBetween } from '../helpers/e2e-cases';

describe('TC-1032 phase3 revival comment coverage', () => {
  const finalsPhaseManager = readRepoFile('smkc-score-app', 'src', 'lib', 'ta', 'finals-phase-manager.ts');
  const tcTa = readRepoFile('smkc-score-app', 'e2e', 'tc-ta.js');

  it('keeps the review follow-up represented as a runnable E2E scenario', () => {
    const section = e2eCaseSection('TC-1032');

    expect(section).toContain('issue #1032');
    expect(section).toContain('リセット閾値');
    expect(section).toContain('ゼロライフ候補3名すべて');
    expect(tcTa).toContain("{ name: 'TC-1032', fn: runTc1032 }");
    expect(tcTa).toContain('apiUpdateTaLives');
    const tc1032Runner = sectionBetween(
      tcTa,
      'async function runTc1032(adminPage) {',
      '/* ───────── TC-815:',
    );
    expect(tc1032Runner).toContain('Phase3 entries start with 3 lives');
    expect(tc1032Runner).toContain('to 1 life so one more bottom-half loss makes each of them a zero-life');
  });
});
