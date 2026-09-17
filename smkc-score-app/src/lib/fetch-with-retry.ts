/**
 * Fetch wrapper with automatic retry for transient Cloudflare Workers errors.
 *
 * D1 eliminates the old PrismaNeon cold-start 1101 crashes, but retries
 * are kept as a general resilience measure for occasional 500s.
 *
 * Usage: drop-in replacement for fetch() in client components.
 *
 *   import { fetchWithRetry } from '@/lib/fetch-with-retry';
 *   const response = await fetchWithRetry('/api/players');
 */

const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 500;

type ResponseSnapshot = {
  body: ArrayBuffer;
  init: ResponseInit;
};

const inFlightApiGets = new Map<string, Promise<ResponseSnapshot>>();

function isRequestInput(input: RequestInfo | URL): input is Request {
  return typeof Request !== 'undefined' && input instanceof Request;
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

  const method = init?.method ?? 'GET';
  if (method.toUpperCase() !== 'GET') return false;

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

function responseFromSnapshot(snapshot: ResponseSnapshot): Response {
  return new Response(snapshot.body.slice(0), snapshot.init);
}

async function snapshotResponse(response: Response): Promise<ResponseSnapshot> {
  return {
    body: await response.arrayBuffer(),
    init: {
      status: response.status,
      statusText: response.statusText,
      headers: new Headers(response.headers),
    },
  };
}

/**
 * Fetch with automatic retry on 500+ status codes.
 * Returns the last response (successful or final failure).
 */
export async function fetchWithRetry(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  if (isDedupeSafeBrowserApiGet(input, init)) {
    const key = dedupeKey(input);
    let request = inFlightApiGets.get(key);

    if (!request) {
      request = fetchWithRetryRaw(input, init).then(snapshotResponse);
      inFlightApiGets.set(key, request);
      request.finally(() => {
        if (inFlightApiGets.get(key) === request) {
          inFlightApiGets.delete(key);
        }
      });
    }

    return responseFromSnapshot(await request);
  }

  return fetchWithRetryRaw(input, init);
}

async function fetchWithRetryRaw(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  let lastResponse: Response | undefined;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      lastResponse = await fetch(input, init);
      // Success or client error (4xx) — don't retry
      if (lastResponse.ok || lastResponse.status < 500) {
        return lastResponse;
      }
    } catch (err) {
      // Network error — retry unless last attempt
      if (attempt === MAX_RETRIES - 1) throw err;
    }

    // Wait before retry (skip delay on last attempt)
    if (attempt < MAX_RETRIES - 1) {
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
    }
  }

  // All retries exhausted — return the last 500 response
  return lastResponse!;
}
