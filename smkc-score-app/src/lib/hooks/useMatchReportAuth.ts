/**
 * Hook for match page authorization and player auto-selection.
 *
 * Determines whether the current user can report scores for a given match,
 * mirroring the backend checkScoreReportAuth() logic (score-report-helpers.ts).
 * Also auto-selects the player identity when the logged-in user is a participant.
 *
 * Authorization rules:
 * - Admins can report for any match
 * - Players can only report for matches where they are player1 or player2
 * - Unauthenticated users or non-participants see a read-only view
 *
 * Used by BM, MR, and GP match entry pages.
 */

"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";

interface MatchForAuth {
  player1Id: string;
  player2Id: string;
}

interface UseMatchReportAuthResult {
  /** Whether the current user can report scores (admin or match participant) */
  canReport: boolean;
  /** Whether the session is still loading (avoid showing "not authorized" flash) */
  isSessionLoading: boolean;
  /** Auto-selected player identity (1 or 2), or null if not auto-selectable */
  selectedPlayer: 1 | 2 | null;
  /** Setter to allow manual player selection (e.g., admin choosing a side) */
  setSelectedPlayer: (player: 1 | 2 | null) => void;
}

export function useMatchReportAuth(
  match: MatchForAuth | null
): UseMatchReportAuthResult {
  const { data: session, status } = useSession();
  const [selectedPlayer, setSelectedPlayer] = useState<1 | 2 | null>(null);

  const isAdmin = session?.user?.role === "admin";
  const currentPlayerId = session?.user?.playerId;
  const isPlayer1 = !!(currentPlayerId && match && currentPlayerId === match.player1Id);
  const isPlayer2 = !!(currentPlayerId && match && currentPlayerId === match.player2Id);
  const canReport = isAdmin || isPlayer1 || isPlayer2;
  const autoSelectedPlayer = isPlayer1 ? 1 : isPlayer2 ? 2 : null;

  return {
    canReport,
    isSessionLoading: status === "loading",
    selectedPlayer: selectedPlayer ?? autoSelectedPlayer,
    setSelectedPlayer,
  };
}
