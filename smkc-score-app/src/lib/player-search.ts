export const PLAYER_LIST_EXCLUDED_ID = '__BREAK__';
const MAX_PLAYER_SEARCH_QUERY_LENGTH = 100;

export function isSelectablePlayerId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && !/\s/.test(value) && value !== PLAYER_LIST_EXCLUDED_ID;
}

function sliceUnicodeCodePoints(value: string, maxCodePoints: number): string {
  let end = 0;
  let count = 0;

  for (const codePoint of value) {
    if (count >= maxCodePoints) break;
    end += codePoint.length;
    count += 1;
  }

  return value.slice(0, end);
}

export function normalizePlayerSearchQuery(value: string | null): string | null {
  const trimmed = value?.trim() ?? '';
  const normalized = sliceUnicodeCodePoints(trimmed, MAX_PLAYER_SEARCH_QUERY_LENGTH);
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
