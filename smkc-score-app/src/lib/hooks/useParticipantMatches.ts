/**
 * useParticipantMatches — Shared hook for BM/MR/GP participant pages
 *
 * Extracts the common logic from all three participant score entry pages:
 * - Session authentication and player identification
 * - Tournament and match data fetching
 * - Real-time polling for match updates
 * - Filtering matches for the current player
 * - Submitting score reports to the mode-specific report API
 *
 * Each participant page only needs to provide mode-specific:
 * - Score entry form UI
 * - Form state management
 * - Client-side validation
 */
"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { usePolling } from "@/lib/hooks/usePolling";
import { fetchWithRetry } from "@/lib/fetch-with-retry";
import { createLogger } from "@/lib/logger";
import { POLLING_INTERVAL } from "@/lib/constants";

/** Shared player type across all participant pages */
export interface ParticipantPlayer {
  id: string;
  name: string;
  nickname: string;
}

/** Shared tournament metadata */
export interface ParticipantTournament {
  id: string;
  name: string;
  date: string;
  status: string;
}

/** Base match fields shared by BM/MR/GP */
export interface BaseMatch {
  id: string;
  matchNumber: number;
  stage: string;
  tvNumber?: number;
  player1: ParticipantPlayer;
  player1Side: number;
  player2: ParticipantPlayer;
  player2Side: number;
  completed: boolean;
  isBye?: boolean;
}

export type ParticipantMode = "bm" | "mr" | "gp";

interface UseParticipantMatchesOptions {
  tournamentId: string;
  mode: ParticipantMode;
}

export interface UseParticipantMatchesResult<TMatch extends BaseMatch> {
  /* Session */
  session: ReturnType<typeof useSession>["data"];
  sessionStatus: string;
  playerId: string | undefined;
  hasAccess: boolean;
  /* Data */
  tournament: ParticipantTournament | null;
  matches: TMatch[];
  setMatches: React.Dispatch<React.SetStateAction<TMatch[]>>;
  myMatches: TMatch[];
  /* UI state */
  loading: boolean;
  error: string | null;
  setError: (e: string | null) => void;
  submitting: string | null;
  setSubmitting: (id: string | null) => void;
  /* Actions */
  submitReport: (matchId: string, body: Record<string, unknown>) => Promise<Record<string, unknown> | null>;
}

/**
 * Custom hook that encapsulates the common participant page logic.
 * All three modes (BM/MR/GP) share identical patterns for:
 * - Session handling, data fetching, polling, match filtering
 * - Score report submission to /api/tournaments/[id]/<mode>/match/[matchId]/report
 */
export function useParticipantMatches<TMatch extends BaseMatch>(
  options: UseParticipantMatchesOptions
): UseParticipantMatchesResult<TMatch> {
  const { tournamentId, mode } = options;
  const logger = createLogger(`tournaments-${mode}-participant`);

  /* Session & auth */
  const { data: session, status: sessionStatus } = useSession();
  const playerId = session?.user?.playerId;
  const isPlayer = session?.user?.userType === "player";
  const isAdmin = session?.user?.role === "admin";
  const hasAccess = isPlayer || isAdmin;

  /* Core state */
  const [tournament, setTournament] = useState<ParticipantTournament | null>(null);
  const [matches, setMatches] = useState<TMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [myMatches, setMyMatches] = useState<TMatch[]>([]);
  const [submitting, setSubmitting] = useState<string | null>(null);

  /* Initial data fetch on mount */
  useEffect(() => {
    if (sessionStatus === "loading") return;
    if (!hasAccess) {
      setLoading(false);
      return;
    }

    const fetchData = async () => {
      try {
        const [tournamentResponse, matchesResponse] = await Promise.all([
          fetchWithRetry(`/api/tournaments/${tournamentId}?fields=summary`),
          fetch(`/api/tournaments/${tournamentId}/${mode}`),
        ]);

        if (tournamentResponse.ok) {
          const tJson = await tournamentResponse.json();
          /* Unwrap createSuccessResponse wrapper */
          setTournament(tJson.data ?? tJson);
        }
        if (matchesResponse.ok) {
          const data = await matchesResponse.json();
          setMatches(data.matches || []);
        }
      } catch (err) {
        logger.error("Data fetch error:", { error: err, tournamentId });
        setError("Failed to load tournament data. Please check your connection.");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [tournamentId, sessionStatus, hasAccess, mode]); // eslint-disable-line react-hooks/exhaustive-deps

  /* Polling for real-time match updates */
  const fetchMatchesPoll = useCallback(async () => {
    if (!hasAccess) return { matches: [] };
    const response = await fetch(`/api/tournaments/${tournamentId}/${mode}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  }, [tournamentId, hasAccess, mode]);

  const { data: pollingData, error: pollingError } = usePolling(
    fetchMatchesPoll,
    { interval: POLLING_INTERVAL, enabled: hasAccess && !loading }
  );

  useEffect(() => {
    if (pollingData && typeof pollingData === "object" && "matches" in pollingData) {
      setMatches(pollingData.matches as TMatch[]);
    }
    if (pollingError) {
      logger.error("Polling error:", { error: pollingError, tournamentId });
    }
  }, [pollingData, pollingError, tournamentId]); // eslint-disable-line react-hooks/exhaustive-deps

  /* Filter matches for the current player — incomplete only */
  useEffect(() => {
    if (playerId && matches.length > 0) {
      const playerMatches = matches.filter(
        (match) =>
          !match.completed &&
          (match.player1.id === playerId || match.player2.id === playerId)
      );
      setMyMatches(playerMatches);
    } else {
      setMyMatches([]);
    }
  }, [matches, playerId]);

  /**
   * Submit a score report to the mode-specific report API.
   * Returns the parsed response data on success, or null on failure.
   * Sets error state on failure. Manages submitting state automatically.
   */
  const submitReport = useCallback(
    async (matchId: string, body: Record<string, unknown>): Promise<Record<string, unknown> | null> => {
      setSubmitting(matchId);
      try {
        const response = await fetch(
          `/api/tournaments/${tournamentId}/${mode}/match/${matchId}/report`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          }
        );

        const json = await response.json();
        /* Unwrap createSuccessResponse wrapper */
        const data = json.data ?? json;

        if (!response.ok) {
          throw new Error(data.error || json.error || `Report failed (${response.status})`);
        }

        /* Update match in local state with the returned data */
        if (data.match) {
          setMatches((prev) =>
            prev.map((m) => (m.id === matchId ? { ...m, ...data.match } : m))
          );
        }

        return data;
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to submit report";
        setError(msg);
        return null;
      } finally {
        setSubmitting(null);
      }
    },
    [tournamentId, mode] // eslint-disable-line react-hooks/exhaustive-deps
  );

  return {
    session,
    sessionStatus,
    playerId,
    hasAccess,
    tournament,
    matches,
    setMatches,
    myMatches,
    loading,
    error,
    setError,
    submitting,
    setSubmitting,
    submitReport,
  };
}
