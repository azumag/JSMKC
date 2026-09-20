'use client';

import { useEffect, useRef, useState } from 'react';
import { extractArrayData } from '@/lib/api-response';
import { normalizePlayerSearchQuery } from '@/lib/player-search';

const PLAYER_SEARCH_PAGE_SIZE = 50;
const PLAYER_SEARCH_DEBOUNCE_MS = 250;

export interface PlayerSearchPlayer {
  id: string;
  name: string;
  nickname: string;
  country?: string | null;
}

interface PlayerSearchState {
  results: PlayerSearchPlayer[];
  knownPlayers: PlayerSearchPlayer[];
  loading: boolean;
  error: boolean;
}

interface InternalPlayerSearchState extends PlayerSearchState {
  resultQuery: string | null | undefined;
}

function mergeKnownPlayers(current: PlayerSearchPlayer[], incoming: PlayerSearchPlayer[]): PlayerSearchPlayer[] {
  const byId = new Map(current.map((player) => [player.id, player]));
  for (const player of incoming) byId.set(player.id, player);
  return [...byId.values()];
}

export function usePlayerSearch(query: string, enabled = true): PlayerSearchState {
  const generationRef = useRef(0);
  const normalizedQuery = normalizePlayerSearchQuery(query);
  const [state, setState] = useState<InternalPlayerSearchState>({
    results: [],
    knownPlayers: [],
    loading: true,
    error: false,
    resultQuery: undefined,
  });

  useEffect(() => {
    const generation = ++generationRef.current;
    if (!enabled) {
      // Invalidate the prior result generation before a later re-enable. Queueing
      // this avoids a cascading synchronous setState from the effect itself.
      queueMicrotask(() => {
        if (generationRef.current !== generation) return;
        setState((current) => ({
          ...current,
          results: [],
          loading: false,
          error: false,
          resultQuery: undefined,
        }));
      });
      return;
    }

    const controller = new AbortController();

    const timer = window.setTimeout(() => {
      if (generationRef.current !== generation) return;

      // Mark this request as the active generation when it actually starts.
      // Until then, the derived return value below hides previous-query results.
      setState((current) => ({
        ...current,
        results: [],
        loading: true,
        error: false,
        resultQuery: normalizedQuery,
      }));

      const params = new URLSearchParams({ limit: String(PLAYER_SEARCH_PAGE_SIZE) });
      if (normalizedQuery) params.set('search', normalizedQuery);

      void fetch(`/api/players?${params.toString()}`, { signal: controller.signal })
        .then(async (response) => {
          if (!response.ok) throw new Error('player-search-request-failed');
          const payload = await response.json();
          return extractArrayData<PlayerSearchPlayer>(payload);
        })
        .then((players) => {
          if (controller.signal.aborted || generationRef.current !== generation) return;
          setState((current) => ({
            results: players,
            knownPlayers: mergeKnownPlayers(current.knownPlayers, players),
            loading: false,
            error: false,
            resultQuery: normalizedQuery,
          }));
        })
        .catch(() => {
          if (controller.signal.aborted || generationRef.current !== generation) return;
          setState((current) => ({ ...current, loading: false, error: true }));
        });
    }, PLAYER_SEARCH_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [enabled, normalizedQuery, query]);

  const resultMatchesCurrentQuery = enabled && state.resultQuery === normalizedQuery;
  return {
    results: resultMatchesCurrentQuery ? state.results : [],
    knownPlayers: state.knownPlayers,
    loading: enabled ? !resultMatchesCurrentQuery || state.loading : false,
    error: resultMatchesCurrentQuery ? state.error : false,
  };
}
