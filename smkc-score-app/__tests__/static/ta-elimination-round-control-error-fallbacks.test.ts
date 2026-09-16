import fs from 'fs';
import path from 'path';

const read = (...parts: string[]) => fs.readFileSync(path.join(process.cwd(), ...parts), 'utf8');

describe('TA elimination round-control error fallback contract (issue #3596)', () => {
  const source = read('src', 'components', 'tournament', 'ta-elimination-phase.tsx');

  it('preserves concrete API errors and localizes generic HTTP failures', () => {
    expect(source).toContain("setSaveError(errorData.error || tCommon('networkError'));");
    expect(source).not.toContain("errorData.error || 'Failed to start round'");
    expect(source).not.toContain("errorData.error || 'Failed to cancel round'");
    expect(source).not.toContain("errorData.error || 'Failed to undo round'");
  });

  it('logs rejected requests without exposing raw browser error messages to users', () => {
    expect(source).toContain("logger.error('Failed to start TA elimination round:'");
    expect(source).toContain("logger.error('Failed to cancel TA elimination round:'");
    expect(source).toContain("logger.error('Failed to undo TA elimination round:'");
    expect(source).toContain("logger.error('Failed to cancel the last TA elimination round:'");
    expect(source).toContain("setSaveError(tCommon('networkError'));");
    expect(source).not.toContain("err instanceof Error ? err.message : 'Failed to start round'");
    expect(source).not.toContain("err instanceof Error ? err.message : 'Failed to cancel round'");
    expect(source).not.toContain("err instanceof Error ? err.message : 'Failed to undo round'");
  });
});
