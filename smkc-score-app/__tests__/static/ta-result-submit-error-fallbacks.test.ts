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

describe('TA result submit error fallback contract (issue #3590 / #3864)', () => {
  it('fails closed for Phase 3 HTTP failures while preserving safe diagnostics', () => {
    const source = read('src', 'app', 'tournaments', '[id]', 'ta', 'finals', 'page.tsx');
    const submit = block(source, 'const confirmSubmitResults', 'const {\n    pendingSuddenDeath');

    expect(submit).toContain("logger.error('Failed to submit TA phase3 results:'");
    expect(submit).toContain('status: response.status');
    expect(submit).toContain("setSaveError(tCommon('networkError'));");
    expect(submit).not.toContain('errorData.error');
    expect(submit).not.toContain('response.json().catch');
    expect(submit).not.toContain("submitError instanceof Error ? submitError.message : 'Failed to submit results'");
  });

  it('keeps the Phase 1/2 legacy contract visible until the remaining #3864 slice lands', () => {
    const source = read('src', 'components', 'tournament', 'ta-elimination-phase.tsx');
    expect(source).toContain("setSaveError(errorData.error || tCommon('networkError'));");
    expect(source).toContain("logger.error('Failed to submit TA elimination results:'");
    expect(source).toContain("setSaveError(tCommon('networkError'));");
    expect(source).not.toContain("errorData.error || 'Failed to submit results'");
    expect(source).not.toContain("err instanceof Error ? err.message : 'Failed to submit results'");
  });
});
