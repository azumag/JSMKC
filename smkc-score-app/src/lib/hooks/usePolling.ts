/**
 * usePolling - React Hook for Periodic Data Fetching
 *
 * This hook provides a configurable polling mechanism for React components
 * that need to periodically refresh data from the server. It is used
 * throughout the tournament UI to keep standings, scores, and bracket
 * states up to date in real time during active competitions.
 *
 * Features:
 * - Self-rescheduling: each poll schedules the next via setTimeout when it
 *   completes. Continues running indefinitely while mounted, even when the
 *   ETag is stable and no React state updates fire.
 * - Page Visibility aware: pauses polling while `document.hidden` is true
 *   (background tab) and resumes immediately when the tab becomes visible
 *   again. Eliminates the wasted 3s/cycle traffic in inactive tabs.
 * - ETag-based change detection: when the response carries an ETag matching
 *   the previous one, the state update is skipped to avoid a re-render. The
 *   ETag value lives in a ref so that ETag changes do not invalidate the
 *   `poll` callback identity (which would otherwise cause `useEffect` to
 *   re-run on every fetch).
 * - Cross-mount cache: when a `cacheKey` is provided, data persists across
 *   component unmount/remount cycles, eliminating the loading skeleton flash
 *   when navigating between tabs.
 * - Manual refetch capability for user-initiated refreshes.
 * - Error handling with callback support.
 * - Enable/disable toggle for conditional polling.
 *
 * Usage:
 * ```tsx
 * const { data, isLoading, error, refetch } = usePolling(
 *   () => fetch('/api/standings').then(r => r.json()),
 *   { interval: POLLING_INTERVAL, enabled: isActive, cacheKey: 'tournament/123/bm' }
 * );
 * ```
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { POLLING_INTERVAL } from '@/lib/constants';

/** TTL for cached polling entries: 30 minutes */
const POLLING_CACHE_TTL_MS = 30 * 60 * 1000;

/** Maximum number of entries in the polling cache */
const POLLING_CACHE_MAX_SIZE = 20;

/** Cache entry with timestamp for TTL tracking */
interface CacheEntry {
  data: unknown;
  timestamp: number;
}

/**
 * Module-level LRU cache for persisting polling data across component
 * unmount/remount cycles. When a component using usePolling unmounts
 * (e.g., navigating away from a tournament tab) and later remounts
 * (navigating back), the cached data is used as the initial state.
 * This prevents the loading skeleton flash that would otherwise occur
 * while the first poll request is in flight.
 *
 * The cache is keyed by the `cacheKey` option. Only hooks that
 * specify a cacheKey participate in caching.
 *
 * Max size is capped to prevent unbounded memory growth during long
 * sessions (e.g., admin browsing many tournaments). When the limit is
 * reached, the oldest entry is evicted (Map preserves insertion order).
 * Entries also expire after POLLING_CACHE_TTL_MS (30 minutes).
 */
const pollingCache = new Map<string, CacheEntry>();

/**
 * Evict expired entries and oldest entry if over capacity.
 * Called on every setCacheEntry to keep cache bounded.
 */
function evictStaleEntries(): void {
  const now = Date.now();
  for (const [key, entry] of pollingCache.entries()) {
    if (now - entry.timestamp > POLLING_CACHE_TTL_MS) {
      pollingCache.delete(key);
    }
  }
  while (pollingCache.size > POLLING_CACHE_MAX_SIZE) {
    const oldestKey = pollingCache.keys().next().value;
    if (oldestKey !== undefined) {
      pollingCache.delete(oldestKey);
    }
  }
}

/**
 * Set a value in the polling cache with LRU eviction and TTL expiration.
 * If the key already exists, it is deleted and re-inserted to move it
 * to the end (most recently used). Expired entries are evicted on each call.
 */
function setCacheEntry(key: string, value: unknown): void {
  // Delete first to ensure the key is removed from its current position
  // (Map preserves insertion order, so re-inserting moves key to end)
  pollingCache.delete(key);
  pollingCache.set(key, { data: value, timestamp: Date.now() });
  /* Evict AFTER inserting so the new entry actually contributes to the
   * size check. Running eviction before the insert would leave the cache
   * at MAX + 1 whenever adding the 21st key: pre-eviction size is 20
   * (not > 20), no removal happens, then the insert pushes size to 21.
   */
  evictStaleEntries();
}

/**
 * Get a cache entry if it exists and is not expired.
 * Returns undefined if the entry is missing or expired.
 */
function getCacheEntry(key: string): unknown | undefined {
  const entry = pollingCache.get(key);
  if (!entry) return undefined;
  if (Date.now() - entry.timestamp > POLLING_CACHE_TTL_MS) {
    pollingCache.delete(key);
    return undefined;
  }
  // Move to end (most recently used) on access
  pollingCache.delete(key);
  pollingCache.set(key, entry);
  return entry.data;
}

/**
 * Clear all cached polling data.
 * Exported for testing purposes and for use when the user logs out
 * or when stale data needs to be discarded.
 */
export function clearPollingCache(): void {
  pollingCache.clear();
}

/**
 * Configuration options for the usePolling hook.
 *
 * @property enabled   - When false, polling is paused and state is cleared (default: true)
 * @property interval  - Milliseconds between polls (default: POLLING_INTERVAL = 3000)
 * @property immediate - Whether to execute the first poll immediately on mount (default: true)
 * @property onSuccess - Optional callback invoked with the response data after each successful poll
 * @property onError   - Optional callback invoked with the error after a failed poll
 * @property cacheKey  - When provided, data is cached in a module-level Map and restored on
 *                       remount. This eliminates the loading skeleton flash when switching
 *                       between tournament tabs. Example: "tournament/abc123/bm"
 * @property pauseWhenHidden - When true (default), pause polling while the tab is hidden
 *                       (`document.hidden`) and resume on `visibilitychange`. Set to false
 *                       only for use cases that must keep ticking in background tabs.
 * @property initialData - Pre-fetched data from a Server Component. Used as the initial
 *                       state when the module-level cache has no entry for this key, so
 *                       the loading skeleton never flashes on first paint. Cache takes
 *                       precedence when warm (returning visitor), since it is at least as
 *                       fresh as the server render.
 */
export interface UsePollingOptions {
  enabled?: boolean;
  interval?: number;
  immediate?: boolean;
  onSuccess?: (data: unknown) => void;
  onError?: (error: Error) => void;
  cacheKey?: string;
  pauseWhenHidden?: boolean;
  initialData?: unknown;
}

/**
 * React hook that polls a data source at regular intervals.
 *
 * @param fetchFn - Async function that fetches and returns the data.
 *                  May optionally return an object with a `headers` property
 *                  containing an ETag for change detection.
 * @param options - Polling configuration (see UsePollingOptions)
 * @returns Object with data, loading state, error, and control functions
 */
export function usePolling<T>(
  fetchFn: () => Promise<T>,
  options: UsePollingOptions = {}
) {
  const {
    enabled = true,
    interval = POLLING_INTERVAL,
    immediate = true,
    onSuccess,
    onError,
    cacheKey,
    pauseWhenHidden = true,
    initialData,
  } = options;

  // Public state for the fetched data and last error.
  // Uses a lazy initializer (function form) so the cache lookup runs only
  // on the initial mount, not on every render.
  const [data, setData] = useState<T | null>(() => {
    // Cache takes precedence: a warm cache entry is at least as fresh as the
    // server render, and the returning-visitor path must not regress to server data.
    if (cacheKey) {
      const cached = getCacheEntry(cacheKey) as T | undefined;
      if (cached !== undefined) return cached;
    }
    // Fall back to server-provided initial data (eliminates loading skeleton flash
    // on first paint when a Server Component pre-fetched the data).
    return (initialData as T | undefined) ?? null;
  });
  const [error, setError] = useState<Error | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  /*
   * `lastETag` is also surfaced as state so consumers can render
   * "last updated" badges and the UI can react to changes. The *internal*
   * comparison, however, reads from `lastETagRef` so that updating the
   * ETag does not invalidate the `poll` callback identity. Keeping the ETag
   * out of `poll`'s dependency array is what allows the polling effect to
   * stay mounted across many fetches without re-running and re-scheduling
   * the timer on every successful poll.
   */
  const [lastETag, setLastETag] = useState<string | null>(null);
  const lastETagRef = useRef<string | null>(null);

  // Refs to track timer and mount state across renders
  const pollingRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // isMountedRef prevents state updates on unmounted components, which
  // would cause React warnings and potential memory leaks
  const isMountedRef = useRef(true);
  // pollRef holds the latest poll function to avoid stale closures
  // in the setTimeout callback. We invoke poll via this ref instead of
  // including it in the effect's deps, so the effect runs only when
  // its real lifecycle inputs (enabled/interval/immediate) change.
  const pollRef = useRef<(() => Promise<void>) | null>(null);
  // schedulerRef likewise holds the current scheduler so visibilitychange
  // and refetch handlers can re-arm the timer without depending on the
  // effect closure.
  const schedulerRef = useRef<(() => void) | null>(null);

  /**
   * Core polling function. Executes the fetch, handles ETag comparison,
   * and updates state accordingly.
   *
   * ETag handling: If the response object has a `headers.get('etag')` method
   * (i.e., it's a Response-like object), the ETag is compared with the last
   * known value (from `lastETagRef`, not `lastETag` state). If unchanged,
   * the state update is skipped to prevent unnecessary re-renders.
   */
  const poll = useCallback(async () => {
    // Guard against polling after component unmount
    if (!isMountedRef.current) return;

    try {
      setIsLoading(true);
      const response = await fetchFn();

      // Attempt to extract ETag from the response headers (if present).
      // This works with fetch() Response objects or any object that exposes
      // a headers.get() method.
      const responseObj = response as { headers?: { get: (name: string) => string | null } };
      const currentETag = responseObj?.headers?.get('etag') ?? null;

      // If we have an ETag and it matches the previous one, the data
      // hasn't changed -- skip the state update to avoid re-renders.
      // Compare against the ref (always-current value), not state.
      if (currentETag && currentETag === lastETagRef.current) {
        setIsLoading(false);
        return;
      }

      // Update ETag tracking — both ref (for next comparison) and state
      // (for UI consumers reading lastETag/lastUpdated).
      lastETagRef.current = currentETag;
      setLastETag(currentETag);

      // Update the data state with the fresh response
      setData(response);

      // Persist to module-level LRU cache so subsequent mounts of the same
      // component (e.g., navigating back to this tab) start with fresh data
      if (cacheKey) {
        setCacheEntry(cacheKey, response);
      }

      // Invoke the success callback if provided
      if (onSuccess) {
        onSuccess(response);
      }

      // Clear any previous error on successful fetch
      setError(null);
    } catch (err) {
      // Normalize the error to an Error instance
      const error = err instanceof Error ? err : new Error('Polling failed');
      setError(error);

      // Invoke the error callback if provided
      if (onError) {
        onError(error);
      }
    } finally {
      setIsLoading(false);
    }
    // Note: lastETag is intentionally NOT in this dep list. We read the
    // current ETag via lastETagRef so that the poll callback identity
    // stays stable across fetches. Without this, every successful poll
    // would invalidate the effect below and re-arm the timer.
  }, [fetchFn, onSuccess, onError, cacheKey]);

  // Keep pollRef in sync with the latest poll function so the timer's
  // setTimeout callback always invokes the most recent closure.
  pollRef.current = poll;

  /**
   * Clean up polling state: cancel any pending timer and clear loading/
   * error state. Marks the hook as unmounted so any in-flight poll bails
   * out before touching state.
   */
  const clearPolling = useCallback(() => {
    isMountedRef.current = false;
    setIsLoading(false);
    if (pollingRef.current) {
      clearTimeout(pollingRef.current);
      pollingRef.current = null;
    }
    setError(null);
  }, []);

  /**
   * Effect that manages the polling lifecycle.
   *
   * Lifecycle inputs are limited to `enabled` / `interval` / `immediate` so
   * the effect does not re-run on every successful fetch (which previously
   * happened because `poll` was in the dep list and `poll` changed whenever
   * `lastETag` changed). Stable lifecycle inputs let the timer self-schedule
   * indefinitely without React tearing it down between polls.
   *
   * Self-rescheduling: each poll, on completion, schedules the next one via
   * setTimeout. This replaces the previous "single setTimeout per effect run"
   * model, which silently stopped after one cycle whenever the ETag stabilised
   * (no state change → no re-render → no effect re-run → no new timer).
   *
   * Visibility: while `document.hidden` is true and `pauseWhenHidden` is
   * enabled, `scheduleNext` no-ops. The visibilitychange listener fires a
   * fresh poll the moment the tab returns to the foreground.
   */
  useEffect(() => {
    isMountedRef.current = true;

    if (!enabled) {
      clearPolling();
      return;
    }

    /**
     * Schedule the next poll. No-op if the tab is hidden (we resume via
     * the visibilitychange listener) or if the component has unmounted.
     */
    const scheduleNext = () => {
      if (!isMountedRef.current) return;
      if (
        pauseWhenHidden &&
        typeof document !== 'undefined' &&
        document.hidden
      ) {
        // Hidden tab: do not schedule. visibilitychange handler resumes.
        return;
      }
      if (pollingRef.current) {
        clearTimeout(pollingRef.current);
      }
      pollingRef.current = setTimeout(() => {
        if (!isMountedRef.current) return;
        const fn = pollRef.current;
        if (!fn) return;
        // Run the poll, then chain the next schedule. Errors inside the
        // poll are caught by `poll` itself (it never rejects), so we don't
        // need a try/catch here.
        void fn().then(() => {
          scheduleNext();
        });
      }, interval);
    };
    schedulerRef.current = scheduleNext;

    /**
     * Run a poll right now and chain the next schedule.
     * Used for `immediate`, `visibilitychange → visible`, and `refetch`.
     */
    const runNow = () => {
      if (!isMountedRef.current) return;
      // Cancel any pending timer so we don't double-fire.
      if (pollingRef.current) {
        clearTimeout(pollingRef.current);
        pollingRef.current = null;
      }
      const fn = pollRef.current;
      if (!fn) {
        scheduleNext();
        return;
      }
      void fn().then(() => {
        scheduleNext();
      });
    };

    if (immediate) {
      runNow();
    } else {
      scheduleNext();
    }

    /**
     * Visibility handler. When the tab becomes visible we poll immediately
     * (so the UI does not wait up to `interval` for fresh data) and the
     * normal cadence resumes from there. When it becomes hidden we cancel
     * any pending timer; `scheduleNext` will refuse to arm a new one until
     * the tab is visible again.
     */
    const onVisibilityChange = () => {
      if (!isMountedRef.current) return;
      if (typeof document === 'undefined') return;
      if (document.hidden) {
        if (pollingRef.current) {
          clearTimeout(pollingRef.current);
          pollingRef.current = null;
        }
        return;
      }
      runNow();
    };

    if (pauseWhenHidden && typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisibilityChange);
    }

    // Cleanup function: cancel timer, drop listeners, and reset state on unmount
    return () => {
      if (pauseWhenHidden && typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisibilityChange);
      }
      schedulerRef.current = null;
      clearPolling();
    };
    // `poll` is intentionally omitted from deps; we invoke it via pollRef
    // so the effect stays mounted across fetches. See the comment on `poll`.
  }, [enabled, interval, immediate, pauseWhenHidden, clearPolling]);

  /**
   * Manually trigger a refetch outside the regular polling cycle.
   * Cancels the pending timer, runs a poll immediately, and re-arms
   * the next interval from the result. Useful for "refresh" buttons or
   * after user actions that are expected to change the data.
   */
  const manuallyRefetch = useCallback(() => {
    if (pollingRef.current) {
      clearTimeout(pollingRef.current);
      pollingRef.current = null;
    }
    const fn = pollRef.current;
    if (!fn) return undefined;
    return fn().then(() => {
      // Re-arm the regular cadence after the manual fetch.
      const sched = schedulerRef.current;
      if (sched) sched();
    });
  }, []);

  // Return a comprehensive API for consumers.
  // Both `isLoading` and `loading` are provided for naming flexibility.
  // `error` is returned as a string message (or null) for simpler display.
  // `lastUpdated` attempts to parse the ETag as a date (may not always be meaningful).
  return {
    data,
    isLoading,
    loading: isLoading,
    error: error?.message || null,
    lastETag,
    lastUpdated: lastETag ? new Date(lastETag) : null,
    isPolling: isLoading,
    refetch: manuallyRefetch,
  };
}
