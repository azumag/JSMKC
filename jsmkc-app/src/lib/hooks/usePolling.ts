import { useEffect, useRef, useState, useCallback } from 'react';
import { POLLING_INTERVAL } from '@/lib/constants';

interface UsePollingOptions {
  enabled?: boolean;
  interval?: number;
  immediate?: boolean;
  onSuccess?: (data: unknown) => void;
  onError?: (error: Error) => void;
}

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
  } = options;

  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [lastETag, setLastETag] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const isMountedRef = useRef(true);
  const pollRef = useRef<(() => Promise<void>) | null>(null);

  const poll = useCallback(async () => {
    if (!isMountedRef.current) return;

    try {
      setIsLoading(true);
      const response = await fetchFn();
      const responseObj = response as { headers?: { get: (name: string) => string | null } };
      const currentETag = responseObj?.headers?.get('etag');

      if (currentETag && currentETag === lastETag) {
        setIsLoading(false);
        return;
      }

      setLastETag(currentETag ?? null);
      setData(response);

      if (onSuccess) {
        onSuccess(response);
      }

      setError(null);
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Polling failed');
      setError(error);

      if (onError) {
        onError(error);
      }
    } finally {
      setIsLoading(false);
    }
  }, [fetchFn, lastETag, onSuccess, onError]);

  pollRef.current = poll;

  const clearPolling = useCallback(() => {
    isMountedRef.current = false;
    setIsLoading(false);
    if (pollingRef.current) {
      clearTimeout(pollingRef.current);
      pollingRef.current = null;
    }
    setError(null);
  }, []);

  useEffect(() => {
    isMountedRef.current = true;

    if (!enabled) {
      clearPolling();
      return;
    }

    const executePoll = async () => {
      if (isMountedRef.current && pollRef.current) {
        await pollRef.current();
      }
    };

    if (immediate) {
      executePoll();
    }

    pollingRef.current = setTimeout(() => {
      if (isMountedRef.current) {
        executePoll();
      }
    }, interval);

    return () => {
      clearPolling();
    };
  }, [enabled, interval, immediate, poll, clearPolling]);

  const manuallyRefetch = useCallback(() => {
    if (pollRef.current) {
      return pollRef.current();
    }
  }, []);

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
