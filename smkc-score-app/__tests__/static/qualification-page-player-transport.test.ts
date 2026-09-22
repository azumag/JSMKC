import fs from 'fs';
import path from 'path';

const root = path.join(process.cwd(), '..');

function readRepoFile(...parts: string[]) {
  return fs.readFileSync(path.join(root, ...parts), 'utf8');
}

describe('qualification page player transport static guard', () => {
  it.each(['bm', 'mr', 'gp'] as const)(
    'keeps %s qualification polling on the bounded response seed without retired player helpers',
    (mode) => {
      const source = readRepoFile('smkc-score-app', 'src', 'app', 'tournaments', '[id]', mode, 'page-client.tsx');

      expect(source).toContain(`/api/tournaments/\${tournamentId}/${mode}`);
      expect(source).not.toContain('/api/players');
      expect(source).not.toContain('qualification-page-data');
      expect(source).not.toContain('fetchAllPlayersForSetup');
      expect(source).not.toContain('resolveAllPlayers');
    },
  );

  it('keeps the retired qualification page compatibility helper deleted', () => {
    const helperPath = path.join(root, 'smkc-score-app', 'src', 'lib', 'qualification-page-data.ts');
    expect(fs.existsSync(helperPath)).toBe(false);
  });
});
