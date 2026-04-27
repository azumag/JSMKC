/**
 * Hook to fetch a tournament's debugMode flag once on mount.
 *
 * Returns `true` only when the tournament was created with the "debug mode"
 * checkbox enabled. Used by qualification pages to conditionally render the
 * admin "auto-fill scores" button. The flag is fetched via the lightweight
 * `?fields=summary` endpoint to avoid pulling full BM/MR/GP relations.
 */

import { useEffect, useState } from 'react';
import { fetchWithRetry } from '@/lib/fetch-with-retry';

export function useTournamentDebugMode(tournamentId: string): boolean {
  const [debugMode, setDebugMode] = useState(false);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetchWithRetry(`/api/tournaments/${tournamentId}?fields=summary`);
        if (!res.ok) return;
        const json = await res.json();
        const data = json.data ?? json;
        if (!cancelled) setDebugMode(Boolean(data?.debugMode));
      } catch {
        // Best-effort: a fetch failure just leaves debugMode = false (button hidden).
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tournamentId]);
  return debugMode;
}
