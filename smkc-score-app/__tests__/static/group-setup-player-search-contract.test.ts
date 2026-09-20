import { readRepoFile } from '../helpers/e2e-cases';

describe('GroupSetupDialog player search contract', () => {
  const source = readRepoFile('smkc-score-app', 'src', 'components', 'tournament', 'group-setup-dialog.tsx');

  it('uses the shared bounded server-side player search while the dialog is open', () => {
    expect(source).toContain("import { usePlayerSearch } from '@/hooks/use-player-search'");
    expect(source).toContain('usePlayerSearch(playerSearchQuery, isOpen)');
    expect(source).not.toContain('const filteredPlayers = allPlayers.filter');
  });

  it('keeps selected players renderable outside the current search result page', () => {
    expect(source).toContain('knownPlayersById.get(selected.playerId)');
    expect(source).toContain('knownPlayersById.get(sp.playerId)');
    expect(source).toContain('visiblePlayers.map((player) =>');
  });

  it('limits bulk selection to the current bounded server result page', () => {
    expect(source).toContain('candidatePlayers.every((player) => selectedIds.has(player.id))');
    expect(source).toContain('const newPlayers = candidatePlayers');
    expect(source).toContain('new Set(candidatePlayers.map((p) => p.id))');
  });

  it('uses strict integer parsing for seeding instead of partial parseInt coercion', () => {
    expect(source).toContain("import { parseManualScore } from '@/lib/parse-manual-score'");
    expect(source).toContain('const parsed = parseManualScore(e.target.value);');
    expect(source).toContain('const seeding = parsed !== null && parsed >= 1 ? parsed : undefined;');
    expect(source).not.toContain('parseInt(val, 10)');
  });
});