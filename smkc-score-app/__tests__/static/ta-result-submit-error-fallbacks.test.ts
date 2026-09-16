import fs from 'fs';
import path from 'path';

const read = (...parts: string[]) => fs.readFileSync(path.join(process.cwd(), ...parts), 'utf8');

describe('TA result submit error fallback contract (issue #3590)', () => {
  it('localizes Phase 3 generic failures while preserving concrete API errors', () => {
    const source = read('src', 'app', 'tournaments', '[id]', 'ta', 'finals', 'page.tsx');
    expect(source).toContain("setSaveError(errorData.error || tCommon('networkError'));");
    expect(source).toContain("logger.error('Failed to submit TA phase3 results:'");
    expect(source).toContain("setSaveError(tCommon('networkError'));");
    expect(source).not.toContain("errorData.error || 'Failed to submit results'");
    expect(source).not.toContain("submitError instanceof Error ? submitError.message : 'Failed to submit results'");
  });

  it('localizes Phase 1/2 generic failures while preserving concrete API errors', () => {
    const source = read('src', 'components', 'tournament', 'ta-elimination-phase.tsx');
    expect(source).toContain("setSaveError(errorData.error || tCommon('networkError'));");
    expect(source).toContain("logger.error('Failed to submit TA elimination results:'");
    expect(source).toContain("setSaveError(tCommon('networkError'));");
    expect(source).not.toContain("errorData.error || 'Failed to submit results'");
    expect(source).not.toContain("err instanceof Error ? err.message : 'Failed to submit results'");
  });
});
