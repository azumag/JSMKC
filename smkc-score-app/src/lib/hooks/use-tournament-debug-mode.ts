/**
 * Hook to fetch a tournament's debugMode flag on mount and tournament changes.
 *
 * Returns `true` only when the tournament was created with the "debug mode"
 * checkbox enabled. Used by qualification pages to conditionally render the
 * admin "auto-fill scores" button. The flag is fetched via the lightweight
 * `?fields=summary` endpoint to avoid pulling full BM/MR/GP relations.
 */

import { useEffect, useState } from 'react';
import { fetchWithRetry } from '@/lib/fetch-with-retry';

type LoadedDebugMode = {
  tournamentId: string;
  enabled: boolean;
};

export function useTournamentDebugMode(tournamentId: string): boolean {
  const [loadedDebugMode, setLoadedDebugMode] = useState<LoadedDebugMode | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetchWithRetry(`/api/tournaments/${tournamentId}?fields=summary`);
        if (!res.ok) return;
        const json = await res.json();
        const data = json.data ?? json;
        if (!cancelled) {
          setLoadedDebugMode({ tournamentId, enabled: Boolean(data?.debugMode) });
        }
      } catch {
        // Best-effort: an unverified tournament identity remains fail-closed.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tournamentId]);

  // A cached value is valid only for the tournament that produced it. This
  // keeps navigation fail-closed without a synchronous setState in the effect.
  return loadedDebugMode?.tournamentId === tournamentId ? loadedDebugMode.enabled : false;
}
