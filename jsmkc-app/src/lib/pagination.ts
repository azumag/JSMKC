/**
 * Pagination Utilities
 *
 * Provides standardized pagination support for API endpoints that return
 * lists of records. Ensures consistent pagination behavior across all
 * JSMKC list endpoints (players, tournaments, matches, etc.).
 *
 * Pagination meta includes:
 * - total: Total number of records matching the query
 * - page: Current page number (1-based)
 * - limit: Number of records per page
 * - totalPages: Calculated total number of pages
 *
 * Defaults:
 * - Page: 1 (first page)
 * - Limit: 50 records per page
 * - Maximum limit: 100 (prevents excessive data transfers)
 *
 * Usage:
 *   import { paginate, getPaginationParams } from '@/lib/pagination';
 *   const params = getPaginationParams({ page: 2, limit: 20 });
 *   const result = await paginate(prisma.player, { deletedAt: null }, { name: 'asc' }, params);
 *   return NextResponse.json(result);
 */

// ============================================================
// Type Definitions
// ============================================================

/**
 * Standard paginated response shape for API endpoints.
 *
 * Contains the data array for the current page and metadata
 * about the pagination state (total count, page info, etc.).
 *
 * @template T - The type of records in the data array
 *
 * @example
 *   // API response body shape:
 *   {
 *     data: [{ id: '1', name: 'Player 1' }, ...],
 *     meta: {
 *       total: 150,
 *       page: 2,
 *       limit: 50,
 *       totalPages: 3
 *     }
 *   }
 */
export interface PaginatedResponse<T> {
  /** Array of records for the current page */
  data: T[];
  /** Pagination metadata */
  meta: {
    /** Total number of records matching the query (across all pages) */
    total: number;
    /** Current page number (1-based) */
    page: number;
    /** Number of records per page */
    limit: number;
    /** Total number of pages (Math.ceil(total / limit)) */
    totalPages: number;
  };
}

/**
 * Input options for pagination, typically parsed from URL query parameters.
 *
 * Both fields are optional - defaults are applied by getPaginationParams().
 */
export interface PaginationOptions {
  /** Requested page number (1-based). Defaults to 1 if not provided. */
  page?: number;
  /** Requested records per page. Defaults to 50, max 100. */
  limit?: number;
}

// ============================================================
// Pagination Parameter Processing
// ============================================================

/**
 * Processes and validates pagination options into safe query parameters.
 *
 * Applies defaults and constraints:
 * - Page defaults to 1, minimum is 1 (no zero or negative pages)
 * - Limit defaults to 50, minimum is 1, maximum is 100
 * - Calculates the `skip` value for Prisma's offset-based pagination
 *
 * The maximum limit of 100 prevents clients from requesting excessive
 * amounts of data in a single request, which could cause performance
 * issues and high memory usage.
 *
 * @param options - The raw pagination options (may be undefined/partial)
 * @returns Validated parameters with page, limit, and skip values
 *
 * @example
 *   const params = getPaginationParams({ page: 3, limit: 20 });
 *   // Returns: { page: 3, limit: 20, skip: 40 }
 *
 *   const defaults = getPaginationParams({});
 *   // Returns: { page: 1, limit: 50, skip: 0 }
 *
 *   const clamped = getPaginationParams({ page: -1, limit: 500 });
 *   // Returns: { page: 1, limit: 100, skip: 0 }
 */
export function getPaginationParams(
  options?: PaginationOptions
): { page: number; limit: number; skip: number } {
  // Apply defaults for missing values.
  // Page defaults to 1 (first page) and limit defaults to 50 records.
  const rawPage = options?.page ?? 1;
  const rawLimit = options?.limit ?? 50;

  // Clamp page to minimum of 1 (no zero or negative pages allowed).
  // This prevents confusing skip calculations and invalid SQL offsets.
  const page = Math.max(1, Math.floor(rawPage));

  // Clamp limit between 1 and 100 inclusive.
  // Minimum of 1 ensures at least one record per page.
  // Maximum of 100 prevents excessive data transfers that could
  // strain the database and network.
  const limit = Math.min(100, Math.max(1, Math.floor(rawLimit)));

  // Calculate the number of records to skip for Prisma's offset pagination.
  // Page 1 skips 0, page 2 skips `limit`, page 3 skips `2 * limit`, etc.
  const skip = (page - 1) * limit;

  return { page, limit, skip };
}

// ============================================================
// Generic Paginated Query
// ============================================================

/**
 * Prisma model delegate interface for pagination.
 *
 * Represents the minimum set of Prisma model methods needed
 * for paginated queries: count (for total) and findMany (for data).
 *
 * This generic interface allows paginate() to work with any Prisma
 * model without knowing the specific model type at compile time.
 */
interface PrismaModelDelegate {
  count: (args: { where: Record<string, unknown> }) => Promise<number>;
  findMany: (args: {
    where: Record<string, unknown>;
    orderBy: Record<string, unknown>;
    skip: number;
    take: number;
  }) => Promise<unknown[]>;
}

/**
 * Executes a paginated query against a Prisma model.
 *
 * Performs two queries in parallel for efficiency:
 * 1. COUNT query: Gets total matching records for pagination meta
 * 2. SELECT query: Gets the records for the current page
 *
 * Both queries use the same WHERE clause to ensure the total count
 * accurately reflects the filtered result set.
 *
 * @template T - The type of records returned by the model
 * @param query - The Prisma model delegate (e.g., prisma.player)
 * @param where - The WHERE clause for filtering records
 * @param orderBy - The ORDER BY clause for sorting results
 * @param options - Pagination options (page, limit)
 * @returns PaginatedResponse with data array and pagination meta
 *
 * @example
 *   const result = await paginate<Player>(
 *     prisma.player,
 *     { deletedAt: null },
 *     { name: 'asc' },
 *     { page: 2, limit: 20 }
 *   );
 *   // Returns: { data: [...], meta: { total: 150, page: 2, limit: 20, totalPages: 8 } }
 */
export async function paginate<T>(
  query: PrismaModelDelegate,
  where: Record<string, unknown>,
  orderBy: Record<string, unknown>,
  options?: PaginationOptions
): Promise<PaginatedResponse<T>> {
  // Process and validate pagination parameters
  const { page, limit, skip } = getPaginationParams(options);

  // Execute count and findMany in parallel for efficiency.
  // Both use the same where clause to ensure consistency.
  // Promise.all allows both queries to run concurrently,
  // reducing total response time by ~50% compared to sequential.
  const [total, data] = await Promise.all([
    query.count({ where }),
    query.findMany({
      where,
      orderBy,
      skip,
      take: limit,
    }),
  ]);

  // Calculate total pages, ensuring at least 1 page even when total is 0.
  // Math.ceil rounds up so partial pages are included (e.g., 51 records
  // with limit 50 = 2 pages).
  const totalPages = Math.ceil(total / limit) || 1;

  return {
    data: data as T[],
    meta: {
      total,
      page,
      limit,
      totalPages,
    },
  };
}
