/**
 * Helpers for consuming API responses while the app supports
 * both legacy payloads and standardized success wrappers.
 */

/**
 * Extracts an array payload from supported API response shapes.
 *
 * Supported formats:
 * - T[]
 * - { data: T[] }
 * - { success: true, data: T[] }
 * - { success: true, data: { data: T[], meta: ... } }
 */
export function extractArrayData<T>(payload: unknown): T[] {
  if (Array.isArray(payload)) {
    return payload as T[];
  }

  if (!payload || typeof payload !== 'object') {
    return [];
  }

  const data = (payload as { data?: unknown }).data;

  if (Array.isArray(data)) {
    return data as T[];
  }

  if (!data || typeof data !== 'object') {
    return [];
  }

  const nestedData = (data as { data?: unknown }).data;

  return Array.isArray(nestedData) ? (nestedData as T[]) : [];
}

export interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1;
}

function isPaginationMeta(value: unknown): value is PaginationMeta {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const meta = value as Partial<PaginationMeta>;

  return (
    isNonNegativeInteger(meta.total) &&
    isPositiveInteger(meta.page) &&
    isPositiveInteger(meta.limit) &&
    isPositiveInteger(meta.totalPages)
  );
}

/**
 * Extracts pagination metadata from supported paginated API response shapes.
 *
 * Supported formats:
 * - { data: T[], meta: ... }
 * - { success: true, data: { data: T[], meta: ... } }
 */
export function extractPaginationMeta(payload: unknown): PaginationMeta | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const directMeta = (payload as { meta?: unknown }).meta;
  if (isPaginationMeta(directMeta)) {
    return directMeta;
  }

  const data = (payload as { data?: unknown }).data;
  if (!data || typeof data !== 'object') {
    return null;
  }

  const nestedMeta = (data as { meta?: unknown }).meta;

  return isPaginationMeta(nestedMeta) ? nestedMeta : null;
}
