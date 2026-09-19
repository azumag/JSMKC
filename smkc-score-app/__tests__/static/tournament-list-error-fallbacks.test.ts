import fs from 'fs';
import path from 'path';

function readAppFile(...parts: string[]) {
  return fs.readFileSync(path.join(process.cwd(), ...parts), 'utf8');
}

function extractBlock(source: string, startMarker: string, endMarker: string) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  return source.slice(start, end);
}

describe('tournament list admin mutation error fallback contract', () => {
  const source = readAppFile('src', 'app', 'tournaments', 'page.tsx');
  const createBlock = extractBlock(source, 'const createTournament = async', 'const handleSubmit =');
  const deleteBlock = extractBlock(source, 'const handleDelete = async', 'const totalTournaments =');

  it('does not parse or display create response bodies on HTTP failure', () => {
    expect(createBlock).toContain("setError(t('failedToCreate'));");
    expect(createBlock).not.toContain('data.error');
    expect(createBlock).not.toContain('response.json()');
    expect(createBlock).toContain("logger.error('Tournament create API returned error status', {");
    expect(createBlock).toContain('status: response.status');
  });

  it('keeps the known delete conflict message while hiding arbitrary failure detail', () => {
    expect(deleteBlock).toContain(
      "alert(response.status === 409 ? t('cannotDeleteStartedTournament') : t('failedToDelete'));",
    );
    expect(deleteBlock).not.toContain('data?.error');
    expect(deleteBlock).not.toContain('response.json()');
    expect(deleteBlock).toContain("logger.error('Tournament delete API returned error status', {");
    expect(deleteBlock).toContain('status: response.status');
    expect(deleteBlock).toContain('tournamentId: id');
  });
});
