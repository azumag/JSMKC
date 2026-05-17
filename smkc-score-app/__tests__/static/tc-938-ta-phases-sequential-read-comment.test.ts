import { readRepoFile } from '../helpers/e2e-cases';

describe('TC-938 TA phases sequential read comment', () => {
  const source = readRepoFile('smkc-score-app', 'src', 'app', 'api', 'tournaments', '[id]', 'ta', 'phases', 'route.ts');

  it('documents why phase detail reads stay sequential', () => {
    const commentStart = source.indexOf('Keep these phase-detail reads sequential');
    const commentEnd = source.indexOf('*/', commentStart);
    const blockEnd = source.indexOf('const normalizedRounds = rounds.map(normalizePhaseRound);', commentEnd);
    const phaseDetailReadBlock = source.slice(commentEnd, blockEnd);

    expect(commentStart).toBeGreaterThanOrEqual(0);
    expect(commentEnd).toBeGreaterThan(commentStart);
    expect(blockEnd).toBeGreaterThan(commentEnd);
    expect(source).toContain('D1 concurrent fan-out');
    expect(source).toContain('request-hung');
    expect(source).toContain('latency trade-off');
    expect(phaseDetailReadBlock).toContain('retryDbRead');
    expect(phaseDetailReadBlock).not.toContain('Promise.all');
  });
});
