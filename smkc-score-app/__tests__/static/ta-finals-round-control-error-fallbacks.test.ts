import fs from 'fs';
import path from 'path';

const read = (...parts: string[]) => fs.readFileSync(path.join(process.cwd(), ...parts), 'utf8');

describe('TA finals round-control error fallback contract (issue #3596)', () => {
  const source = read('src', 'app', 'tournaments', '[id]', 'ta', 'finals', 'page.tsx');

  const handler = (start: string, end: string) => {
    const startIndex = source.indexOf(start);
    const endIndex = source.indexOf(end, startIndex + start.length);
    expect(startIndex).toBeGreaterThanOrEqual(0);
    expect(endIndex).toBeGreaterThan(startIndex);
    return source.slice(startIndex, endIndex);
  };

  const startRound = handler('const handleStartRound', 'const handleCancelRound');
  const cancelRound = handler('const handleCancelRound', 'const handleUndoRound');
  const undoRound = handler('const handleUndoRound', 'const handleCancelLastRound');
  const cancelLastRound = handler('const handleCancelLastRound', 'const handleFillRandomTimes');

  it('preserves concrete API errors and localizes generic HTTP failures', () => {
    for (const block of [startRound, cancelRound, undoRound, cancelLastRound]) {
      expect(block).toContain("setSaveError(errorData.error || tCommon('networkError'));");
    }
    expect(startRound).not.toContain("'Failed to start round'");
    expect(cancelRound).not.toContain("'Failed to cancel round'");
    expect(undoRound).not.toContain("'Failed to undo round'");
    expect(cancelLastRound).not.toContain("'Failed to cancel round'");
  });

  it('logs rejected requests and exposes only common.networkError to users', () => {
    expect(startRound).toContain("logger.error('Failed to start TA phase3 round:'");
    expect(cancelRound).toContain("logger.error('Failed to cancel TA phase3 round:'");
    expect(undoRound).toContain("logger.error('Failed to undo TA phase3 round:'");
    expect(cancelLastRound).toContain("logger.error('Failed to cancel the last TA phase3 round:'");
    for (const block of [startRound, cancelRound, undoRound, cancelLastRound]) {
      expect(block).toContain("setSaveError(tCommon('networkError'));");
      expect(block).not.toContain('err instanceof Error ? err.message');
    }
  });
});
