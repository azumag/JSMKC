import fs from 'fs';
import path from 'path';

const source = fs.readFileSync(
  path.join(process.cwd(), 'src', 'app', 'tournaments', '[id]', 'overall-ranking', 'page.tsx'),
  'utf8',
);

describe('overall ranking client error fallback contract (issue #3586)', () => {
  it('keeps concrete API errors while localizing generic polling failures', () => {
    expect(source).toContain("if (typeof errorData.error === 'string' && errorData.error.trim())");
    expect(source).toContain('throw new Error(errorData.error);');
    expect(source).toContain('pollError instanceof GenericOverallRankingError');
    expect(source).toContain("tCommon('networkError')");
    expect(source).not.toContain('`Failed to fetch rankings: ${response.status}`');
    expect(source).not.toContain("data.error || 'Invalid response format'");
    expect(source).not.toContain("|| 'Unknown error'");
  });

  it('uses common.networkError for generic recalculation failures without exposing runtime messages', () => {
    expect(source).toContain('setError(errorData.error);');
    expect(source).toContain('Overall ranking recalculation returned non-2xx without an API error');
    expect(source).toContain("logger.error('Failed to recalculate rankings:', { error: err, tournamentId });");
    expect(source).not.toContain("errorData.error || 'Failed to recalculate rankings'");
    expect(source).not.toContain("err instanceof Error ? err.message : 'Failed to recalculate'");
  });
});
