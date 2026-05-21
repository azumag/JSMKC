import { readRepoFile } from '../helpers/e2e-cases';

describe('TC-2040 TA phases sequential read comment history', () => {
  const source = readRepoFile('smkc-score-app', 'src', 'app', 'api', 'tournaments', '[id]', 'ta', 'phases', 'route.ts');

  function sequentialReadComment() {
    const commentStart = source.indexOf('Keep these phase-detail reads sequential');
    const commentEnd = source.indexOf('*/', commentStart);

    expect(commentStart).toBeGreaterThanOrEqual(0);
    expect(commentEnd).toBeGreaterThan(commentStart);

    return source.slice(commentStart, commentEnd);
  }

  it('keeps the observed D1 request-hung history in the comment', () => {
    const comment = sequentialReadComment();

    expect(comment).toContain('Preview/production D1');
    expect(comment).toContain('D1 concurrent fan-out');
    expect(comment).toContain('has repeatedly produced request-hung failures');
    expect(comment).toContain('latency trade-off');
  });

  it('keeps the comment about behavior instead of the comment itself', () => {
    const comment = sequentialReadComment();

    expect(comment).not.toContain('Keep this');
    expect(comment).not.toContain('behavior note');
    expect(comment).not.toContain('comment');
  });

  it('keeps the guarded D1 read block sequential', () => {
    const comment = sequentialReadComment();
    const commentEnd = source.indexOf('*/', source.indexOf(comment));
    const blockEndMarker = 'End of the D1 read section';
    const blockEnd = source.indexOf(blockEndMarker, commentEnd);

    if (blockEnd === -1) {
      throw new Error(`expected marker "${blockEndMarker}" to exist for D1 section boundary`);
    }

    const phaseDetailReadBlock = source.slice(commentEnd, blockEnd);
    expect(phaseDetailReadBlock).toContain('retryDbRead');
    expect(phaseDetailReadBlock).not.toContain('Promise.all');
  });
});
