'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

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
  const updatingRef = useRef(false);
  const toggleAbortRef = useRef<AbortController | null>(null);

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
        const loadedPublicModes = tournament?.publicModes;
        if (!Array.isArray(loadedPublicModes) || !loadedPublicModes.every((value) => typeof value === 'string')) {
          logger.error('Tournament publish state response has invalid publicModes', { tournamentId });
          if (!cancelled) setError('load');
          return;
        }
        if (!cancelled) {
          setPublicModes(loadedPublicModes);
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

  useEffect(() => {
    // A publish PUT belongs to the tournament/mode identity that created it.
    // When that identity changes, reset the local update lock and abort the
    // previous request so a late completion cannot overwrite the new state.
    updatingRef.current = false;
    setUpdating(false);
    setError((current) => (current === 'update' ? null : current));

    return () => {
      toggleAbortRef.current?.abort();
      toggleAbortRef.current = null;
    };
  }, [mode, tournamentId]);

  const retryLoad = useCallback(() => {
    if (loading || error !== 'load') return;
    setLoadAttempt((attempt) => attempt + 1);
  }, [error, loading]);

  const isPublic = publicModes.includes(mode);

  const toggle = useCallback(async () => {
    // Until the current publicModes read completes successfully, the state is
    // unknown. Refuse to build a PUT payload from the default/stale local value,
    // which could overwrite other modes. The ref lock closes the same-render
    // window before React can publish updating=true to a new callback closure.
    if (loading || updatingRef.current || error === 'load') return;
    updatingRef.current = true;
    setUpdating(true);
    setError(null);

    const controller = new AbortController();
    toggleAbortRef.current = controller;

    try {
      const next = isPublic ? removePublicMode(publicModes, mode) : addPublicMode(publicModes, mode);
      const response = await fetch(`/api/tournaments/${tournamentId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ publicModes: next }),
        signal: controller.signal,
      });

      if (controller.signal.aborted || toggleAbortRef.current !== controller) return;

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
      if (controller.signal.aborted || toggleAbortRef.current !== controller) return;
      setError('update');
      const metadata = err instanceof Error ? { message: err.message, stack: err.stack } : { error: err };
      logger.error('Failed to update mode visibility:', metadata);
    } finally {
      if (toggleAbortRef.current === controller) {
        toggleAbortRef.current = null;
        updatingRef.current = false;
        setUpdating(false);
      }
    }
  }, [error, isPublic, loading, mode, publicModes, tournamentId]);

  return { isPublic, toggle, retryLoad, updating, loading, error };
}
