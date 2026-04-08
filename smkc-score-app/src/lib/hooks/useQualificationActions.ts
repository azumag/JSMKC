/**
 * Shared qualification action hooks for BM/MR/GP pages.
 *
 * Extracts the three handler functions that are structurally identical across
 * all 2P qualification pages, differing only in the mode string in the API URL
 * and the CSV filename prefix.
 */

import { useState, useCallback, useMemo } from "react";
import { createLogger } from "@/lib/client-logger";

type Mode = "bm" | "mr" | "gp";

/** Map mode to human-readable prefix for CSV export filenames */
const EXPORT_FILENAME_PREFIX: Record<Mode, string> = {
  bm: "battle-mode",
  mr: "match-race",
  gp: "grand-prix",
};

interface UseQualificationActionsOptions {
  tournamentId: string;
  mode: Mode;
  /** Trigger data refresh after successful mutations */
  refetch: () => void;
}

/**
 * Returns shared action handlers for rank override, TV assignment, and CSV export.
 * These functions are identical across BM/MR/GP qualification pages.
 */
export function useQualificationActions({ tournamentId, mode, refetch }: UseQualificationActionsOptions) {
  // Memoize logger so useCallback deps stay referentially stable
  const logger = useMemo(() => createLogger({ serviceName: `tournaments-${mode}` }), [mode]);
  const [exporting, setExporting] = useState(false);

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

  /**
   * Handle CSV/Excel export.
   * Downloads the export file via the mode-specific export API endpoint.
   */
  const handleExport = useCallback(async () => {
    setExporting(true);
    try {
      const response = await fetch(`/api/tournaments/${tournamentId}/${mode}/export`);
      if (!response.ok) {
        throw new Error("Failed to export data");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${EXPORT_FILENAME_PREFIX[mode]}-${new Date().toISOString().split("T")[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      logger.error("Failed to export:", { error: err, tournamentId });
    } finally {
      setExporting(false);
    }
  }, [tournamentId, mode, logger]);

  return { handleRankOverrideSave, handleTvAssign, handleExport, exporting };
}
