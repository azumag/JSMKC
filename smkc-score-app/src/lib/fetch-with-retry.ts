/**
 * Fetch wrapper with automatic retry for transient Cloudflare Workers errors.
 *
 * D1 eliminates the old PrismaNeon cold-start 1101 crashes, but retries
 * are kept as a general resilience measure for occasional 500s.
 *
 * Usage: drop-in replacement for fetch() in client components. Automatic
 * replay is deliberately limited to safe read methods so a mutation is never
 * duplicated after an ambiguous 500/network failure.
 *
 *   import { fetchWithRetry } from '@/lib/fetch-with-retry';
 *   const response = await fetchWithRetry('/api/players');
 */

const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 500;

const inFlightApiGets = new Map<string, Promise<Response>>();

function isRequestInput(input: RequestInfo | URL): input is Request {
  return typeof Request !== 'undefined' && input instanceof Request;
}

function requestMethod(input: RequestInfo | URL, init?: RequestInit): string {
  return (init?.method ?? (isRequestInput(input) ? input.method : 'GET')).toUpperCase();
}

function requestSignal(input: RequestInfo | URL, init?: RequestInit): AbortSignal | null {
  if (init?.signal !== undefined) {
    return init.signal;
  }
  return isRequestInput(input) ? input.signal : null;
}

function isAbortError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'name' in error && error.name === 'AbortError';
}

function abortReason(signal: AbortSignal): unknown {
  const reason = (signal as AbortSignal & { reason?: unknown }).reason;
  if (reason !== undefined) return reason;

  const error = new Error('The operation was aborted');
  error.name = 'AbortError';
  return error;
}

function isRetrySafeRequest(input: RequestInfo | URL, init?: RequestInit): boolean {
  const method = requestMethod(input, init);
  return method === 'GET' || method === 'HEAD';
}

function hasRequestSpecificInit(init?: RequestInit): boolean {
  if (!init) return false;
  return Object.keys(init).some((key) => key !== 'method');
}

/**
 * Only plain browser GETs are safe to coalesce by URL.
 *
 * Request objects and RequestInit options such as signal, headers, cache, or
 * credentials carry caller-specific semantics. Sharing an in-flight request in
 * those cases can make one caller inherit another caller's cancellation or
 * request metadata, so they deliberately bypass the URL-only dedupe path.
 */
function isDedupeSafeBrowserApiGet(input: RequestInfo | URL, init?: RequestInit): boolean {
  if (typeof window === 'undefined') return false;
  if (isRequestInput(input)) return false;
  if (hasRequestSpecificInit(init)) return false;

  const method = requestMethod(input, init);
  if (method !== 'GET') return false;

  const url = typeof input === 'string' ? new URL(input, window.location.href) : input;

  return url.origin === window.location.origin && url.pathname.startsWith('/api/');
}

function dedupeKey(input: RequestInfo | URL): string {
  const url =
    typeof input === 'string'
      ? new URL(input, window.location.href)
      : input instanceof URL
        ? input
        : new URL(input.url, window.location.href);

  return url.href;
}

async function waitForRetry(input: RequestInfo | URL, init?: RequestInit): Promise<void> {
  const signal = requestSignal(input, init);
  if (!signal) {
    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    return;
  }
  if (signal.aborted) throw abortReason(signal);

  await new Promise<void>((resolve, reject) => {
    const timeout = { id: undefined as ReturnType<typeof setTimeout> | undefined };
    const onAbort = () => {
      if (timeout.id !== undefined) clearTimeout(timeout.id);
      reject(abortReason(signal));
    };

    signal.addEventListener('abort', onAbort, { once: true });
    timeout.id = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, RETRY_DELAY_MS);
  });
}

/**
 * Fetch with automatic retry on 500+ status codes for safe read methods.
 * Mutating methods are attempted exactly once because an error response or
 * connection loss does not prove that the server failed to commit the write.
 * Explicitly aborted reads also fail immediately: cancellation is caller intent,
 * not a transient transport failure to replay after a delay.
 * Returns the last response (successful or final failure).
 */
export async function fetchWithRetry(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  if (isDedupeSafeBrowserApiGet(input, init)) {
    const key = dedupeKey(input);
    let request = inFlightApiGets.get(key);

    if (!request) {
      request = fetchWithRetryRaw(input, init);
      inFlightApiGets.set(key, request);
      const cleanup = () => {
        if (inFlightApiGets.get(key) === request) {
          inFlightApiGets.delete(key);
        }
      };
      // Handle both outcomes explicitly. `finally()` would create a derived
      // rejected Promise when `request` rejects, which has no consumer here.
      void request.then(cleanup, cleanup);
    }

    // Clone the native response for each caller instead of rebuilding it from
    // body/status/headers. This keeps each body independently readable while
    // preserving fetch-owned metadata such as url, redirected, and type.
    return (await request).clone();
  }

  return fetchWithRetryRaw(input, init);
}

async function fetchWithRetryRaw(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  let lastResponse: Response | undefined;
  const maxAttempts = isRetrySafeRequest(input, init) ? MAX_RETRIES : 1;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      lastResponse = await fetch(input, init);
      // Success or client error (4xx) — don't retry
      if (lastResponse.ok || lastResponse.status < 500) {
        return lastResponse;
      }
    } catch (err) {
      // Caller cancellation is intentional and must never be replayed. Prefer
      // the effective signal (RequestInit overrides Request.signal), while also
      // recognizing the standard AbortError when no signal state is available.
      if (requestSignal(input, init)?.aborted || isAbortError(err)) throw err;

      // Network error — retry safe reads unless this is the last attempt.
      // Mutations have maxAttempts=1, so they always re-throw immediately.
      if (attempt === maxAttempts - 1) throw err;
    }

    // Wait before retry (skip delay on last attempt). The wait itself observes
    // caller cancellation so an abort between attempts never starts a replay.
    if (attempt < maxAttempts - 1) {
      await waitForRetry(input, init);
    }
  }

  // All retry-safe attempts exhausted, or a mutation returned 500+ once.
  return lastResponse!;
}
