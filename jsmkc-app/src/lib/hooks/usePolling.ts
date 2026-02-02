/**
 * usePolling - React Hook for Periodic Data Fetching
 *
 * This hook provides a configurable polling mechanism for React components
 * that need to periodically refresh data from the server. It is used
 * throughout the tournament UI to keep standings, scores, and bracket
 * states up to date in real time during active competitions.
 *
 * Features:
 * - Configurable polling interval (default: POLLING_INTERVAL from constants = 5s)
 * - ETag-based change detection: skips state updates when data hasn't changed,
 *   reducing unnecessary re-renders
 * - Cross-mount cache: when a cacheKey is provided, data persists across
 *   component unmount/remount cycles, eliminating the loading skeleton flash
 *   when navigating between tabs
 * - Automatic cleanup on unmount to prevent memory leaks and state updates
 *   on unmounted components
 * - Manual refetch capability for user-initiated refreshes
 * - Error handling with callback support
 * - Enable/disable toggle for conditional polling (e.g., only poll when
 *   the tournament is in an active phase)
 *
 * Usage:
 * ```tsx
 * const { data, isLoading, error, refetch } = usePolling(
 *   () => fetch('/api/standings').then(r => r.json()),
 *   { interval: 5000, enabled: isActive, cacheKey: 'tournament/123/bm' }
 * );
 * ```
 *
 * Note: The hook uses setTimeout (not setInterval) to schedule the next poll
 * after the current effect runs. This means the interval is measured from
 * effect execution, not from the completion of the fetch.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { POLLING_INTERVAL } from '@/lib/constants';

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
 */
const pollingCache = new Map<string, unknown>();

/**
 * Maximum number of entries in the polling cache.
 * 20 entries covers ~4 tournaments × 5 tabs each, which is a reasonable
 * working set for a single-user admin session.
 */
const POLLING_CACHE_MAX_SIZE = 20;

/**
 * Set a value in the polling cache with LRU eviction.
 * If the key already exists, it is deleted and re-inserted to move it
 * to the end (most recently used). If the cache exceeds the max size,
 * the oldest entry (first in Map iteration order) is evicted.
 */
function setCacheEntry(key: string, value: unknown): void {
  // Delete first to re-insert at the end (LRU ordering)
  pollingCache.delete(key);
  pollingCache.set(key, value);

  // Evict oldest entry if over capacity
  if (pollingCache.size > POLLING_CACHE_MAX_SIZE) {
    const oldestKey = pollingCache.keys().next().value;
    if (oldestKey !== undefined) {
      pollingCache.delete(oldestKey);
    }
  }
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
 * @property interval  - Milliseconds between polls (default: POLLING_INTERVAL = 5000)
 * @property immediate - Whether to execute the first poll immediately on mount (default: true)
 * @property onSuccess - Optional callback invoked with the response data after each successful poll
 * @property onError   - Optional callback invoked with the error after a failed poll
 * @property cacheKey  - When provided, data is cached in a module-level Map and restored on
 *                       remount. This eliminates the loading skeleton flash when switching
 *                       between tournament tabs. Example: "tournament/abc123/bm"
 */
interface UsePollingOptions {
  enabled?: boolean;
  interval?: number;
  immediate?: boolean;
  onSuccess?: (data: unknown) => void;
  onError?: (error: Error) => void;
  cacheKey?: string;
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
  } = options;

  // State for the fetched data, errors, and ETag tracking.
  // Uses a lazy initializer (function form) so the cache lookup runs only
  // on the initial mount, not on every render.
  const [data, setData] = useState<T | null>(() =>
    cacheKey && pollingCache.has(cacheKey)
      ? (pollingCache.get(cacheKey) as T)
      : null
  );
  const [error, setError] = useState<Error | null>(null);
  const [lastETag, setLastETag] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Refs to track timer and mount state across renders
  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  // isMountedRef prevents state updates on unmounted components,
  // which would cause React warnings and potential memory leaks
  const isMountedRef = useRef(true);
  // pollRef holds the latest poll function to avoid stale closures
  // in the setTimeout callback
  const pollRef = useRef<(() => Promise<void>) | null>(null);

  /**
   * Core polling function. Executes the fetch, handles ETag comparison,
   * and updates state accordingly.
   *
   * ETag handling: If the response object has a `headers.get('etag')` method
   * (i.e., it's a Response-like object), the ETag is compared with the last
   * known value. If unchanged, the state update is skipped to prevent
   * unnecessary re-renders.
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
      const currentETag = responseObj?.headers?.get('etag');

      // If we have an ETag and it matches the previous one, the data
      // hasn't changed -- skip the state update to avoid re-renders
      if (currentETag && currentETag === lastETag) {
        setIsLoading(false);
        return;
      }

      // Update ETag tracking
      setLastETag(currentETag ?? null);
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
  }, [fetchFn, lastETag, onSuccess, onError, cacheKey]);

  // Keep pollRef in sync with the latest poll function.
  // This is assigned outside useEffect so the setTimeout callback
  // always calls the most recent version, avoiding stale closure issues.
  pollRef.current = poll;

  /**
   * Clean up polling state: cancel any pending timer, reset mount flag,
   * and clear loading/error state.
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
   * On mount (or when dependencies change):
   * - If enabled and immediate, executes a poll right away
   * - Schedules the next poll after `interval` milliseconds
   *
   * On unmount (or dependency change), clears polling to prevent leaks.
   *
   * Note: Uses setTimeout rather than setInterval. This means the interval
   * starts from when the effect runs, not from when the previous fetch completes.
   * For most tournament polling use cases (5s intervals), this difference is negligible.
   */
  useEffect(() => {
    // Mark component as mounted for the guard in poll()
    isMountedRef.current = true;

    // If polling is disabled, clean up and exit early
    if (!enabled) {
      clearPolling();
      return;
    }

    // Wrapper that safely calls the latest poll function via ref
    const executePoll = async () => {
      if (isMountedRef.current && pollRef.current) {
        await pollRef.current();
      }
    };

    // Execute immediately on mount if configured to do so
    if (immediate) {
      executePoll();
    }

    // Schedule the next poll after the configured interval
    pollingRef.current = setTimeout(() => {
      if (isMountedRef.current) {
        executePoll();
      }
    }, interval);

    // Cleanup function: cancel timer and reset state on unmount
    return () => {
      clearPolling();
    };
  }, [enabled, interval, immediate, poll, clearPolling]);

  /**
   * Manually trigger a refetch outside the regular polling cycle.
   * Useful for "refresh" buttons or after user actions that are
   * expected to change the data.
   */
  const manuallyRefetch = useCallback(() => {
    if (pollRef.current) {
      return pollRef.current();
    }
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
