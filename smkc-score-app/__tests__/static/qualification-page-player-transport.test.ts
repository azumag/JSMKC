import fs from 'fs';
import path from 'path';

const root = path.join(process.cwd(), '..');

function readRepoFile(...parts: string[]) {
  return fs.readFileSync(path.join(root, ...parts), 'utf8');
}

describe('qualification page player transport static guard', () => {
  it.each(['bm', 'mr', 'gp'] as const)(
    'keeps %s qualification polling free of direct global player-list transport',
    (mode) => {
      const source = readRepoFile(
        'smkc-score-app',
        'src',
        'app',
        'tournaments',
        '[id]',
        mode,
        'page-client.tsx',
      );

      expect(source).toContain(`/api/tournaments/\${tournamentId}/${mode}`);
      expect(source).not.toContain('/api/players');
    },
  );

  it('keeps the temporary setup-player compatibility helper transport-free while it exists', () => {
    const helperPath = path.join(
      root,
      'smkc-score-app',
      'src',
      'lib',
      'qualification-page-data.ts',
    );

    if (!fs.existsSync(helperPath)) return;

    const source = fs.readFileSync(helperPath, 'utf8');
    expect(source).not.toContain('/api/players');
    expect(source).not.toMatch(/\bfetch\s*\(/);
    expect(source).not.toContain('fetchWithRetry');
    expect(source).toContain('return null;');
  });
});
