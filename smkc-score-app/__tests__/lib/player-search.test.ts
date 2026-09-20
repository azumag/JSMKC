import fs from 'fs';
import path from 'path';
import { buildPlayerListWhere, isSelectablePlayerId, normalizePlayerSearchQuery } from '@/lib/player-search';

describe('player search', () => {
  it('accepts only canonical selectable player identities', () => {
    expect(isSelectablePlayerId('p1')).toBe(true);
    expect(isSelectablePlayerId('')).toBe(false);
    expect(isSelectablePlayerId('   ')).toBe(false);
    expect(isSelectablePlayerId(' p1')).toBe(false);
    expect(isSelectablePlayerId('p1 ')).toBe(false);
    expect(isSelectablePlayerId('p 1')).toBe(false);
    expect(isSelectablePlayerId('p\t1')).toBe(false);
    expect(isSelectablePlayerId('p\n1')).toBe(false);
    expect(isSelectablePlayerId('__BREAK__')).toBe(false);
    expect(isSelectablePlayerId(1)).toBe(false);
  });

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

  it('bounds the query by Unicode code points without splitting a surrogate pair', () => {
    const query = `${'x'.repeat(99)}😀tail`;
    const normalized = `${'x'.repeat(99)}😀`;

    expect(normalizePlayerSearchQuery(query)).toBe(normalized);
    expect([...normalized]).toHaveLength(100);
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
