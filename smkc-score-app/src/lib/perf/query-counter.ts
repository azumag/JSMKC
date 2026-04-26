/**
 * Per-request D1 query counter (AsyncLocalStorage based).
 *
 * Used by the Prisma client extension in `prisma.ts` to record every query
 * that runs inside the scope of a request, and by the API timing wrapper
 * in `api-timing.ts` to summarize "db_query_count" / "db_total_ms" alongside
 * the request's own wall-clock duration.
 *
 * AsyncLocalStorage is provided by the Cloudflare Workers `nodejs_compat`
 * runtime (see wrangler.toml). The store is opt-in: code paths that do not
 * call `runWithQueryStats(...)` simply have `getStore()` return undefined,
 * and `recordQuery` becomes a no-op. This keeps the counter free outside
 * of instrumented request handlers.
 */
import { AsyncLocalStorage } from 'node:async_hooks';

export interface QueryStats {
  count: number;
  totalDurationMs: number;
}

const storage = new AsyncLocalStorage<QueryStats>();

/**
 * Run `fn` inside a fresh query-stats scope. Any Prisma queries executed
 * during `fn` (or transitively awaited from it) are counted in the returned
 * stats object. Nested calls create nested scopes; the inner scope wins
 * for queries running inside it.
 */
export async function runWithQueryStats<T>(
  fn: () => Promise<T>,
): Promise<{ result: T; stats: QueryStats }> {
  const stats: QueryStats = { count: 0, totalDurationMs: 0 };
  const result = await storage.run(stats, fn);
  return { result, stats };
}

/**
 * Record a single query's elapsed time in the current scope.
 * No-op outside a `runWithQueryStats` scope.
 */
export function recordQuery(durationMs: number): void {
  const stats = storage.getStore();
  if (stats) {
    stats.count += 1;
    stats.totalDurationMs += durationMs;
  }
}

/**
 * Read the current scope's stats without leaving the scope. Useful for
 * mid-request diagnostics. Returns undefined outside a scope.
 */
export function getCurrentStats(): QueryStats | undefined {
  return storage.getStore();
}
