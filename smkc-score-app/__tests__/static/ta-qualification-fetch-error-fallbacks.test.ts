import fs from 'fs';
import path from 'path';

const source = fs.readFileSync(path.join(process.cwd(), 'src/app/tournaments/[id]/ta/page-client.tsx'), 'utf8');

function getFetchTournamentDataBlock(): string {
  const start = source.indexOf('const fetchTournamentData = useCallback');
  const end = source.indexOf('/*\n   * Poll at the standard interval', start);

  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe('TA qualification fetch error fallback contract (issue #3645/#3842/#3933)', () => {
  it('localizes HTTP and transport load failures without parsing backend error details', () => {
    const fetchBlock = getFetchTournamentDataBlock();

    expect(fetchBlock).toContain("throw new Error(tc('networkError'));");
    expect(fetchBlock).toContain("logger.error('Failed to load TA qualification data:'");
    expect(fetchBlock).toContain('status: taResponse.status');
    expect(fetchBlock).not.toContain('errorData.error');
    expect(fetchBlock).not.toContain('Failed to parse TA qualification error response:');
    expect(fetchBlock).not.toContain('TA qualification fetch returned a generic error response:');
    expect(fetchBlock).toContain("logger.error('Failed to parse TA qualification response:'");
    expect(fetchBlock).not.toContain('Failed to fetch TA data:');
    expect(fetchBlock).not.toContain('fetchAllPlayersForSetup');
    expect(fetchBlock).not.toContain('resolveAllPlayers');
    expect(fetchBlock).toContain('}, [tc, tournamentId]);');
  });

  it('clears stale polling errors after a successful retry', () => {
    expect(source).toContain('setError(pollError?.message ?? null);');
    expect(source).not.toContain('setError(pollError);');
  });

  it('keeps the existing polling interval and cache contract', () => {
    expect(source).toContain('interval: POLLING_INTERVAL,');
    expect(source).toContain('cacheKey: `tournament/${tournamentId}/ta`,');
    expect(source).toContain('initialData,');
  });
});
