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
'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { usePolling } from '@/lib/hooks/usePolling';
import { fetchWithRetry } from '@/lib/fetch-with-retry';
import { createLogger } from '@/lib/logger';
import { POLLING_INTERVAL } from '@/lib/constants';
import { getParticipantScoreEntryAccessState } from '@/lib/participant-score-entry-access';

/** Shared player type across all participant pages */
export interface ParticipantPlayer {
  id: string;
  name: string;
  nickname: string;
  /** Stored country value (ISO code or legacy name); rendered as an inline flag. */
  country?: string | null;
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

export type ParticipantMode = 'bm' | 'mr' | 'gp';

interface UseParticipantMatchesOptions {
  tournamentId: string;
  mode: ParticipantMode;
  /** Localized generic network error supplied by the participant page. */
  networkErrorMessage?: string;
}

export interface UseParticipantMatchesResult<TMatch extends BaseMatch> {
  /* Session */
  session: ReturnType<typeof useSession>['data'];
  sessionStatus: string;
  playerId: string | undefined;
  hasAccess: boolean;
  isAdminBlocked: boolean;
  /* Data */
  tournament: ParticipantTournament | null;
  matches: TMatch[];
  setMatches: React.Dispatch<React.SetStateAction<TMatch[]>>;
  myMatches: TMatch[];
  /** Whether qualification is confirmed (locked from edits) */
  qualificationConfirmed: boolean;
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
  options: UseParticipantMatchesOptions,
): UseParticipantMatchesResult<TMatch> {
  const { tournamentId, mode, networkErrorMessage } = options;
  const logger = useMemo(() => createLogger(`tournaments-${mode}-participant`), [mode]);

  /* Session & auth */
  const { data: session, status: sessionStatus } = useSession();
  const playerId = session?.user?.playerId;
  const accessState = getParticipantScoreEntryAccessState({
    sessionStatus,
    userType: session?.user?.userType,
    role: session?.user?.role,
  });
  const hasAccess = accessState === 'player';
  const isAdminBlocked = accessState === 'admin-blocked';

  /* Core state */
  const [tournament, setTournament] = useState<ParticipantTournament | null>(null);
  const [matches, setMatches] = useState<TMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [myMatches, setMyMatches] = useState<TMatch[]>([]);
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [qualificationConfirmed, setQualificationConfirmed] = useState(false);
  // React state does not synchronously serialize calls made within one render.
  // This ref is the actual submit lock; `submitting` remains the UI-facing state.
  const reportSubmissionInFlightRef = useRef(false);
  const reportAbortRef = useRef<AbortController | null>(null);
  const reportIdentityRef = useRef({ tournamentId, mode });

  /* Initial data fetch on mount and whenever its access/context changes. */
  useEffect(() => {
    let cancelled = false;

    const clearParticipantData = () => {
      setTournament(null);
      setMatches([]);
      setMyMatches([]);
      setQualificationConfirmed(false);
      setError(null);
    };

    // A session/access/context transition invalidates all data from the previous
    // generation immediately. The cleanup guard below also prevents a slower
    // previous request from restoring that data after the transition.
    clearParticipantData();

    if (sessionStatus === 'loading') {
      setLoading(true);
      return () => {
        cancelled = true;
      };
    }
    if (!hasAccess) {
      setLoading(false);
      return () => {
        cancelled = true;
      };
    }

    setLoading(true);

    const fetchData = async () => {
      try {
        const [tournamentResponse, matchesResponse] = await Promise.all([
          fetchWithRetry(`/api/tournaments/${tournamentId}?fields=summary`),
          fetch(`/api/tournaments/${tournamentId}/${mode}`),
        ]);
        if (cancelled) return;

        if (!tournamentResponse.ok || !matchesResponse.ok) {
          const source = !tournamentResponse.ok ? 'tournament' : 'matches';
          const failedResponse = !tournamentResponse.ok ? tournamentResponse : matchesResponse;
          let apiError: string | null = null;
          if (!networkErrorMessage) {
            const errorData = await failedResponse.json().catch(() => ({}));
            apiError = typeof errorData.error === 'string' && errorData.error.trim() ? errorData.error : null;
          }
          if (cancelled) return;
          logger.error('Participant data fetch returned non-2xx:', {
            tournamentId,
            mode,
            source,
            status: failedResponse.status,
          });
          setError(networkErrorMessage || apiError || 'Failed to load tournament data. Please check your connection.');
          return;
        }

        const [tJson, json] = await Promise.all([tournamentResponse.json(), matchesResponse.json()]);
        if (cancelled) return;
        /* Unwrap createSuccessResponse wrappers only after both bodies parse successfully. */
        const tournamentData = tJson.data ?? tJson;
        const data = json.data ?? json;
        setTournament(tournamentData);
        setMatches(data.matches || []);
        /* Track qualification lock state for disabling score entry */
        if (data.qualificationConfirmed !== undefined) {
          setQualificationConfirmed(data.qualificationConfirmed);
        }
      } catch (err) {
        if (cancelled) return;
        logger.error('Data fetch error:', { error: err, tournamentId });
        setError(networkErrorMessage || 'Failed to load tournament data. Please check your connection.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void fetchData();
    return () => {
      cancelled = true;
    };
  }, [tournamentId, sessionStatus, hasAccess, mode, logger, networkErrorMessage]);

  useEffect(() => {
    // Keep the request identity aligned with the last committed context instead
    // of mutating the ref during render. Old-context completions are aborted by
    // the previous effect cleanup before this identity becomes current.
    reportIdentityRef.current = { tournamentId, mode };
    // A report request belongs to the tournament/mode identity that created it.
    // Reset the per-context lock and abort the previous request so a late response
    // cannot overwrite state after client-side navigation reuses this hook.
    reportSubmissionInFlightRef.current = false;
    setSubmitting(null);

    return () => {
      reportAbortRef.current?.abort();
      reportAbortRef.current = null;
    };
  }, [mode, tournamentId]);

  /* Polling for real-time match updates */
  const fetchMatchesPoll = useCallback(async () => {
    if (!hasAccess) return { matches: [] };
    const response = await fetch(`/api/tournaments/${tournamentId}/${mode}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    /* Unwrap createSuccessResponse wrapper (#274) */
    const json = await response.json();
    return json.data ?? json;
  }, [tournamentId, hasAccess, mode]);

  const { data: pollingData, error: pollingError } = usePolling(fetchMatchesPoll, {
    interval: POLLING_INTERVAL,
    enabled: hasAccess && !loading,
    /* Cache key enables instant content display when returning to this tab */
    cacheKey: `participant/${tournamentId}/${mode}`,
  });

  useEffect(() => {
    // A disabled polling source may still expose its previous cached value for a
    // render. Never let that value repopulate state after access has been lost.
    if (!hasAccess) return;
    if (pollingData && typeof pollingData === 'object' && 'matches' in pollingData) {
      setMatches(pollingData.matches as TMatch[]);
      /* Update qualification lock state from polling data */
      if ('qualificationConfirmed' in pollingData) {
        setQualificationConfirmed(pollingData.qualificationConfirmed as boolean);
      }
    }
    if (pollingError) {
      logger.error('Polling error:', { error: pollingError, tournamentId });
    }
  }, [pollingData, pollingError, tournamentId, logger, hasAccess]);

  /* Filter matches for the current player — pending first, then completed */
  useEffect(() => {
    if (playerId && matches.length > 0) {
      const playerMatches = matches.filter(
        (match) =>
          !match.isBye /* BYE matches are auto-completed; don't show */ &&
          (match.player1.id === playerId || match.player2.id === playerId),
      );
      /* Sort: pending (incomplete) matches first, then completed */
      playerMatches.sort((a, b) => {
        if (a.completed !== b.completed) return a.completed ? 1 : -1;
        return a.matchNumber - b.matchNumber;
      });
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
      if (reportSubmissionInFlightRef.current) return null;
      reportSubmissionInFlightRef.current = true;
      setSubmitting(matchId);

      const controller = new AbortController();
      reportAbortRef.current = controller;
      const requestIdentity = { tournamentId, mode };
      const isCurrentRequest = () =>
        !controller.signal.aborted &&
        reportAbortRef.current === controller &&
        reportIdentityRef.current.tournamentId === requestIdentity.tournamentId &&
        reportIdentityRef.current.mode === requestIdentity.mode;

      try {
        const response = await fetch(`/api/tournaments/${tournamentId}/${mode}/match/${matchId}/report`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        if (!isCurrentRequest()) return null;

        if (!response.ok) {
          let apiError: string | null = null;
          if (!networkErrorMessage) {
            const json = await response.json().catch(() => ({}));
            if (!isCurrentRequest()) return null;
            const data = json.data ?? json;
            apiError =
              (typeof data.error === 'string' && data.error.trim() ? data.error : null) ??
              (typeof json.error === 'string' && json.error.trim() ? json.error : null);
          }
          logger.error('Report submission returned non-2xx:', {
            tournamentId,
            mode,
            matchId,
            status: response.status,
          });
          setError(networkErrorMessage || apiError || `Report failed (${response.status})`);
          return null;
        }

        const json = await response.json().catch(() => ({}));
        if (!isCurrentRequest()) return null;
        /* Unwrap createSuccessResponse wrapper */
        const data = json.data ?? json;

        // Only clear a previous failure after the retry actually succeeds, so
        // the existing error remains visible while a new submission is pending.
        setError(null);
        /* Update match in local state with the returned data */
        if (data.match) {
          setMatches((prev) => prev.map((m) => (m.id === matchId ? { ...m, ...data.match } : m)));
        }

        return data;
      } catch (err) {
        if (!isCurrentRequest()) return null;
        logger.error('Report submission error:', { error: err, tournamentId, matchId });
        setError(networkErrorMessage || 'Failed to submit report. Please check your connection.');
        return null;
      } finally {
        if (isCurrentRequest()) {
          reportAbortRef.current = null;
          reportSubmissionInFlightRef.current = false;
          setSubmitting(null);
        }
      }
    },
    [tournamentId, mode, logger, networkErrorMessage],
  );

  return {
    session,
    sessionStatus,
    playerId,
    hasAccess,
    isAdminBlocked,
    tournament,
    matches,
    setMatches,
    myMatches,
    qualificationConfirmed,
    loading,
    error,
    setError,
    submitting,
    setSubmitting,
    submitReport,
  };
}
