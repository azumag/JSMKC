export const PLAYER_LIST_EXCLUDED_ID = '__BREAK__';
const MAX_PLAYER_SEARCH_QUERY_LENGTH = 100;

export function normalizePlayerSearchQuery(value: string | null): string | null {
  const normalized = value?.trim().slice(0, MAX_PLAYER_SEARCH_QUERY_LENGTH) ?? '';
  return normalized.length > 0 ? normalized : null;
}

export function buildPlayerListWhere(search: string | null) {
  const query = normalizePlayerSearchQuery(search);
  const baseWhere = { id: { not: PLAYER_LIST_EXCLUDED_ID } };

  if (!query) return baseWhere;

  return {
    ...baseWhere,
    OR: [{ nickname: { contains: query } }, { name: { contains: query } }],
  };
}
