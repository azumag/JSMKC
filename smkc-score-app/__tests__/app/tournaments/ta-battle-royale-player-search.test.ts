import fs from 'node:fs';
import path from 'node:path';

describe('TA battle royale player search contract (issue #3933)', () => {
  const read = (relativePath: string) => fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');

  it('uses bounded server-side search instead of loading the full roster', () => {
    const source = read('src/app/tournaments/[id]/ta/battle-royale-setup-client.tsx');

    expect(source).toContain("import { usePlayerSearch } from '@/hooks/use-player-search'");
    expect(source).toContain('usePlayerSearch(searchQuery, isAdmin)');
    expect(source).not.toContain('fetchAllPlayersForSetup');
  });

  it('keeps selected players visible outside the current search result page', () => {
    const source = read('src/app/tournaments/[id]/ta/battle-royale-setup-client.tsx');

    expect(source).toContain('knownPlayersById.get(selected.playerId)');
    expect(source).toContain('visiblePlayers.map((player) =>');
    expect(source).toContain('searchResults.every((player) => selectedByPlayerId.has(player.id))');
    expect(source).toContain('const searchResultIds = new Set(searchResults.map((player) => player.id));');
  });

  it('documents bounded empty-query behavior and request ownership', () => {
    const docs = read('docs/ta-battle-royale-setup-client-errors.md');

    expect(docs).toContain('最初の 50 件だけ');
    expect(docs).toContain('250ms debounce');
    expect(docs).toContain('generation ownership');
    expect(docs).toContain('`Select All` は現在の search result page にだけ作用');
  });
});
