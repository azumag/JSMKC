import fs from 'fs';
import path from 'path';

const helper = fs.readFileSync(path.join(process.cwd(), 'src/lib/shared-match-page-data.ts'), 'utf8');
const pagePaths = [
  'src/app/tournaments/[id]/bm/match/[matchId]/page.tsx',
  'src/app/tournaments/[id]/mr/match/[matchId]/page.tsx',
  'src/app/tournaments/[id]/gp/match/[matchId]/page.tsx',
];
const pages = pagePaths.map((filePath) => fs.readFileSync(path.join(process.cwd(), filePath), 'utf8'));

describe('shared match detail load error contract (issue #3647)', () => {
  it('distinguishes not-found from generic transport/load failures', () => {
    expect(helper).toContain('matchResponse.status === 404 || tournamentResponse.status === 404');
    expect(helper).toContain('throw new SharedMatchNotFoundError();');
    expect(helper).toContain('throw new SharedMatchLoadError();');
    expect(helper).toContain("logger.error('Shared match page fetch returned a generic error response'");
    expect(helper).toContain("logger.error('Failed to load shared match page data'");
    expect(helper).toContain('message: error.message');
    expect(helper).toContain('stack: error.stack');
  });

  it('keeps the existing endpoints and response unwrapping in the shared loader', () => {
    expect(helper).toContain('`/api/tournaments/${tournamentId}/${modePath}/match/${matchId}`');
    expect(helper).toContain('`/api/tournaments/${tournamentId}?fields=summary`');
    expect(helper).toContain('match: (matchJson.data ?? matchJson) as TMatch');
    expect(helper).toContain('tournament: (tournamentJson.data ?? tournamentJson) as TTournament');
  });

  it.each(pages)('shows localized initial-load errors with retry without hiding stale polling data', (page) => {
    expect(page).toContain('error: pollError,');
    expect(page).toContain('refetch,');
    expect(page).toContain('if (pollError && !pollData)');
    expect(page).toContain('isSharedMatchNotFoundError(pollError)');
    expect(page).toContain("tMatch('matchNotFound')");
    expect(page).toContain("tCommon('networkError')");
    expect(page).toContain("tCommon('tryAgain')");
    expect(page).toContain('onClick={() => void refetch()}');
    expect(page).toContain('interval: POLLING_INTERVAL,');
    expect(page).not.toMatch(/Failed to fetch (BM|MR|GP) match data:/);
  });
});
