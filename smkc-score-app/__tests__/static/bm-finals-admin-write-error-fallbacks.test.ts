import fs from 'fs';
import path from 'path';

const source = fs.readFileSync(path.join(process.cwd(), 'src/app/tournaments/[id]/bm/finals/page.tsx'), 'utf8');

function getHandlerBlock(startMarker: string, endMarker: string): string {
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

describe('BM finals admin write error fallbacks (issue #3889)', () => {
  const tvHandler = getHandlerBlock(
    'const handleBracketTvNumberChange = async',
    'const handleBracketStartingCourseChange = async',
  );
  const courseHandler = getHandlerBlock(
    'const handleBracketStartingCourseChange = async',
    '/** Open the score entry dialog',
  );
  const scoreHandler = getHandlerBlock('const handleScoreSubmit = async', '/* Calculate progress counters');

  it.each([
    ['TV assignment', getNonOkReturnBranch(tvHandler), 'assign_tv', 'failedAssignTv'],
    ['starting course', getNonOkReturnBranch(courseHandler), 'assign_starting_course', 'failedAssignCourse'],
    ['score update', getElseFailureBranch(scoreHandler), 'update_score', 'failedUpdateScore'],
  ])('keeps %s HTTP failures fail-closed', (_label, failureBranch, operation, fallbackKey) => {
    expect(failureBranch).toContain(`operation: '${operation}'`);
    expect(failureBranch).toContain("mode: 'bm'");
    expect(failureBranch).toContain('tournamentId');
    expect(failureBranch).toContain('matchId:');
    expect(failureBranch).toContain('status: response.status');
    expect(failureBranch).toContain(`tFinals('${fallbackKey}')`);
    expect(failureBranch).not.toContain('response.json()');
    expect(failureBranch).not.toContain('error.error');
    expect(failureBranch).not.toContain('error?.error');
  });

  it('preserves score success response parsing and optimistic version payload', () => {
    expect(scoreHandler).toContain('const json = await response.json();');
    expect(scoreHandler).toContain('expectedVersion: selectedMatch.version');
    expect(scoreHandler).toContain('setChampion(champPlayer);');
    expect(scoreHandler).toContain('refetch();');
  });

  it('preserves abort-based latest-write protection for TV and starting course autosaves', () => {
    expect(tvHandler).toContain('tvAbortRef.current?.abort();');
    expect(tvHandler).toContain('signal: controller.signal');
    expect(courseHandler).toContain('courseAbortRef.current?.abort();');
    expect(courseHandler).toContain('signal: controller.signal');
  });
});
