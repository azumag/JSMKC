import fs from 'fs';
import path from 'path';

const read = (...parts: string[]) => fs.readFileSync(path.join(process.cwd(), ...parts), 'utf8');

describe('TA finals round-control error fallback contract (issue #3596 / #3864)', () => {
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

  it('fails closed on HTTP errors without parsing or exposing backend prose', () => {
    for (const block of [startRound, cancelRound, undoRound, cancelLastRound]) {
      expect(block).toContain("setSaveError(tCommon('networkError'));");
      expect(block).toContain('status: response.status');
      expect(block).not.toContain('errorData.error');
      expect(block).not.toContain('response.json().catch');
    }
  });

  it('keeps safe diagnostics and transport fallback behavior', () => {
    expect(startRound).toContain("logger.error('Failed to start TA phase3 round:'");
    expect(cancelRound).toContain("logger.error('Failed to cancel TA phase3 round:'");
    expect(undoRound).toContain("logger.error('Failed to undo TA phase3 round:'");
    expect(cancelLastRound).toContain("logger.error('Failed to cancel the last TA phase3 round:'");
    for (const block of [startRound, cancelRound, undoRound, cancelLastRound]) {
      expect(block).not.toContain('err instanceof Error ? err.message');
    }
  });
});
