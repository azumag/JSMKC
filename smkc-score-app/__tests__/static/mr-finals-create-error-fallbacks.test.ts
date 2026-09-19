import fs from 'fs';
import path from 'path';

const source = fs.readFileSync(path.join(process.cwd(), 'src/app/tournaments/[id]/mr/finals/page.tsx'), 'utf8');

function getHandlerBlock(startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);

  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

function getHttpFailureBranch(handler: string): string {
  const failureStart = handler.lastIndexOf('} else {');
  const catchStart = handler.indexOf('} catch', failureStart);

  expect(failureStart).toBeGreaterThanOrEqual(0);
  expect(catchStart).toBeGreaterThan(failureStart);
  return handler.slice(failureStart, catchStart);
}

describe('MR finals bracket creation error fallbacks (issue #3876)', () => {
  const createBracket = getHandlerBlock(
    'const handleCreateBracket = async () => {',
    'const handleCreateUpperBracket = async () => {',
  );
  const createUpperBracket = getHandlerBlock(
    'const handleCreateUpperBracket = async () => {',
    'const handleBracketTvNumberChange = async',
  );

  it.each([
    ['create bracket', createBracket, 'create_bracket'],
    ['create upper bracket', createUpperBracket, 'create_upper_bracket'],
  ])('keeps %s HTTP failures fail-closed', (_label, handler, operation) => {
    const failureBranch = getHttpFailureBranch(handler);

    expect(failureBranch).toContain("alert(tFinals('failedCreateBracket'))");
    expect(failureBranch).toContain(`operation: '${operation}'`);
    expect(failureBranch).toContain("mode: 'mr'");
    expect(failureBranch).toContain('tournamentId');
    expect(failureBranch).toContain('status: response.status');
    expect(failureBranch).not.toContain('response.json()');
    expect(failureBranch).not.toContain('error.error');
  });

  it('preserves success response parsing for both creation paths', () => {
    expect(createBracket).toContain('const json = await response.json();');
    expect(createUpperBracket).toContain('const json = await response.json();');
  });
});
