import { e2eCaseSection, readRepoFile, sectionBetween } from '../helpers/e2e-cases';

describe('TC-1032 phase3 revival comment coverage', () => {
  const finalsPhaseManager = readRepoFile('smkc-score-app', 'src', 'lib', 'ta', 'finals-phase-manager.ts');
  const tcTa = readRepoFile('smkc-score-app', 'e2e', 'tc-ta.js');

  it('keeps the simultaneous-elimination revival branch justified in source comments', () => {
    const branch = sectionBetween(
      finalsPhaseManager,
      'if (eliminationCandidates.length > eliminationLimit) {',
      'const boundarySafe = sorted[halfwayPoint - 1];',
    );

    expect(branch).toContain(
      'Zero-life overflows at a reset threshold must send every candidate to sudden death',
    );
    expect(branch).toContain(
      'partially ordering only the slowest players can still drop the active field below the reset size',
    );
  });

  it('keeps the review follow-up represented as a runnable E2E scenario', () => {
    const section = e2eCaseSection('TC-1032');

    expect(section).toContain('issue #1032');
    expect(section).toContain('リセット閾値');
    expect(section).toContain('ゼロライフ候補3名すべて');
    expect(tcTa).toContain("{ name: 'TC-1032', fn: runTc1032 }");
    expect(tcTa).toContain('apiUpdateTaLives');
  });
});
