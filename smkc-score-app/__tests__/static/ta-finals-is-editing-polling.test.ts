import fs from 'node:fs';
import path from 'node:path';

describe('TA finals editing-aware polling (#3117)', () => {
  const source = fs.readFileSync(
    path.join(process.cwd(), 'src', 'app', 'tournaments', '[id]', 'ta', 'finals', 'page.tsx'),
    'utf8',
  );

  it('keeps isEditing in fetchData dependencies so participant-report merge uses current edit state', () => {
    expect(source).toContain('if (openRound && currentRound && !isEditing) {');
    expect(source).toContain('}, [tournamentId, currentRound, isEditing]);');
  });

  it('keeps the primary polling loop paused while the admin is editing', () => {
    expect(source).toMatch(/if \(!isEditing\) \{\s*fetchData\(\);\s*\}/);
  });
});
