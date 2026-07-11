import fs from 'node:fs';
import path from 'node:path';

describe('archive restore tournament query shape', () => {
  const source = fs.readFileSync(path.join(process.cwd(), 'src/lib/tournament-archive-restore.ts'), 'utf8');

  it('uses an id-only projection for the initial existence lookup', () => {
    const lookup = source.match(
      /existing tournament lookup[\s\S]*?prisma\.tournament\.findUnique\(\{[\s\S]*?select: \{([\s\S]*?)\}[\s\S]*?\}\)/,
    );
    expect(lookup?.[1]).toBeDefined();
    expect(lookup?.[1]).toContain('id: true');
    expect(lookup?.[1]).not.toContain('status');
    expect(lookup?.[1]).not.toContain('taBattleRoyaleMode');
  });

  it('uses the explicit response projection only after a row exists', () => {
    expect(source.match(/select: RESTORED_TOURNAMENT_SELECT/g)).toHaveLength(2);
    expect(source).not.toContain('prisma.tournament.findUnique({ where: { id: tournamentId } })');
  });

  it('retries both D1 Tournament reads', () => {
    expect(source.match(/retryDbRead\(\(\) =>/g)).toHaveLength(2);
  });
});
