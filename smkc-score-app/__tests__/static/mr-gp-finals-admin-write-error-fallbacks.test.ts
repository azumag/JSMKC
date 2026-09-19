import fs from 'fs';
import path from 'path';

const sources = {
  mr: fs.readFileSync(path.join(process.cwd(), 'src/app/tournaments/[id]/mr/finals/page.tsx'), 'utf8'),
  gp: fs.readFileSync(path.join(process.cwd(), 'src/app/tournaments/[id]/gp/finals/page.tsx'), 'utf8'),
};

function getHandlerBlock(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);

  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

function getNonOkReturnBranch(handler: string): string {
  const start = handler.indexOf('if (!response.ok) {');
  const returnAt = handler.indexOf('return;', start);

  expect(start).toBeGreaterThanOrEqual(0);
  expect(returnAt).toBeGreaterThan(start);
  return handler.slice(start, returnAt + 'return;'.length);
}

function getElseFailureBranch(handler: string): string {
  const start = handler.lastIndexOf('} else {');
  const catchAt = handler.indexOf('} catch', start);

  expect(start).toBeGreaterThanOrEqual(0);
  expect(catchAt).toBeGreaterThan(start);
  return handler.slice(start, catchAt);
}

describe('MR/GP finals admin write error fallbacks (issue #3889)', () => {
  const mrTvHandler = getHandlerBlock(
    sources.mr,
    'const handleBracketTvNumberChange = async',
    'const openMatchDialog =',
  );
  const mrSubmitHandler = getHandlerBlock(
    sources.mr,
    'const handleMatchSubmit = async',
    'const qualificationConfirmed',
  );
  const gpTvHandler = getHandlerBlock(
    sources.gp,
    'const handleBracketTvNumberChange = async',
    'const openScoreDialog =',
  );
  const gpScoreHandler = getHandlerBlock(sources.gp, 'const handleScoreSubmit = async', 'const qualificationConfirmed');

  it.each([
    ['MR TV assignment', getNonOkReturnBranch(mrTvHandler), 'assign_tv', 'mr', 'failedAssignTv'],
    ['MR match update', getElseFailureBranch(mrSubmitHandler), 'update_match', 'mr', 'failedUpdateMatch'],
    ['GP TV assignment', getNonOkReturnBranch(gpTvHandler), 'assign_tv', 'gp', 'failedAssignTv'],
    ['GP score update', getElseFailureBranch(gpScoreHandler), 'update_score', 'gp', 'failedUpdateScore'],
  ])('keeps %s HTTP failures fail-closed', (_label, failureBranch, operation, mode, fallbackKey) => {
    expect(failureBranch).toContain(`operation: '${operation}'`);
    expect(failureBranch).toContain(`mode: '${mode}'`);
    expect(failureBranch).toContain('tournamentId');
    expect(failureBranch).toContain('matchId:');
    expect(failureBranch).toContain('status: response.status');
    expect(failureBranch).toContain(`tFinals('${fallbackKey}')`);
    expect(failureBranch).not.toContain('response.json()');
    expect(failureBranch).not.toContain('error.error');
    expect(failureBranch).not.toContain('error?.error');
  });

  it('preserves MR result success parsing, optimistic versioning, progression refresh, and champion update', () => {
    expect(mrSubmitHandler).toContain('const json = await response.json();');
    expect(mrSubmitHandler).toContain('expectedVersion: selectedMatch.version');
    expect(mrSubmitHandler).toContain('setPlayoffComplete(data.playoffComplete);');
    expect(mrSubmitHandler).toContain('setChampion(champPlayer);');
    expect(mrSubmitHandler).toContain('refetch();');
  });

  it('preserves GP score success parsing, optimistic versioning, progression refresh, and champion update', () => {
    expect(gpScoreHandler).toContain('const json = await response.json();');
    expect(gpScoreHandler).toContain('expectedVersion: selectedMatch.version');
    expect(gpScoreHandler).toContain('setPlayoffComplete(data.playoffComplete);');
    expect(gpScoreHandler).toContain('setChampion(champPlayer);');
    expect(gpScoreHandler).toContain('refetch();');
  });
});
