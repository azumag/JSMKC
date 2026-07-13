import fs from 'node:fs';
import path from 'node:path';

describe('TA battle royale CRUD controls (issue #2753)', () => {
  const read = (relativePath: string) => fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');

  it('does not offer the meaningless per-player TA handicap default in Player Management', () => {
    // Player.taHandicapSeconds only ever seeded a new tournament entry's
    // default and never affected an already-entered player — the actual,
    // authoritative handicap lives on TTEntry and is set on the tournament
    // entry screen instead. Editing it here looked like it configured
    // something, but it never did, so the control was removed.
    const pageSource = read('src/app/players/page.tsx');

    expect(pageSource).not.toContain('TaHandicapSelect');
    expect(pageSource).not.toContain('TaHandicapBadge');
    expect(pageSource).not.toContain('taHandicapSeconds');
  });

  it('still offers the full handicap selector on the tournament entry screen', () => {
    const pageSource = read('src/app/tournaments/[id]/ta/page-client.tsx');
    const selectorSource = read('src/components/tournament/ta-handicap-select.tsx');

    expect(pageSource).toContain('<TaHandicapSelect');
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
