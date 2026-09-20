import fs from 'fs';
import path from 'path';
import { buildPlayerListWhere, normalizePlayerSearchQuery } from '@/lib/player-search';

describe('player search', () => {
  it('treats an empty or whitespace-only query as no search filter', () => {
    expect(normalizePlayerSearchQuery(null)).toBeNull();
    expect(normalizePlayerSearchQuery('   ')).toBeNull();
    expect(buildPlayerListWhere('   ')).toEqual({ id: { not: '__BREAK__' } });
  });

  it('trims and bounds the query before matching nickname or name', () => {
    const query = `  ${'x'.repeat(120)}  `;
    const normalized = 'x'.repeat(100);

    expect(normalizePlayerSearchQuery(query)).toBe(normalized);
    expect(buildPlayerListWhere(query)).toEqual({
      id: { not: '__BREAK__' },
      OR: [{ nickname: { contains: normalized } }, { name: { contains: normalized } }],
    });
  });

  it('keeps the players route wired to the bounded search helper', () => {
    const routePath = path.resolve(__dirname, '..', '..', 'src', 'app', 'api', 'players', 'route.ts');
    const routeSource = fs.readFileSync(routePath, 'utf8');

    expect(routeSource).toContain("buildPlayerListWhere(searchParams.get('search'))");
  });
});
