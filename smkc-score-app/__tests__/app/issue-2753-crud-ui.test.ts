import fs from 'node:fs';
import path from 'node:path';

describe('TA battle royale CRUD controls (issue #2753)', () => {
  const read = (relativePath: string) => fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');

  it('offers every supported handicap in both player dialogs', () => {
    const source = read('src/app/players/page.tsx');

    expect(source).toContain('id="taHandicapSeconds"');
    expect(source).toContain('id="edit-taHandicapSeconds"');
    for (const value of [0, -1, -3, -5]) {
      expect(source.match(new RegExp(`<option value=\\{${value}\\}>`, 'g'))).toHaveLength(2);
    }
  });

  it('offers the battle royale-only switch when creating a tournament', () => {
    const source = read('src/app/tournaments/page.tsx');

    expect(source).toContain('id="taBattleRoyaleMode"');
    expect(source).toContain("t('taBattleRoyaleMode')");
  });
});
