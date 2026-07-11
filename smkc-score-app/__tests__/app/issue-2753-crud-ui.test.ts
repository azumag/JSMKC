import fs from 'node:fs';
import path from 'node:path';

describe('TA battle royale CRUD controls (issue #2753)', () => {
  const read = (relativePath: string) => fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');

  it('offers every supported handicap through the shared selector in both player dialogs', () => {
    const pageSource = read('src/app/players/page.tsx');
    const selectorSource = read('src/components/tournament/ta-handicap-select.tsx');

    expect(pageSource.match(/<TaHandicapSelect/g) ?? []).toHaveLength(2);
    expect(selectorSource).toContain('TA_HANDICAP_SECONDS.map((seconds) =>');
    expect(selectorSource).toContain('<SelectItem key={seconds} value={String(seconds)}>');
  });

  it('offers the battle royale-only mode when creating a tournament', () => {
    const pageSource = read('src/app/tournaments/page.tsx');
    const selectorSource = read('src/components/tournament/ta-mode-selector.tsx');

    expect(pageSource).toContain('<TaModeSelector');
    expect(pageSource).toContain("value={formData.taBattleRoyaleMode ? 'battle_royale' : 'standard'}");
    expect(selectorSource).toContain("value: 'battle_royale'");
  });
});
