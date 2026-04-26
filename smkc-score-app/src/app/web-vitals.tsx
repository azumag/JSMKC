'use client';

/**
 * Web Vitals reporter.
 *
 * Mounted once at the root layout. Subscribes to Next.js's `useReportWebVitals`
 * hook and posts each metric (LCP, INP, TTFB, CLS, FCP, FID) to a lightweight
 * server endpoint that logs them via `createLogger` so they show up in
 * `wrangler tail` and any log aggregator wired up downstream.
 *
 * Uses `navigator.sendBeacon` when available so the request does not block
 * navigation; falls back to `fetch(..., { keepalive: true })` otherwise.
 *
 * The component renders nothing — it exists purely for its hook side effect.
 * Activated only when `NEXT_PUBLIC_PERF_LOG=1` so we don't pay the network
 * cost in normal production until we explicitly turn measurement on.
 */
import { useReportWebVitals } from 'next/web-vitals';

const PERF_LOG = process.env.NEXT_PUBLIC_PERF_LOG === '1';
const VITALS_ENDPOINT = '/api/internal/vitals';

export function WebVitalsReporter() {
  useReportWebVitals((metric) => {
    if (!PERF_LOG) return;

    const body = JSON.stringify({
      id: metric.id,
      name: metric.name,
      value: metric.value,
      rating: metric.rating,
      navigationType: metric.navigationType,
      // Use `location.pathname` (not the full URL) to keep PII out of logs
      // while still allowing per-route slicing.
      path: typeof window !== 'undefined' ? window.location.pathname : null,
    });

    try {
      if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
        const blob = new Blob([body], { type: 'application/json' });
        navigator.sendBeacon(VITALS_ENDPOINT, blob);
        return;
      }
      // Fallback for browsers without sendBeacon (rare in practice).
      void fetch(VITALS_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        keepalive: true,
      });
    } catch {
      // Swallow — vitals are best-effort and must never disrupt the page.
    }
  });

  return null;
}
