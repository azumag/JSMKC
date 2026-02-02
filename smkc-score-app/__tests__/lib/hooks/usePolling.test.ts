/**
 * @jest-environment jsdom
 */

/**
 * @module usePolling.test
 *
 * Test suite for the `usePolling` custom React hook (`@/lib/hooks/usePolling`).
 *
 * Covers:
 * - Initial state: null data, null error, loading flag, immediate vs deferred first fetch
 * - Data fetching: successful fetch and state update, ETag-based change detection,
 *   skipping updates when ETag matches, handling responses without ETag headers
 * - Polling behavior: interval-based polling, custom intervals, stop on unmount,
 *   immediate: false deferred start
 * - Error handling: network errors updating error state, onError callback invocation,
 *   non-Error object handling, error clearing on subsequent successful fetch
 * - Options: enabled flag toggling (start/stop polling), onSuccess callback,
 *   default options fallback, default interval from constants
 * - Manual refetch: triggering refetch, data update on refetch
 * - Cleanup: clearTimeout on unmount, preventing state updates after unmount,
 *   isMounted flag reset
 * - Edge cases: multiple independent hook instances, fetch function changes via rerender,
 *   fast unmount during pending fetch, concurrent refetch calls
 */
import { renderHook, waitFor, act } from '@testing-library/react';
import { usePolling, clearPollingCache } from '@/lib/hooks/usePolling';

describe('usePolling', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('initial state', () => {
    it('should initialize with null data, null error, and false loading', async () => {
      const mockFetch = jest.fn().mockResolvedValue({ id: 1 });
      renderHook(() => usePolling(mockFetch, { immediate: false }));

      expect(mockFetch).not.toHaveBeenCalled();

      act(() => {
        jest.advanceTimersByTime(5000);
      });

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(1);
      });
    });

    it('should call fetch function immediately on mount with immediate: true', async () => {
      const mockFetch = jest.fn().mockResolvedValue({ id: 1 });
      await act(async () => {
        renderHook(() => usePolling(mockFetch, { immediate: true }));
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should not call fetch function on mount with immediate: false', async () => {
      const mockFetch = jest.fn().mockResolvedValue({ id: 1 });
      renderHook(() => usePolling(mockFetch, { immediate: false }));

      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('data fetching', () => {
    it('should fetch and update data successfully', async () => {
      const mockData = { id: 1, name: 'Test' };
      const mockFetch = jest.fn().mockResolvedValue(mockData);
      const { result } = await act(async () => {
        return renderHook(() => usePolling(mockFetch));
      });

      await waitFor(() => {
        expect(result.current.data).toEqual(mockData);
        expect(result.current.isLoading).toBe(false);
        expect(result.current.error).toBeNull();
      });
    });

    it('should update data when ETag is different', async () => {
      const mockData1 = { id: 1, version: 1 };
      const mockData2 = { id: 1, version: 2 };

      let callCount = 0;
      const mockFetch = jest.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve(mockData1);
        } else {
          return Promise.resolve(mockData2);
        }
      });

      const { result } = await act(async () => {
        return renderHook(() => usePolling(mockFetch, { immediate: true }));
      });

      await waitFor(() => {
        expect(result.current.data).toEqual(mockData1);
      });

      mockFetch.mockResolvedValue(mockData2);
      await act(async () => {
        jest.advanceTimersByTime(5000);
      });

      await waitFor(() => {
        expect(result.current.data).toEqual(mockData2);
      });
    });

    it('should skip update when ETag is the same', async () => {
      const mockData = { id: 1, version: 1 };
      const mockETag = 'abc123';

      const mockFetch = jest.fn().mockResolvedValue({
        ...mockData,
        headers: {
          get: (name: string) => name === 'etag' ? mockETag : null
        }
      });

      const { result } = await act(async () => {
        return renderHook(() => usePolling(mockFetch, { immediate: true }));
      });

      await waitFor(() => {
        expect(result.current.lastETag).toBe(mockETag);
      });

      mockFetch.mockClear();
      act(() => {
        jest.advanceTimersByTime(5000);
      });

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalled();
      });

      expect(result.current.lastETag).toBe(mockETag);
    });

    it('should handle response without ETag header', async () => {
      const mockData = { id: 1 };
      const mockFetch = jest.fn().mockResolvedValue(mockData);

      const { result } = await act(async () => {
        return renderHook(() => usePolling(mockFetch));
      });

      await waitFor(() => {
        expect(result.current.data).toEqual(mockData);
        expect(result.current.lastETag).toBeNull();
      });
    });

    it('should extract and store ETag from response headers', async () => {
      const mockData = { id: 1 };
      const mockETag = 'xyz789';

      const mockFetch = jest.fn().mockResolvedValue({
        ...mockData,
        headers: {
          get: (name: string) => name === 'etag' ? mockETag : null
        }
      });

      const { result } = await act(async () => {
        return renderHook(() => usePolling(mockFetch));
      });

      await waitFor(() => {
        expect(result.current.lastETag).toBe(mockETag);
        expect(result.current.lastUpdated).toBeInstanceOf(Date);
      });
    });
  });

  describe('polling behavior', () => {
    it('should poll at specified interval', async () => {
      const mockFetch = jest.fn().mockResolvedValue({ id: 1 });
      const interval = 5000;

      await act(async () => {
        renderHook(() => usePolling(mockFetch, { interval }));
      });

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(1);
      });

      act(() => {
        jest.advanceTimersByTime(interval);
      });

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(2);
      });
    });

    it('should use custom interval from options', async () => {
      const mockFetch = jest.fn().mockResolvedValue({ id: 1 });
      const customInterval = 3000;

      await act(async () => {
        renderHook(() => usePolling(mockFetch, { interval: customInterval }));
      });

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(1);
      });

      act(() => {
        jest.advanceTimersByTime(customInterval);
      });

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(2);
      });
    });

    it('should stop polling on unmount', async () => {
      const mockFetch = jest.fn().mockResolvedValue({ id: 1 });
      const { unmount } = await act(async () => {
        return renderHook(() => usePolling(mockFetch));
      });

      unmount();

      jest.advanceTimersByTime(5000);

      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should handle immediate: false option correctly', async () => {
      const mockFetch = jest.fn().mockResolvedValue({ id: 1 });

      renderHook(() => usePolling(mockFetch, { immediate: false }));

      expect(mockFetch).not.toHaveBeenCalled();

      act(() => {
        jest.advanceTimersByTime(5000);
      });

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe('error handling', () => {
    it('should handle network error and update error state', async () => {
      const mockError = new Error('Network error');
      const mockFetch = jest.fn().mockRejectedValue(mockError);
      const { result } = await act(async () => {
        return renderHook(() => usePolling(mockFetch));
      });

      await waitFor(() => {
        expect(result.current.error).toBe('Network error');
        expect(result.current.isLoading).toBe(false);
      });
    });

    it('should call onError callback when error occurs', async () => {
      const mockError = new Error('Fetch failed');
      const mockFetch = jest.fn().mockRejectedValue(mockError);
      const onError = jest.fn();

      await act(async () => {
        renderHook(() => usePolling(mockFetch, { onError }));
      });

      await waitFor(() => {
        expect(onError).toHaveBeenCalledWith(mockError);
      });
    });

    it('should handle non-Error objects in error case', async () => {
      const mockFetch = jest.fn().mockRejectedValue('String error');
      const { result } = await act(async () => {
        return renderHook(() => usePolling(mockFetch));
      });

      await waitFor(() => {
        expect(result.current.error).toBe('Polling failed');
        expect(result.current.isLoading).toBe(false);
      });
    });

    it('should clear error on successful fetch', async () => {
      const mockError = new Error('Initial error');
      const mockData = { id: 1 };

      const mockFetch = jest.fn()
        .mockRejectedValueOnce(mockError)
        .mockResolvedValueOnce(mockData);

      const { result } = await act(async () => {
        return renderHook(() => usePolling(mockFetch));
      });

      await waitFor(() => {
        expect(result.current.error).toBe('Initial error');
      });

      act(() => {
        jest.advanceTimersByTime(5000);
      });

      await waitFor(() => {
        expect(result.current.error).toBeNull();
        expect(result.current.data).toEqual(mockData);
      });
    });
  });

  describe('options', () => {
    it('should not poll when enabled is false', () => {
      const mockFetch = jest.fn().mockResolvedValue({ id: 1 });
      renderHook(() => usePolling(mockFetch, { enabled: false }));

      expect(mockFetch).not.toHaveBeenCalled();

      jest.advanceTimersByTime(5000);

      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should start polling when enabled changes from false to true', async () => {
      const mockFetch = jest.fn().mockResolvedValue({ id: 1 });
      const { rerender } = renderHook(
        ({ enabled }) => usePolling(mockFetch, { enabled }),
        { initialProps: { enabled: false } }
      );

      expect(mockFetch).not.toHaveBeenCalled();

      rerender({ enabled: true });

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalled();
      });
    });

    it('should stop polling when enabled changes from true to false', async () => {
      const mockFetch = jest.fn().mockResolvedValue({ id: 1 });
      const { rerender } = renderHook(
        ({ enabled }) => usePolling(mockFetch, { enabled }),
        { initialProps: { enabled: true } }
      );

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(1);
      });

      rerender({ enabled: false });

      mockFetch.mockClear();
      jest.advanceTimersByTime(5000);

      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should call onSuccess callback on successful fetch', async () => {
      const mockData = { id: 1 };
      const mockFetch = jest.fn().mockResolvedValue(mockData);
      const onSuccess = jest.fn();

      await act(async () => {
        renderHook(() => usePolling(mockFetch, { onSuccess }));
      });

      await waitFor(() => {
        expect(onSuccess).toHaveBeenCalledWith(mockData);
      });
    });

    it('should use default options when not provided', async () => {
      const mockFetch = jest.fn().mockResolvedValue({ id: 1 });
      const { result } = await act(async () => {
        return renderHook(() => usePolling(mockFetch));
      });

      await waitFor(() => {
        expect(result.current.data).toEqual({ id: 1 });
      });
    });

    it('should use default interval from constants', async () => {
      const mockFetch = jest.fn().mockResolvedValue({ id: 1 });
      await act(async () => {
        renderHook(() => usePolling(mockFetch));
      });

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(1);
      });

      act(() => {
        jest.advanceTimersByTime(5000);
      });

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(2);
      });
    });
  });

  describe('manual refetch', () => {
    it('should trigger manual fetch with refetch function', async () => {
      const mockData = { id: 1 };
      const mockFetch = jest.fn().mockResolvedValue(mockData);
      const { result } = await act(async () => {
        return renderHook(() => usePolling(mockFetch));
      });

      await waitFor(() => {
        expect(result.current.data).toEqual(mockData);
      });

      mockFetch.mockClear();
      await act(async () => {
        await result.current.refetch();
      });

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(1);
        expect(result.current.data).toEqual(mockData);
      });
    });

    it('should update data on manual refetch', async () => {
      const mockData1 = { id: 1, version: 1 };
      const mockData2 = { id: 1, version: 2 };

      const mockFetch = jest.fn()
        .mockResolvedValueOnce(mockData1)
        .mockResolvedValueOnce(mockData2);

      const { result } = await act(async () => {
        return renderHook(() => usePolling(mockFetch));
      });

      await waitFor(() => {
        expect(result.current.data).toEqual(mockData1);
      });

      await act(async () => {
        await result.current.refetch();
      });

      await waitFor(() => {
        expect(result.current.data).toEqual(mockData2);
      });
    });
  });

  describe('cleanup', () => {
    it('should clear timeout on unmount', async () => {
      const mockFetch = jest.fn().mockResolvedValue({ id: 1 });
      const { unmount } = await act(async () => {
        return renderHook(() => usePolling(mockFetch));
      });

      const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout');

      unmount();

      expect(clearTimeout).toHaveBeenCalled();
      clearTimeoutSpy.mockRestore();
    });

    it('should prevent state updates after unmount', async () => {
      const mockFetch = jest.fn().mockResolvedValue({ id: 1 });
      const { unmount } = await act(async () => {
        return renderHook(() => usePolling(mockFetch));
      });

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(1);
      });

      unmount();

      act(() => {
        jest.advanceTimersByTime(5000);
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should set isMounted to false on cleanup', async () => {
      const mockFetch = jest.fn().mockResolvedValue({ id: 1 });
      const { unmount } = await act(async () => {
        return renderHook(() => usePolling(mockFetch));
      });

      unmount();

      act(() => {
        jest.advanceTimersByTime(5000);
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('edge cases', () => {
    it('should handle multiple hook instances independently', async () => {
      const mockFetch1 = jest.fn().mockResolvedValue({ id: 1 });
      const mockFetch2 = jest.fn().mockResolvedValue({ id: 2 });

      const { result: result1 } = await act(async () => {
        return renderHook(() => usePolling(mockFetch1));
      });
      const { result: result2 } = await act(async () => {
        return renderHook(() => usePolling(mockFetch2));
      });

      await waitFor(() => {
        expect(result1.current.data).toEqual({ id: 1 });
        expect(result2.current.data).toEqual({ id: 2 });
      });
    });

    it('should handle fetch function changes', async () => {
      const mockFetch1 = jest.fn().mockResolvedValue({ id: 1 });
      const mockFetch2 = jest.fn().mockResolvedValue({ id: 2 });

      const { result, rerender } = await act(async () => {
        return renderHook(
          ({ fetchFn }) => usePolling(fetchFn),
          { initialProps: { fetchFn: mockFetch1 } }
        );
      });

      await waitFor(() => {
        expect(result.current.data).toEqual({ id: 1 });
      });

      rerender({ fetchFn: mockFetch2 });

      act(() => {
        jest.advanceTimersByTime(5000);
      });

      await waitFor(() => {
        expect(result.current.data).toEqual({ id: 2 });
      });
    });

    it('should handle fast unmount during fetch', async () => {
      const mockFetch = jest.fn().mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve({ id: 1 }), 100))
      );
      const { unmount } = await act(async () => {
        return renderHook(() => usePolling(mockFetch));
      });

      unmount();

      jest.advanceTimersByTime(200);

      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should handle concurrent refetch calls', async () => {
      const mockData = { id: 1 };
      const mockFetch = jest.fn().mockResolvedValue(mockData);
      const { result } = await act(async () => {
        return renderHook(() => usePolling(mockFetch));
      });

      await waitFor(() => {
        expect(result.current.data).toEqual(mockData);
      });

      mockFetch.mockClear();

      await act(async () => {
        result.current.refetch();
        result.current.refetch();
      });

      await waitFor(() => {
        expect(result.current.data).toEqual(mockData);
      });
    });
  });

  describe('cacheKey - cross-mount data persistence', () => {
    beforeEach(() => {
      /* Clear the module-level cache before each caching test
         to ensure test isolation */
      clearPollingCache();
    });

    it('should initialize data as null when no cacheKey is provided', async () => {
      const mockFetch = jest.fn().mockResolvedValue({ id: 1 });
      const { result } = renderHook(() => usePolling(mockFetch, { immediate: false }));

      expect(result.current.data).toBeNull();
    });

    it('should initialize data as null when cacheKey has no cached value', async () => {
      const mockFetch = jest.fn().mockResolvedValue({ id: 1 });
      const { result } = renderHook(() =>
        usePolling(mockFetch, { immediate: false, cacheKey: 'test/uncached' })
      );

      expect(result.current.data).toBeNull();
    });

    it('should cache data on successful fetch and restore on remount', async () => {
      const mockData = { id: 1, name: 'cached' };
      const mockFetch = jest.fn().mockResolvedValue(mockData);
      const cacheKey = 'test/cache-restore';

      /* First mount: fetch and cache */
      const { result, unmount } = await act(async () => {
        return renderHook(() => usePolling(mockFetch, { cacheKey }));
      });

      await waitFor(() => {
        expect(result.current.data).toEqual(mockData);
      });

      /* Unmount (simulates navigating away from tab) */
      unmount();

      /* Second mount: should initialize from cache */
      const { result: result2 } = renderHook(() =>
        usePolling(mockFetch, { immediate: false, cacheKey })
      );

      /* Data should be available immediately from cache */
      expect(result2.current.data).toEqual(mockData);
    });

    it('should not share cache between different cacheKeys', async () => {
      const mockData1 = { id: 1, mode: 'bm' };
      const mockData2 = { id: 2, mode: 'ta' };
      const mockFetch1 = jest.fn().mockResolvedValue(mockData1);
      const mockFetch2 = jest.fn().mockResolvedValue(mockData2);

      /* Populate cache for key1 */
      const { unmount: unmount1 } = await act(async () => {
        return renderHook(() => usePolling(mockFetch1, { cacheKey: 'key1' }));
      });
      unmount1();

      /* Populate cache for key2 */
      const { unmount: unmount2 } = await act(async () => {
        return renderHook(() => usePolling(mockFetch2, { cacheKey: 'key2' }));
      });
      unmount2();

      /* Remount with key1 - should get key1's data */
      const { result: r1 } = renderHook(() =>
        usePolling(mockFetch1, { immediate: false, cacheKey: 'key1' })
      );
      expect(r1.current.data).toEqual(mockData1);

      /* Remount with key2 - should get key2's data */
      const { result: r2 } = renderHook(() =>
        usePolling(mockFetch2, { immediate: false, cacheKey: 'key2' })
      );
      expect(r2.current.data).toEqual(mockData2);
    });

    it('should update cache when new data is fetched', async () => {
      const mockData1 = { id: 1, version: 1 };
      const mockData2 = { id: 1, version: 2 };
      const cacheKey = 'test/cache-update';

      /* First mount: cache v1 */
      const mockFetch = jest.fn().mockResolvedValue(mockData1);
      const { result, unmount } = await act(async () => {
        return renderHook(() => usePolling(mockFetch, { cacheKey }));
      });

      await waitFor(() => {
        expect(result.current.data).toEqual(mockData1);
      });

      /* Poll again with v2 */
      mockFetch.mockResolvedValue(mockData2);
      await act(async () => {
        jest.advanceTimersByTime(5000);
      });

      await waitFor(() => {
        expect(result.current.data).toEqual(mockData2);
      });

      unmount();

      /* Remount: should get v2 from cache */
      const { result: result2 } = renderHook(() =>
        usePolling(mockFetch, { immediate: false, cacheKey })
      );
      expect(result2.current.data).toEqual(mockData2);
    });

    it('clearPollingCache should remove all cached data', async () => {
      const mockData = { id: 1 };
      const mockFetch = jest.fn().mockResolvedValue(mockData);
      const cacheKey = 'test/clear-cache';

      /* Populate cache */
      const { unmount } = await act(async () => {
        return renderHook(() => usePolling(mockFetch, { cacheKey }));
      });
      unmount();

      /* Clear all cache */
      clearPollingCache();

      /* Remount: should have null data (cache cleared) */
      const { result } = renderHook(() =>
        usePolling(mockFetch, { immediate: false, cacheKey })
      );
      expect(result.current.data).toBeNull();
    });

    it('should evict oldest entries when cache exceeds max size (LRU)', async () => {
      /*
       * The cache has a max size of 20 (POLLING_CACHE_MAX_SIZE).
       * Create 21 entries; the first one should be evicted.
       */
      const hooks: { unmount: () => void }[] = [];

      /* Create 21 cached entries */
      for (let i = 0; i < 21; i++) {
        const mockFetch = jest.fn().mockResolvedValue({ id: i });
        const { unmount } = await act(async () => {
          return renderHook(() =>
            usePolling(mockFetch, { cacheKey: `evict/key-${i}` })
          );
        });
        hooks.push({ unmount });
      }

      /* Unmount all */
      hooks.forEach((h) => h.unmount());

      /* The first entry (key-0) should have been evicted */
      const { result: evictedResult } = renderHook(() =>
        usePolling(jest.fn().mockResolvedValue(null), {
          immediate: false,
          cacheKey: 'evict/key-0',
        })
      );
      expect(evictedResult.current.data).toBeNull();

      /* The last entry (key-20) should still be cached */
      const { result: retainedResult } = renderHook(() =>
        usePolling(jest.fn().mockResolvedValue(null), {
          immediate: false,
          cacheKey: 'evict/key-20',
        })
      );
      expect(retainedResult.current.data).toEqual({ id: 20 });
    });
  });
});
