/**
 * Helpers for consuming API responses while the app supports
 * both legacy payloads and standardized success wrappers.
 */

function hasInvalidSuccessFlag(payload: object): boolean {
  return (
    Object.prototype.hasOwnProperty.call(payload, 'success') && (payload as { success?: unknown }).success !== true
  );
}

/**
 * Extracts an array payload from supported API response shapes while preserving
 * the distinction between a legitimate empty result and an unsupported shape.
 *
 * Supported formats:
 * - T[]
 * - { data: T[] }
 * - { success: true, data: T[] }
 * - { success: true, data: { data: T[], meta: ... } }
 *
 * When a wrapper explicitly provides `success`, only `success: true` is accepted.
 * This keeps strict callers from treating an explicit or malformed failure wrapper
 * as usable data while preserving legacy payloads that do not have a success flag.
 *
 * Returns null when no supported array payload is present. Callers that must
 * fail closed on malformed success responses can use this helper directly.
 */
export function extractArrayDataOrNull<T>(payload: unknown): T[] | null {
  if (Array.isArray(payload)) {
    return payload as T[];
  }

  if (!payload || typeof payload !== 'object' || hasInvalidSuccessFlag(payload)) {
    return null;
  }

  const data = (payload as { data?: unknown }).data;

  if (Array.isArray(data)) {
    return data as T[];
  }

  if (!data || typeof data !== 'object') {
    return null;
  }

  const nestedData = (data as { data?: unknown }).data;

  return Array.isArray(nestedData) ? (nestedData as T[]) : null;
}

/**
 * Extracts an array payload from supported API response shapes.
 *
 * This compatibility helper intentionally normalizes unsupported payloads to an
 * empty array. Callers that need to distinguish malformed data from a valid
 * empty result should use extractArrayDataOrNull().
 */
export function extractArrayData<T>(payload: unknown): T[] {
  return extractArrayDataOrNull<T>(payload) ?? [];
}

export interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 1;
}

function isPaginationMeta(value: unknown): value is PaginationMeta {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const meta = value as Partial<PaginationMeta>;

  if (
    !isNonNegativeInteger(meta.total) ||
    !isPositiveInteger(meta.page) ||
    !isPositiveInteger(meta.limit) ||
    !isPositiveInteger(meta.totalPages)
  ) {
    return false;
  }

  // Keep client-side metadata aligned with the server paginate() contract.
  // page may intentionally exceed totalPages so callers can clamp an
  // out-of-range request to the server-reported final page. Every accepted
  // field must stay within JavaScript's safe-integer range so this arithmetic
  // cannot silently lose precision.
  const expectedTotalPages = Math.ceil(meta.total / meta.limit) || 1;
  return meta.totalPages === expectedTotalPages;
}

/**
 * Extracts pagination metadata from supported paginated API response shapes.
 * Metadata is accepted only when all numeric fields are safe integers and
 * `totalPages` is consistent with the server pagination contract
 * (`Math.ceil(total / limit) || 1`). An out-of-range current `page` remains
 * valid so callers can clamp it to the final page. Wrappers that explicitly
 * provide `success` must use `success: true`.
 *
 * Metadata must be colocated with the array shape it describes. This prevents
 * malformed mixed wrappers from pairing a nested data array with unrelated
 * top-level metadata (or accepting metadata with no supported data array).
 *
 * Supported formats:
 * - { data: T[], meta: ... }
 * - { success: true, data: { data: T[], meta: ... } }
 */
export function extractPaginationMeta(payload: unknown): PaginationMeta | null {
  if (!payload || typeof payload !== 'object' || hasInvalidSuccessFlag(payload)) {
    return null;
  }

  const data = (payload as { data?: unknown }).data;

  if (Array.isArray(data)) {
    const directMeta = (payload as { meta?: unknown }).meta;
    return isPaginationMeta(directMeta) ? directMeta : null;
  }

  if (!data || typeof data !== 'object') {
    return null;
  }

  const nestedData = (data as { data?: unknown }).data;
  if (!Array.isArray(nestedData)) {
    return null;
  }

  const nestedMeta = (data as { meta?: unknown }).meta;

  return isPaginationMeta(nestedMeta) ? nestedMeta : null;
}
