/**
 * Internal Web Vitals ingestion endpoint.
 *
 * Receives metric beacons from the WebVitalsReporter client component and
 * emits a single structured log line per metric. Intentionally minimal:
 * no auth, no DB write, no rate limit beyond Cloudflare's edge limits —
 * the goal is to surface metrics in `wrangler tail` cheaply during
 * performance tuning, not to build a full analytics pipeline.
 *
 * Disabled when `PERF_LOG !== '1'` so the route returns 204 and writes
 * nothing in normal production. The client also gates posting on the
 * matching public env, so a flipped flag stops both ends in one toggle.
 */
import { createLogger } from '@/lib/logger';

const log = createLogger('web-vitals');
const PERF_LOG = process.env.PERF_LOG === '1';

interface VitalPayload {
  id?: unknown;
  name?: unknown;
  value?: unknown;
  rating?: unknown;
  navigationType?: unknown;
  path?: unknown;
}

export async function POST(req: Request): Promise<Response> {
  if (!PERF_LOG) {
    return new Response(null, { status: 204 });
  }

  let payload: VitalPayload;
  try {
    payload = (await req.json()) as VitalPayload;
  } catch {
    return new Response('invalid json', { status: 400 });
  }

  const name = typeof payload.name === 'string' ? payload.name : 'unknown';
  const value = typeof payload.value === 'number' ? payload.value : null;
  const rating = typeof payload.rating === 'string' ? payload.rating : null;
  const path = typeof payload.path === 'string' ? payload.path : null;
  const navigationType =
    typeof payload.navigationType === 'string' ? payload.navigationType : null;

  log.info('vital', { name, value, rating, path, navigationType });
  return new Response(null, { status: 204 });
}
