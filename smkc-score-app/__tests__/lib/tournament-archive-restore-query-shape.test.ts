import fs from 'node:fs';
import path from 'node:path';

describe('archive restore tournament query shape', () => {
  const source = fs.readFileSync(
    path.join(process.cwd(), 'src/lib/tournament-archive-restore.ts'),
    'utf8',
  );

  it('uses the explicit restore projection for both Tournament lookups', () => {
    expect(source.match(/select: RESTORED_TOURNAMENT_SELECT/g)).toHaveLength(2);
    expect(source).not.toContain('prisma.tournament.findUnique({ where: { id: tournamentId } })');
  });

  it('retries both D1 Tournament reads', () => {
    expect(source.match(/retryDbRead\(\(\) =>/g)).toHaveLength(2);
  });

  it('does not select unrelated Tournament columns during archive restoration', () => {
    const selectBlock = source.match(/const RESTORED_TOURNAMENT_SELECT = \{([\s\S]*?)\n\} as const/);
    expect(selectBlock?.[1]).toBeDefined();
    expect(selectBlock?.[1]).not.toContain('overlayLayout');
    expect(selectBlock?.[1]).not.toContain('dualReportEnabled');
  });
});
