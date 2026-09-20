import { readRepoFile } from '../helpers/e2e-cases';

describe('TA setup player search contract', () => {
  const pageSource = readRepoFile('smkc-score-app', 'src', 'app', 'tournaments', '[id]', 'ta', 'page-client.tsx');
  const initialDataSource = readRepoFile('smkc-score-app', 'src', 'lib', 'ta', 'initial-data.ts');

  it('isolates player discovery from the normal qualification polling path', () => {
    expect(pageSource).toContain("import { usePlayerSearch } from '@/hooks/use-player-search'");
    expect(pageSource).toContain('usePlayerSearch(playerSearchQuery, isAdmin && isSetupDialogOpen)');
    expect(pageSource).not.toContain('fetchAllPlayersForSetup');
    expect(pageSource).not.toContain('resolveAllPlayers');
  });

  it('keeps selected players visible outside the current bounded result page', () => {
    expect(pageSource).toContain('knownPlayersById.get(selected.playerId)');
    expect(pageSource).toContain('visiblePlayers.map((player) =>');
    expect(pageSource).toContain('knownPlayersById.get(s.playerId)');
  });

  it('scopes select-all to the current server result page', () => {
    expect(pageSource).toContain('candidatePlayers.every((player) => setupPlayerIdSet.has(player.id))');
    expect(pageSource).toContain('const toAdd = candidatePlayers');
    expect(pageSource).toContain('new Set(candidatePlayers.map((p) => p.id))');
  });

  it('does not preload a global player list in server initial data', () => {
    expect(initialDataSource).not.toContain('prisma.player.findMany');
    expect(initialDataSource).not.toContain('allPlayers:');
    expect(initialDataSource).toContain('bounded server-side search when opened');
  });
});
