'use client';

/**
 * useBroadcastReflect
 *
 * Shared hook for TA finals pages (elimination phase 1/2 and phase 3) that
 * need to push TV1/TV2 player names to the broadcast overlay.
 *
 * The broadcast API only accepts player1Name (TV1) and player2Name (TV2).
 * TV3/TV4 assignments are stored in round results for operator reference
 * but are not sent to the overlay — the caller should surface this
 * limitation in the UI (issue #808).
 *
 * Extracted from the near-identical handleBroadcastReflect implementations
 * in ta-elimination-phase.tsx and ta/finals/page.tsx (issue #807).
 */

import { useCallback, useEffect, useRef, useState } from 'react';

interface BroadcastEntry {
  playerId: string;
  eliminated: boolean;
  player: { nickname: string; noCamera?: boolean };
}

type BroadcastStatus = 'idle' | 'success' | 'error';

interface BroadcastState {
  tournamentId: string;
  status: BroadcastStatus;
}

export function useBroadcastReflect(
  tournamentId: string,
  tvAssignments: Record<string, number | null>,
  entries: BroadcastEntry[],
) {
  const [broadcastState, setBroadcastState] = useState<BroadcastState>({
    tournamentId,
    status: 'idle',
  });
  // Status belongs to the tournament that produced it. A route transition can
  // reuse this hook instance before the previous request settles, so fail closed
  // to idle instead of showing another tournament's result during that window.
  const broadcastStatus = broadcastState.tournamentId === tournamentId ? broadcastState.status : 'idle';
  // The status reset is delayed for operator feedback, so keep the timer handle
  // to prevent stale setState work after unmount or after a newer reflect action.
  const idleResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestGenerationRef = useRef(0);
  const isMountedRef = useRef(true);

  const clearIdleResetTimer = useCallback(() => {
    if (idleResetTimerRef.current === null) return;
    clearTimeout(idleResetTimerRef.current);
    idleResetTimerRef.current = null;
  }, []);

  const scheduleIdleReset = useCallback(
    (ownerTournamentId: string, requestGeneration: number) => {
      clearIdleResetTimer();
      idleResetTimerRef.current = setTimeout(() => {
        idleResetTimerRef.current = null;
        if (!isMountedRef.current || requestGeneration !== requestGenerationRef.current) return;
        setBroadcastState({ tournamentId: ownerTournamentId, status: 'idle' });
      }, 3000);
    },
    [clearIdleResetTimer],
  );

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      requestGenerationRef.current += 1;
      clearIdleResetTimer();
    };
  }, [clearIdleResetTimer]);

  // A tournament route transition reuses the same hook instance. Invalidate
  // every in-flight request and delayed reset owned by the previous tournament
  // without setting state from the effect; broadcastStatus is derived by owner.
  useEffect(() => {
    requestGenerationRef.current += 1;
    clearIdleResetTimer();
  }, [tournamentId, clearIdleResetTimer]);

  /** Push TV1→player1Name / TV2→player2Name to the broadcast overlay. */
  const handleBroadcastReflect = useCallback(async () => {
    const requestGeneration = ++requestGenerationRef.current;
    clearIdleResetTimer();
    const activeEntries = entries.filter((e) => !e.eliminated);
    const tv1Player = activeEntries.find((e) => tvAssignments[e.playerId] === 1);
    const tv2Player = activeEntries.find((e) => tvAssignments[e.playerId] === 2);
    try {
      const res = await fetch(`/api/tournaments/${tournamentId}/broadcast`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          player1Name: tv1Player?.player.nickname ?? '',
          player2Name: tv2Player?.player.nickname ?? '',
          player1NoCamera: tv1Player?.player.noCamera === true,
          player2NoCamera: tv2Player?.player.noCamera === true,
        }),
      });
      if (!isMountedRef.current || requestGeneration !== requestGenerationRef.current) return;
      setBroadcastState({ tournamentId, status: res.ok ? 'success' : 'error' });
      scheduleIdleReset(tournamentId, requestGeneration);
    } catch {
      if (!isMountedRef.current || requestGeneration !== requestGenerationRef.current) return;
      setBroadcastState({ tournamentId, status: 'error' });
      scheduleIdleReset(tournamentId, requestGeneration);
    }
  }, [clearIdleResetTimer, entries, scheduleIdleReset, tournamentId, tvAssignments]);

  /** Reset the status indicator (call when starting/cancelling/undoing rounds). */
  const resetBroadcastStatus = useCallback(() => {
    requestGenerationRef.current += 1;
    clearIdleResetTimer();
    setBroadcastState({ tournamentId, status: 'idle' });
  }, [clearIdleResetTimer, tournamentId]);

  /**
   * True when any active player is assigned TV3 or TV4, which will NOT be
   * reflected in the broadcast overlay. Exposes this so callers can display
   * an informational note (issue #808).
   */
  const hasUnbroadcastedTvAssignment = entries
    .filter((e) => !e.eliminated)
    .some((e) => {
      const tv = tvAssignments[e.playerId];
      return tv !== null && tv !== undefined && tv > 2;
    });

  return {
    broadcastStatus,
    handleBroadcastReflect,
    resetBroadcastStatus,
    hasUnbroadcastedTvAssignment,
  };
}
