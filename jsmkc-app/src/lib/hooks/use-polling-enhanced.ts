'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useAutoRefresh, ExtendedSession } from '@/lib/jwt-refresh';

interface PollingOptions {
  url: string;
  interval?: number;
  enabled?: boolean;
  onSuccess?: (data: unknown) => void;
  onError?: (error: Error) => void;
}

interface UsePollingResult {
  data: unknown;
  error: Error | null;
  isLoading: boolean;
  lastFetch: number;
  refetch: () => Promise<void>;
  stop: () => void;
  start: () => void;
}

/**
 * Enhanced polling hook with automatic session refresh and rate limiting
 * Follows ARCHITECTURE.md specifications for polling optimization
 */
export function usePolling(options: PollingOptions): UsePollingResult {
  const {
    url,
    interval = 5000, // 5 seconds as per optimization
    enabled = true,
    onSuccess,
    onError,
  } = options;

  const { data: session } = useSession();
  const { ensureValidSession } = useAutoRefresh();
  
  const [data, setData] = useState<unknown>(null);
  const [error, setError] = useState<Error | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [lastFetch, setLastFetch] = useState(0);
  const [isActive, setIsActive] = useState(enabled);

  const fetchData = useCallback(async () => {
    if (!isActive || !url) return;

    try {
      // Prevent rapid successive requests
      const now = Date.now();
      if (now - lastFetch < 500) {
        return;
      }

      setIsLoading(true);
      setLastFetch(now);
      setError(null);

      // Ensure session is valid before making request
      const sessionValid = await ensureValidSession();
      if (!sessionValid) {
        throw new Error('Session validation failed');
      }

      // Add session token to headers if available
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      const sessionData = session as ExtendedSession;
      if (sessionData?.accessToken) {
        headers.Authorization = `Bearer ${sessionData.accessToken}`;
      }

      const response = await fetch(url, {
        method: 'GET',
        headers,
        cache: 'no-store',
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        
        if (response.status === 401) {
          // Session expired, will be handled by useAutoRefresh
          throw new Error(errorData.error || 'Authentication failed');
        }
        
        if (response.status === 429) {
          // Rate limited, implement exponential backoff
          const retryAfter = response.headers.get('X-RateLimit-Reset');
          if (retryAfter) {
            const retryDelay = parseInt(retryAfter) - Math.floor(Date.now() / 1000);
            setTimeout(() => fetchData(), Math.max(retryDelay * 1000, 1000));
          }
          throw new Error(errorData.error || 'Rate limit exceeded. Please try again later.');
        }

        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const result = await response.json();
      setData(result);
      onSuccess?.(result);
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Unknown error occurred');
      setError(error);
      onError?.(error);
      
      // Implement exponential backoff on errors
      if (error.message.includes('Rate limit')) {
        setTimeout(() => fetchData(), interval * 2);
      }
    } finally {
      setIsLoading(false);
    }
  }, [url, isActive, lastFetch, ensureValidSession, session, interval, onSuccess, onError]);

  // Set up polling interval
  useEffect(() => {
    if (!isActive) return;

    const intervalId = setInterval(fetchData, interval);
    
    // Initial fetch
    fetchData();

    return () => {
      clearInterval(intervalId);
    };
  }, [fetchData, interval, isActive]);

  // Handle page visibility changes to optimize performance
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        setIsActive(false); // Pause polling when page is hidden
      } else {
        setIsActive(enabled); // Resume polling when page is visible
        if (enabled) {
          fetchData(); // Immediate fetch when page becomes visible
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [enabled, fetchData]);

  // Handle window focus/blur for additional optimization
  useEffect(() => {
    const handleFocus = () => {
      if (enabled) {
        setIsActive(true);
        fetchData();
      }
    };

    const handleBlur = () => {
      setIsActive(false);
    };

    window.addEventListener('focus', handleFocus);
    window.addEventListener('blur', handleBlur);

    return () => {
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('blur', handleBlur);
    };
  }, [enabled, fetchData]);

  return {
    data,
    error,
    isLoading,
    lastFetch,
    refetch: fetchData,
    stop: () => setIsActive(false),
    start: () => setIsActive(true),
  };
}

/**
 * Hook for monitoring polling statistics and resource usage
 */
export function usePollingStats() {
  const [stats, setStats] = useState({
    totalRequests: 0,
    successfulRequests: 0,
    failedRequests: 0,
    averageResponseTime: 0,
    rateLimitHits: 0,
  });

  const updateStats = useCallback((success: boolean, responseTime: number, rateLimited: boolean = false) => {
    setStats(prev => {
      const newTotal = prev.totalRequests + 1;
      const newSuccesses = success ? prev.successfulRequests + 1 : prev.successfulRequests;
      const newFailures = !success ? prev.failedRequests + 1 : prev.failedRequests;
      const newRateLimitHits = rateLimited ? prev.rateLimitHits + 1 : prev.rateLimitHits;
      
      const newAverageTime = (
        (prev.averageResponseTime * prev.totalRequests + responseTime) / newTotal
      );

      return {
        totalRequests: newTotal,
        successfulRequests: newSuccesses,
        failedRequests: newFailures,
        averageResponseTime: newAverageTime,
        rateLimitHits: newRateLimitHits,
      };
    });
  }, []);

  const resetStats = useCallback(() => {
    setStats({
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      averageResponseTime: 0,
      rateLimitHits: 0,
    });
  }, []);

  return {
    stats,
    updateStats,
    resetStats,
  };
}

/**
 * Enhanced polling hook with statistics tracking
 */
export function usePollingWithStats(options: PollingOptions): UsePollingResult & { stats: ReturnType<typeof usePollingStats>['stats'] } {
  const { stats, updateStats } = usePollingStats();
  const basePolling = usePolling({
    ...options,
    onSuccess: (data) => {
      const startTime = Date.now();
      options.onSuccess?.(data);
      updateStats(true, Date.now() - startTime);
    },
    onError: (error) => {
      const startTime = Date.now();
      options.onError?.(error);
      updateStats(false, Date.now() - startTime, error.message.includes('Rate limit'));
    },
  });

  return {
    ...basePolling,
    stats,
  };
}

/**
 * Utility function to implement rate limiting on the client side
 */
export function createClientRateLimiter(maxRequests: number, windowMs: number) {
  const requests: number[] = [];

  return {
    isAllowed: (): boolean => {
      const now = Date.now();
      
      // Remove old requests outside the window
      const validRequests = requests.filter(time => now - time < windowMs);
      requests.length = 0;
      requests.push(...validRequests);

      if (requests.length >= maxRequests) {
        return false;
      }

      requests.push(now);
      return true;
    },
    getRemainingRequests: (): number => {
      const now = Date.now();
      const validRequests = requests.filter(time => now - time < windowMs);
      return Math.max(0, maxRequests - validRequests.length);
    },
    getResetTime: (): number => {
      if (requests.length === 0) return Date.now() + windowMs;
      return Math.min(...requests) + windowMs;
    },
  };
}

/**
 * Client-side rate limiting hook for specific actions
 */
export function useClientRateLimit(maxRequests: number = 10, windowMs: number = 60000) {
  const rateLimiter = createClientRateLimiter(maxRequests, windowMs);
  
  return {
    executeWithLimit: async <T>(fn: () => Promise<T>): Promise<T> => {
      if (!rateLimiter.isAllowed()) {
        throw new Error(`Rate limit exceeded. Try again in ${Math.ceil((rateLimiter.getResetTime() - Date.now()) / 1000)} seconds.`);
      }
      
      return fn();
    },
    remainingRequests: rateLimiter.getRemainingRequests(),
    resetTime: rateLimiter.getResetTime(),
  };
}