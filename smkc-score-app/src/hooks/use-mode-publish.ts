"use client";

import { useCallback, useEffect, useState } from "react";

import { createLogger } from "@/lib/client-logger";
import { fetchWithRetry } from "@/lib/fetch-with-retry";
import {
  addPublicMode,
  removePublicMode,
  type RevealableMode,
} from "@/lib/public-modes";

const logger = createLogger({ serviceName: "use-mode-publish" });

export interface UseModePublishResult {
  isPublic: boolean;
  toggle: () => Promise<void>;
  updating: boolean;
  /** True until the initial publicModes fetch resolves. */
  loading: boolean;
}

/**
 * Hook for the per-mode publish toggle on each mode page (issue #618).
 *
 * Each mode publishes/unpublishes independently — toggling one mode does not
 * affect the others. The hook fetches the tournament's current `publicModes`
 * once on mount and then maintains local truth, updating it after each PUT.
 */
export function useModePublish(
  tournamentId: string,
  mode: RevealableMode
): UseModePublishResult {
  const [publicModes, setPublicModes] = useState<readonly string[]>([]);
  const [updating, setUpdating] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetchWithRetry(
          `/api/tournaments/${tournamentId}?fields=summary`
        );
        if (!response.ok) {
          logger.error("Failed to fetch tournament for publish state", {
            status: response.status,
          });
          return;
        }
        const json = await response.json();
        const tournament = json.data ?? json;
        if (!cancelled) {
          setPublicModes(
            Array.isArray(tournament?.publicModes)
              ? (tournament.publicModes as string[])
              : []
          );
        }
      } catch (err) {
        const metadata =
          err instanceof Error
            ? { message: err.message, stack: err.stack }
            : { error: err };
        logger.error("Failed to load publicModes", metadata);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tournamentId]);

  const isPublic = publicModes.includes(mode);

  const toggle = useCallback(async () => {
    if (updating) return;
    setUpdating(true);
    try {
      const next = isPublic
        ? removePublicMode(publicModes, mode)
        : addPublicMode(publicModes, mode);
      const response = await fetch(`/api/tournaments/${tournamentId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ publicModes: next }),
      });
      if (response.ok) {
        setPublicModes(next);
        // Notify the tournament layout to refresh its publicModes so tab badges update without a page reload (issue #621)
        window.dispatchEvent(new CustomEvent('publicModesChanged', { detail: { tournamentId } }));
      } else {
        logger.error("Failed to update mode visibility", {
          status: response.status,
          mode,
        });
      }
    } catch (err) {
      const metadata =
        err instanceof Error
          ? { message: err.message, stack: err.stack }
          : { error: err };
      logger.error("Failed to update mode visibility:", metadata);
    } finally {
      setUpdating(false);
    }
  }, [isPublic, mode, publicModes, tournamentId, updating]);

  return { isPublic, toggle, updating, loading };
}
