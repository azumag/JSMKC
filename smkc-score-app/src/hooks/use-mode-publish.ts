'use client';

import { useCallback, useEffect, useState } from 'react';

import { createLogger } from '@/lib/client-logger';
import { fetchWithRetry } from '@/lib/fetch-with-retry';
import { addPublicMode, removePublicMode, type RevealableMode } from '@/lib/public-modes';

const logger = createLogger({ serviceName: 'use-mode-publish' });

export type ModePublishError = 'load' | 'update';

export interface UseModePublishResult {
  isPublic: boolean;
  toggle: () => Promise<void>;
  /** Retries only the initial/current publicModes read; never mutates tournament state. */
  retryLoad: () => void;
  updating: boolean;
  /** True until the initial publicModes fetch resolves. */
  loading: boolean;
  /** Distinguishes an unknown initial state from a retryable update failure. */
  error: ModePublishError | null;
}

/**
 * Hook for the per-mode publish toggle on each mode page (issue #618).
 *
 * Each mode publishes/unpublishes independently — toggling one mode does not
 * affect the others. The hook fetches the tournament's current `publicModes`
 * once on mount and then maintains local truth, updating it after each PUT.
 */
export function useModePublish(tournamentId: string, mode: RevealableMode): UseModePublishResult {
  const [publicModes, setPublicModes] = useState<readonly string[]>([]);
  const [updating, setUpdating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ModePublishError | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const response = await fetchWithRetry(`/api/tournaments/${tournamentId}?fields=summary`);
        if (!response.ok) {
          logger.error('Failed to fetch tournament for publish state', {
            status: response.status,
          });
          if (!cancelled) setError('load');
          return;
        }
        const json = await response.json();
        const tournament = json.data ?? json;
        if (!cancelled) {
          setPublicModes(Array.isArray(tournament?.publicModes) ? (tournament.publicModes as string[]) : []);
          setError(null);
        }
      } catch (err) {
        const metadata = err instanceof Error ? { message: err.message, stack: err.stack } : { error: err };
        logger.error('Failed to load publicModes', metadata);
        if (!cancelled) setError('load');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadAttempt, tournamentId]);

  const retryLoad = useCallback(() => {
    if (loading || error !== 'load') return;
    setLoadAttempt((attempt) => attempt + 1);
  }, [error, loading]);

  const isPublic = publicModes.includes(mode);

  const toggle = useCallback(async () => {
    // Until the current publicModes read completes successfully, the state is
    // unknown. Refuse to build a PUT payload from the default/stale local value,
    // which could overwrite other modes.
    if (loading || updating || error === 'load') return;
    setUpdating(true);
    setError(null);
    try {
      const next = isPublic ? removePublicMode(publicModes, mode) : addPublicMode(publicModes, mode);
      const response = await fetch(`/api/tournaments/${tournamentId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ publicModes: next }),
      });
      if (response.ok) {
        setPublicModes(next);
        setError(null);
        // Notify the tournament layout to refresh its publicModes so tab badges update without a page reload (issue #621)
        window.dispatchEvent(new CustomEvent('publicModesChanged', { detail: { tournamentId } }));
      } else {
        setError('update');
        logger.error('Failed to update mode visibility', {
          status: response.status,
          mode,
        });
      }
    } catch (err) {
      setError('update');
      const metadata = err instanceof Error ? { message: err.message, stack: err.stack } : { error: err };
      logger.error('Failed to update mode visibility:', metadata);
    } finally {
      setUpdating(false);
    }
  }, [error, isPublic, loading, mode, publicModes, tournamentId, updating]);

  return { isPublic, toggle, retryLoad, updating, loading, error };
}
