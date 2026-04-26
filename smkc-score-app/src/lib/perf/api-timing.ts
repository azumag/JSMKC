/**
 * API request timing wrapper.
 *
 * Wraps a route handler so that on completion it emits a single structured
 * log line with:
 *   - `api_request_ms`: wall-clock time spent in the handler
 *   - `db_query_count`: number of Prisma/D1 queries issued (via query-counter)
 *   - `db_total_ms`:    cumulative D1 query time
 *   - `status`:         HTTP status code returned
 *   - `route`:          handler name passed in by the caller
 *
 * Activated by env `PERF_LOG=1`. When disabled, `withApiTiming` is a thin
 * passthrough that does not allocate the AsyncLocalStorage scope so there
 * is zero overhead in production where the env is unset.
 *
 * Designed to be used at the very top of route handlers:
 *
 *   export const GET = (req: Request) =>
 *     withApiTiming('tournaments.bm.GET', () => handleGet(req));
 */
import { createLogger } from '@/lib/logger';
import { runWithQueryStats } from '@/lib/perf/query-counter';

const log = createLogger('api-timing');
const PERF_LOG = process.env.PERF_LOG === '1';

/** Threshold below which we skip the log line to avoid noise. */
const SLOW_REQUEST_MIN_MS = Number(process.env.PERF_SLOW_REQUEST_MS ?? 0);

export async function withApiTiming<T extends Response>(
  route: string,
  fn: () => Promise<T>,
): Promise<T> {
  if (!PERF_LOG) {
    return fn();
  }

  const start = Date.now();
  const { result, stats } = await runWithQueryStats(fn);
  const apiRequestMs = Date.now() - start;
  const status = result.status;

  if (apiRequestMs >= SLOW_REQUEST_MIN_MS) {
    log.info('request', {
      route,
      api_request_ms: apiRequestMs,
      db_query_count: stats.count,
      db_total_ms: stats.totalDurationMs,
      status,
    });
  }

  return result;
}
