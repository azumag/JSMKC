import fs from 'fs';
import path from 'path';

const eliminationSource = fs.readFileSync(
  path.join(process.cwd(), 'src/components/tournament/ta-elimination-phase.tsx'),
  'utf8',
);
const phase3Source = fs.readFileSync(
  path.join(process.cwd(), 'src/app/tournaments/[id]/ta/finals/page.tsx'),
  'utf8',
);

function getFetchDataBlock(source: string): string {
  const start = source.indexOf('const fetchData = useCallback');
  const end = source.indexOf('// Initial fetch', start);

  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe('TA finals fetch error fallback contract (issue #3632)', () => {
  it.each([
    ['phase1/2', eliminationSource],
    ['phase3', phase3Source],
  ])('%s preserves API errors while localizing transport and parse failures', (_label, source) => {
    const fetchData = getFetchDataBlock(source);

    expect(fetchData).toContain("setError(errorData.error || tCommon('networkError'));");
    expect(fetchData).toContain("setError(tCommon('networkError'));");
    expect(fetchData).toContain("logger.error('Failed to fetch data:'");
    expect(fetchData).toContain('status: response.status');
    expect(fetchData).not.toContain('throw new Error(errorData.error');
    expect(fetchData).not.toContain('err instanceof Error ? err.message');
  });
});
