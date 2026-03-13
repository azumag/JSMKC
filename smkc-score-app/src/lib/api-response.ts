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

  if (!payload || typeof payload !== "object") {
    return [];
  }

  const data = (payload as { data?: unknown }).data;

  if (Array.isArray(data)) {
    return data as T[];
  }

  if (!data || typeof data !== "object") {
    return [];
  }

  const nestedData = (data as { data?: unknown }).data;

  return Array.isArray(nestedData) ? (nestedData as T[]) : [];
}
