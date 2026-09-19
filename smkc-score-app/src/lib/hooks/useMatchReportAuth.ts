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

import { useCallback, useState } from "react";
import { useSession } from "next-auth/react";

interface MatchForAuth {
  player1Id: string;
  player2Id: string;
}

type SelectedPlayer = 1 | 2 | null;

interface ManualSelection {
  matchKey: string | null;
  player: SelectedPlayer;
}

interface UseMatchReportAuthResult {
  /** Whether the current user can report scores (admin or match participant) */
  canReport: boolean;
  /** Whether the current user is an admin */
  isAdmin: boolean;
  /** Whether the session is still loading (avoid showing "not authorized" flash) */
  isSessionLoading: boolean;
  /** Auto-selected player identity (1 or 2), or null if not auto-selectable */
  selectedPlayer: SelectedPlayer;
  /** Setter to allow manual player selection (e.g., admin choosing a side) */
  setSelectedPlayer: (player: SelectedPlayer) => void;
}

function getMatchKey(match: MatchForAuth | null): string | null {
  if (!match) return null;
  return `${match.player1Id}\u0000${match.player2Id}`;
}

export function useMatchReportAuth(
  match: MatchForAuth | null
): UseMatchReportAuthResult {
  const { data: session, status } = useSession();
  const matchKey = getMatchKey(match);
  const [manualSelection, setManualSelection] = useState<ManualSelection>(() => ({
    matchKey,
    player: null,
  }));

  const isAdmin = session?.user?.role === "admin";
  const currentPlayerId = session?.user?.playerId;
  const isPlayer1 = !!(currentPlayerId && match && currentPlayerId === match.player1Id);
  const isPlayer2 = !!(currentPlayerId && match && currentPlayerId === match.player2Id);
  const canReport = isAdmin || isPlayer1 || isPlayer2;
  const autoSelectedPlayer: SelectedPlayer = isPlayer1 ? 1 : isPlayer2 ? 2 : null;

  // A route transition can reuse the same hook instance for a different match.
  // Manual selection belongs only to the ordered player pair that produced it;
  // otherwise fall back synchronously to the new match's auto-selection.
  const selectedPlayer = manualSelection.matchKey === matchKey
    ? manualSelection.player ?? autoSelectedPlayer
    : autoSelectedPlayer;

  const setSelectedPlayer = useCallback(
    (player: SelectedPlayer) => {
      setManualSelection({ matchKey, player });
    },
    [matchKey]
  );

  return {
    canReport,
    isAdmin,
    isSessionLoading: status === "loading",
    selectedPlayer,
    setSelectedPlayer,
  };
}
