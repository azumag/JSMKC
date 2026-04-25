/**
 * Shared qualification action hooks for BM/MR/GP pages.
 *
 * Extracts the handler functions that are structurally identical across
 * all 2P qualification pages, differing only in the mode string in the API URL.
 */

import { useCallback, useMemo } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { createLogger } from "@/lib/client-logger";

type Mode = "bm" | "mr" | "gp";

interface UseQualificationActionsOptions {
  tournamentId: string;
  mode: Mode;
  /** Trigger data refresh after successful mutations */
  refetch: () => void;
}

interface RankOverrideUpdate {
  qualificationId: string;
  rankOverride: number | null;
}

/**
 * Returns shared action handlers for rank override and TV assignment.
 * These functions are identical across BM/MR/GP qualification pages.
 */
export function useQualificationActions({ tournamentId, mode, refetch }: UseQualificationActionsOptions) {
  const tc = useTranslations("common");
  // Memoize logger so useCallback deps stay referentially stable
  const logger = useMemo(() => createLogger({ serviceName: `tournaments-${mode}` }), [mode]);

  /**
   * Save rank override for a qualification entry.
   * Passes null to clear a previously set override and restore automatic ranking.
   */
  const handleRankOverrideSave = useCallback(async (qualificationId: string, rankOverride: number | null) => {
    try {
      const response = await fetch(`/api/tournaments/${tournamentId}/${mode}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ qualificationId, rankOverride }),
      });
      if (response.ok) {
        refetch();
      } else {
        const err = await response.json().catch(() => ({}));
        alert(err.error || 'Failed to update rank');
      }
    } catch (err) {
      logger.error("Failed to update rank:", { error: err, tournamentId });
    }
  }, [tournamentId, mode, refetch, logger]);

  /**
   * Save multiple rank overrides as one admin action.
   * Used by the sudden-death playoff dialog so a full tie block can be
   * resolved without reloading the page after every single PATCH.
   */
  const handleBulkRankOverrideSave = useCallback(async (updates: RankOverrideUpdate[]) => {
    try {
      for (const update of updates) {
        const response = await fetch(`/api/tournaments/${tournamentId}/${mode}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(update),
        });
        if (!response.ok) {
          const err = await response.json().catch(() => ({}));
          alert(err.error || 'Failed to update rank');
          return false;
        }
      }
      refetch();
      return true;
    } catch (err) {
      logger.error("Failed to update ranks:", { error: err, tournamentId });
      return false;
    }
  }, [tournamentId, mode, refetch, logger]);

  /**
   * Handle TV number assignment for a match.
   * Fires the PATCH in the background without waiting; the caller should apply
   * optimistic UI updates before calling this. No refetch is triggered so the
   * dropdown feels instant — the next polling cycle will confirm the value.
   */
  const handleTvAssign = useCallback((matchId: string, tvNumber: number | null) => {
    fetch(`/api/tournaments/${tournamentId}/${mode}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ matchId, tvNumber }),
    }).catch((err) => {
      logger.error("Failed to assign TV:", { error: err, tournamentId, matchId });
    });
  }, [tournamentId, mode, logger]);

  /**
   * Push match players to the overlay as the current 1P/2P broadcast names.
   * Used by the "配信に反映" button on each match row.
   * Returns true on success so callers can show per-button feedback.
   */
  const handleBroadcastReflect = useCallback(async (player1Name: string, player2Name: string): Promise<boolean> => {
    try {
      const res = await fetch(`/api/tournaments/${tournamentId}/broadcast`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ player1Name, player2Name }),
      });
      if (res.ok) {
        toast.success(tc("broadcastReflected"));
        return true;
      }
      toast.error(tc("broadcastError"));
      return false;
    } catch (err) {
      logger.error("Failed to reflect broadcast:", { error: err, tournamentId });
      toast.error(tc("broadcastError"));
      return false;
    }
  }, [tournamentId, tc, logger]);

  return { handleRankOverrideSave, handleBulkRankOverrideSave, handleTvAssign, handleBroadcastReflect };
}
