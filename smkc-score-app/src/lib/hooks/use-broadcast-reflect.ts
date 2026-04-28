"use client";

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

import { useState } from "react";

interface BroadcastEntry {
  playerId: string;
  eliminated: boolean;
  player: { nickname: string };
}

type BroadcastStatus = "idle" | "success" | "error";

export function useBroadcastReflect(
  tournamentId: string,
  tvAssignments: Record<string, number | null>,
  entries: BroadcastEntry[]
) {
  const [broadcastStatus, setBroadcastStatus] =
    useState<BroadcastStatus>("idle");

  /** Push TV1→player1Name / TV2→player2Name to the broadcast overlay. */
  const handleBroadcastReflect = async () => {
    const activeEntries = entries.filter((e) => !e.eliminated);
    const tv1Player = activeEntries.find((e) => tvAssignments[e.playerId] === 1);
    const tv2Player = activeEntries.find((e) => tvAssignments[e.playerId] === 2);
    try {
      const res = await fetch(`/api/tournaments/${tournamentId}/broadcast`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          player1Name: tv1Player?.player.nickname ?? "",
          player2Name: tv2Player?.player.nickname ?? "",
        }),
      });
      setBroadcastStatus(res.ok ? "success" : "error");
      setTimeout(() => setBroadcastStatus("idle"), 3000);
    } catch {
      setBroadcastStatus("error");
      setTimeout(() => setBroadcastStatus("idle"), 3000);
    }
  };

  /** Reset the status indicator (call when starting/cancelling/undoing rounds). */
  const resetBroadcastStatus = () => setBroadcastStatus("idle");

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
