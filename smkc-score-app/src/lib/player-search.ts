const MAX_PLAYER_SEARCH_QUERY_LENGTH = 100;

export function normalizePlayerSearchQuery(value: string | null): string | null {
  const normalized = value?.trim().slice(0, MAX_PLAYER_SEARCH_QUERY_LENGTH) ?? '';
  return normalized.length > 0 ? normalized : null;
}

export function buildPlayerListWhere(search: string | null) {
  const query = normalizePlayerSearchQuery(search);
  const baseWhere = { id: { not: '__BREAK__' } };

  if (!query) return baseWhere;

  return {
    ...baseWhere,
    OR: [{ nickname: { contains: query } }, { name: { contains: query } }],
  };
}
