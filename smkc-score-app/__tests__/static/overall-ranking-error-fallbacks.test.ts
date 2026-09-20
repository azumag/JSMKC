import fs from 'fs';
import path from 'path';

const source = fs.readFileSync(
  path.join(process.cwd(), 'src', 'app', 'tournaments', '[id]', 'overall-ranking', 'page.tsx'),
  'utf8',
);

describe('overall ranking client error fallback contract (issue #3870)', () => {
  it('redacts backend prose from fetch and polling failures', () => {
    expect(source).toContain("logger.error('Overall ranking fetch returned non-2xx', {");
    expect(source).toContain('status: response.status');
    expect(source).toContain('throw new GenericOverallRankingError();');
    expect(source).toContain("super('overall-ranking-load-failed');");
    expect(source).toContain("setError(pollError ? tCommon('networkError') : null);");
    expect(source).toContain("tCommon('networkError')");
    expect(source).not.toContain('pollError.message');
    expect(source).not.toContain('pollError instanceof GenericOverallRankingError');
    expect(source).not.toContain('errorData.error');
    expect(source).not.toContain('throw new Error(data.error);');
    expect(source).not.toContain('throw new Error(errorData.error);');
    expect(source).not.toContain('const errorData = await response.json().catch');
    expect(source).not.toContain('`Failed to fetch rankings: ${response.status}`');
    expect(source).not.toContain("data.error || 'Invalid response format'");
    expect(source).not.toContain("|| 'Unknown error'");
  });

  it('uses common.networkError for recalculation failures without parsing response error details', () => {
    expect(source).toContain("logger.error('Overall ranking recalculation returned non-2xx', {");
    expect(source).toContain("logger.error('Failed to recalculate rankings:', { error: err, tournamentId });");
    expect(source).toContain("setError(tCommon('networkError'));");
    expect(source).not.toContain('setError(errorData.error);');
    expect(source).not.toContain("errorData.error || 'Failed to recalculate rankings'");
    expect(source).not.toContain("err instanceof Error ? err.message : 'Failed to recalculate'");
  });
});
