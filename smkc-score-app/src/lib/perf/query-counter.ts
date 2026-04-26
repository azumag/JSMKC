/**
 * Per-request D1 query counter.
 *
 * Used by the Prisma client extension in `prisma.ts` to record every query
 * that runs inside the scope of a request, and by the API timing wrapper
 * in `api-timing.ts` to summarize "db_query_count" / "db_total_ms" alongside
 * the request's own wall-clock duration.
 *
 * Implementation note: AsyncLocalStorage is required for correct per-request
 * scoping under concurrent requests in the same Worker isolate. We resolve
 * it through `globalThis.AsyncLocalStorage` rather than `node:async_hooks`
 * because the Cloudflare Workers runtime exposes the constructor on the
 * global when `nodejs_compat` is enabled (compatibility_date >= 2024-09-23),
 * and a static `import 'node:async_hooks'` would force Turbopack to bundle
 * the module into client/edge chunks — which then refuse to build because
 * those runtimes have no Node modules. Resolving via globalThis means:
 *
 *   - Server (workerd) and Node test runners get the real ALS and per-
 *     request scoping works as intended.
 *   - Browser bundles see `globalThis.AsyncLocalStorage === undefined`
 *     and fall back to a no-op storage (record/getStore become inert),
 *     so the module is safe to traverse in a client-side import graph
 *     without ever referencing `node:async_hooks`.
 */

export interface QueryStats {
  count: number;
  totalDurationMs: number;
}

/**
 * Minimal subset of AsyncLocalStorage that this module relies on.
 * Declared structurally to avoid pulling Node type defs into client builds.
 */
interface AsyncLocalStorageLike<T> {
  run<R>(store: T, fn: () => R): R;
  getStore(): T | undefined;
}

type AsyncLocalStorageCtor = new <T>() => AsyncLocalStorageLike<T>;

const ALSCtor: AsyncLocalStorageCtor | undefined = (
  globalThis as { AsyncLocalStorage?: AsyncLocalStorageCtor }
).AsyncLocalStorage;

/**
 * No-op fallback used when AsyncLocalStorage is unavailable (browser
 * bundles, very old Workers compatibility dates). `recordQuery` becomes
 * inert in that case, which is the desired behaviour: instrumentation
 * should never break a request when its underlying primitive is missing.
 */
const noopStorage: AsyncLocalStorageLike<QueryStats> = {
  run: <R>(_store: QueryStats, fn: () => R) => fn(),
  getStore: () => undefined,
};

const storage: AsyncLocalStorageLike<QueryStats> = ALSCtor
  ? new ALSCtor<QueryStats>()
  : noopStorage;

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
