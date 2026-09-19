import fs from 'fs';
import path from 'path';

const eliminationSource = fs.readFileSync(
  path.join(process.cwd(), 'src/components/tournament/ta-elimination-phase.tsx'),
  'utf8',
);
const phase3Source = fs.readFileSync(path.join(process.cwd(), 'src/app/tournaments/[id]/ta/finals/page.tsx'), 'utf8');

function getFetchDataBlock(source: string): string {
  const start = source.indexOf('const fetchData = useCallback');
  const end = source.indexOf('// Initial fetch', start);

  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe('TA finals fetch error fallback contract (issue #3632 / #3864)', () => {
  // Keep this title stable because the E2E documentation drift guard registers it by name.
  it('preserves concrete API errors and localizes transport and parse failures', () => {
    const fetchData = getFetchDataBlock(phase3Source);

    expect(fetchData).toContain("setError(tCommon('networkError'));");
    expect(fetchData).toContain("logger.error('Failed to fetch data:'");
    expect(fetchData).toContain('status: response.status');
    expect(fetchData).not.toContain('errorData.error');
    expect(fetchData).not.toContain('response.json().catch');
    expect(fetchData).not.toContain('err instanceof Error ? err.message');
  });

  it('keeps the Phase 1/2 legacy contract visible until the remaining #3864 slice lands', () => {
    const fetchData = getFetchDataBlock(eliminationSource);

    expect(fetchData).toContain("setError(errorData.error || tCommon('networkError'));");
    expect(fetchData).toContain("setError(tCommon('networkError'));");
    expect(fetchData).toContain("logger.error('Failed to fetch data:'");
    expect(fetchData).toContain('status: response.status');
    expect(fetchData).not.toContain('err instanceof Error ? err.message');
  });
});
