import fs from 'fs';
import path from 'path';

const read = (...parts: string[]) => fs.readFileSync(path.join(process.cwd(), ...parts), 'utf8');

function block(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe('TA elimination round-control error fallback contract (issues #3596 / #3864)', () => {
  const source = read('src', 'components', 'tournament', 'ta-elimination-phase.tsx');

  it.each([
    ['start', 'const handleStartRound', '/**\n   * Cancel the current round'],
    ['cancel', 'const handleCancelRound', '/**\n   * Undo the last submitted round'],
    ['undo', 'const handleUndoRound', '/**\n   * Cancel the last submitted round entirely'],
    ['cancel last', 'const handleCancelLastRound', '/**\n   * Fill random times'],
  ])('fails closed for %s round-control HTTP failures', (_label, startMarker, endMarker) => {
    const handler = block(source, startMarker, endMarker);

    expect(handler).toContain('status: response.status');
    expect(handler).toContain("setSaveError(tCommon('networkError'));");
    expect(handler).not.toContain('errorData.error');
    expect(handler).not.toContain('response.json().catch');
  });

  it('keeps safe diagnostic logging without exposing raw browser errors to users', () => {
    expect(source).toContain("logger.error('Failed to start TA elimination round:'");
    expect(source).toContain("logger.error('Failed to cancel TA elimination round:'");
    expect(source).toContain("logger.error('Failed to undo TA elimination round:'");
    expect(source).toContain("logger.error('Failed to cancel the last TA elimination round:'");
    expect(source).not.toContain("err instanceof Error ? err.message : 'Failed to start round'");
    expect(source).not.toContain("err instanceof Error ? err.message : 'Failed to cancel round'");
    expect(source).not.toContain("err instanceof Error ? err.message : 'Failed to undo round'");
  });
});
