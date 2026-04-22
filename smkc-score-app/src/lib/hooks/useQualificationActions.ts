/**
 * Shared qualification action hooks for BM/MR/GP pages.
 *
 * Extracts the handler functions that are structurally identical across
 * all 2P qualification pages, differing only in the mode string in the API URL.
 */

import { useCallback, useMemo } from "react";
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
   * Calls the PATCH endpoint to update the match's broadcast TV assignment.
   */
  const handleTvAssign = useCallback(async (matchId: string, tvNumber: number | null) => {
    try {
      await fetch(`/api/tournaments/${tournamentId}/${mode}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matchId, tvNumber }),
      });
      refetch();
    } catch (err) {
      logger.error("Failed to assign TV:", { error: err, tournamentId, matchId });
    }
  }, [tournamentId, mode, refetch, logger]);

  return { handleRankOverrideSave, handleBulkRankOverrideSave, handleTvAssign };
}
