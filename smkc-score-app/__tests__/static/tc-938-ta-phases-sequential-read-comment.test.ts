import { readRepoFile } from '../helpers/e2e-cases';

describe('TC-938 TA phases sequential read comment', () => {
  const source = readRepoFile('smkc-score-app', 'src', 'app', 'api', 'tournaments', '[id]', 'ta', 'phases', 'route.ts');

  it('documents why phase detail reads stay sequential', () => {
    const commentStart = source.indexOf('Keep these phase-detail reads sequential');
    const commentEnd = source.indexOf('*/', commentStart);
    const blockEndMarker = 'End of the D1 read section';
    const blockEnd = source.indexOf(blockEndMarker, commentEnd);
    const phaseDetailReadBlock = source.slice(commentEnd, blockEnd);

    expect(commentStart).toBeGreaterThanOrEqual(0);
    expect(commentEnd).toBeGreaterThan(commentStart);
    if (blockEnd === -1) {
      throw new Error(`expected marker \"${blockEndMarker}\" to exist for D1 section boundary`);
    }
    expect(blockEnd).toBeGreaterThan(commentEnd);
    expect(source).toContain('D1 concurrent fan-out');
    expect(source).toContain('request-hung');
    expect(source).toContain('latency trade-off');
    expect(phaseDetailReadBlock).toContain('retryDbRead');
    expect(phaseDetailReadBlock).not.toContain('Promise.all');

    const firstReadIndex = phaseDetailReadBlock.indexOf('retryDbRead');
    const secondReadIndex = phaseDetailReadBlock.indexOf('retryDbRead', firstReadIndex + 1);
    const thirdReadIndex = phaseDetailReadBlock.indexOf('retryDbRead', secondReadIndex + 1);

    expect(firstReadIndex).toBeGreaterThanOrEqual(0);
    expect(secondReadIndex).toBeGreaterThan(firstReadIndex);
    expect(thirdReadIndex).toBeGreaterThan(secondReadIndex);
  });
});
