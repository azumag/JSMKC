import { useState, useEffect, useRef, useCallback } from "react";

interface UsePollingOptions<T> {
  fetchFn: () => Promise<T>;
  interval?: number;
  enabled?: boolean;
}

interface UsePollingReturn<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  lastUpdated: Date | null;
  isPolling: boolean;
  refetch: () => Promise<void>;
}

export function usePolling<T>({
  fetchFn,
  interval = 3000,
  enabled = true,
}: UsePollingOptions<T>): UsePollingReturn<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [isPolling, setIsPolling] = useState(false);

  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const prevDataRef = useRef<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await fetchFn();

      const currentDataString = JSON.stringify(result);
      const prevDataString = prevDataRef.current;

      if (prevDataString !== currentDataString) {
        setData(result);
        setLastUpdated(new Date());
      }

      prevDataRef.current = currentDataString;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to fetch data";
      setError(errorMessage);
      console.error("Polling error:", err);
    } finally {
      setLoading(false);
    }
  }, [fetchFn]);

  const startPolling = useCallback(() => {
    if (!enabled) return;

    fetchData();
    setIsPolling(true);

    intervalRef.current = setInterval(() => {
      fetchData();
    }, interval);
  }, [enabled, interval, fetchData]);

  const stopPolling = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setIsPolling(false);
  }, []);

  useEffect(() => {
    if (enabled) {
      startPolling();
    }

    return () => {
      stopPolling();
    };
  }, [enabled, startPolling, stopPolling]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        stopPolling();
      } else if (enabled) {
        startPolling();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [enabled, startPolling, stopPolling]);

  return {
    data,
    loading,
    error,
    lastUpdated,
    isPolling,
    refetch: fetchData,
  };
}
