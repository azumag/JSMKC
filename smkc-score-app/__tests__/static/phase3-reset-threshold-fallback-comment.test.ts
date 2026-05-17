import { readRepoFile, sectionBetween } from '../helpers/e2e-cases';

describe('TA phase3 reset threshold fallback comment', () => {
  it('documents why phase3 falls back to one survivor below configured reset thresholds', () => {
    const source = readRepoFile('smkc-score-app', 'src', 'lib', 'ta', 'finals-phase-manager.ts');
    const helper = sectionBetween(
      source,
      'function getNextPhase3ResetThreshold(activeCount: number): number | null {',
      'function getPhase3EliminationLimit(activeCount: number): number {',
    );

    expect(helper).toContain('no configured reset threshold remains below activeCount');
    expect(helper).toContain('fallback to one survivor');
    expect(helper).toContain('protects the last remaining player');
    expect(helper).toContain('activeCount - 1');
  });
});
