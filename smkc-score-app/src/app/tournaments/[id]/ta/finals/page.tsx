'use client';

/**
 * Time Attack Finals - Phase 3 Page
 *
 * Admin page for managing Phase 3 of the TA finals.
 * Phase 3 is the life-based elimination finale:
 *
 * Participants: Phase 2 survivors (4) + Qualification ranks 1-12 (12) = 16 players
 *
 * Format:
 * - Each player starts with 3 lives
 * - Each course: bottom half (slowest times) loses 1 life
 * - Players reaching 0 lives are eliminated
 * - Lives are reset to 3 at thresholds: 8, 4, and 2 players remaining
 * - Last player standing is the champion
 *
 * Uses the phases API with:
 * - Random course selection (no repeats until all 20 used)
 * - Retry penalty (9:59.990) for players who retry
 * - Server-side life deduction and elimination
 * - Round-by-round history tracking
 *
 * Also supports:
 * - Manual elimination (admin override)
 * - Champion banner when last player standing
 * - 3-second auto-refresh for live tracking
 */

import { useState, useEffect, useCallback, use, useMemo, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { COURSE_INFO, RETRY_PENALTY_DISPLAY, RETRY_PENALTY_MS } from '@/lib/constants';
import {
  autoFormatTime,
  generateRandomTimeString,
  msToDisplayTime,
  sortResultsByTime,
  timeToMs,
} from '@/lib/ta/time-utils';
import { TA_TIME_INPUT_HELP_CLASS, getTaTimeInputProps } from '@/lib/ta/time-entry-layout';
import { TaTimeEntryRow } from '@/components/tournament/ta-time-entry-row';
import { getCourseCycleStatus } from '@/lib/ta/course-cycle-status';
import { CardSkeleton } from '@/components/ui/loading-skeleton';
import { Dice5 } from 'lucide-react';
import { createLogger } from '@/lib/client-logger';
import type { Player } from '@/lib/types';
import { useTournamentDebugMode } from '@/lib/hooks/use-tournament-debug-mode';
import { useBroadcastReflect } from '@/lib/hooks/use-broadcast-reflect';
import { CourseCycleStatusPanel } from '@/components/tournament/course-cycle-status-panel';
import { RoundCorrectionControls } from '@/components/tournament/round-correction-controls';
import { TASuddenDeathSection, useTaSuddenDeath } from '@/components/tournament/ta-sudden-death-panel';
import { TaHandicapBadge } from '@/components/tournament/ta-handicap-badge';
import { TaLivesIndicator } from '@/components/tournament/ta-lives-indicator';
import { TaModeBadge } from '@/components/tournament/ta-mode-badge';
import { buildTaRoundPreview, type TaRoundPreviewRow } from '@/lib/ta/round-preview';
import type { Phase3RulesDto, TaMode } from '@/lib/ta/phase-api-types';
import { TA_ROUND_LIFE_LOSS_MIN, TA_ROUND_LIFE_LOSS_MAX } from '@/lib/ta/battle-royale-constants';

const logger = createLogger({ serviceName: 'tournaments-ta-finals' });

/** TTEntry from the phases API */
interface TTEntry {
  id: string;
  playerId: string;
  stage: string;
  lives: number;
  eliminated: boolean;
  times: Record<string, string> | null;
  totalTime: number | null;
  rank: number | null;
  taHandicapSeconds: number;
  player: Player;
}

/** Round record from the phases API */
interface PhaseRound {
  id: string;
  phase: string;
  roundNumber: number;
  course: string;
  tvNumber?: number | null;
  results: Array<{
    playerId: string;
    timeMs: number;
    rawTimeMs?: number;
    handicapSeconds?: number;
    isRetry: boolean;
    tvNumber?: number | null;
    /** Remaining life immediately after this round, replayed server-side from round history. */
    livesAfter?: number | null;
    /**
     * Whether this round's outcome cost the player a life, computed server-side
     * (via the resolved sudden-death order when a boundary tie occurred). Prefer
     * this over re-deriving "bottom half" from raw times client-side, which
     * cannot see sudden-death sub-round results and gets tied boundaries wrong.
     */
    lifeLost?: boolean;
  }>;
  eliminatedIds: string[] | null;
  livesReset: boolean;
  manualOverride: boolean;
  /** Lives phase3's bottom half loses this round. Defaults to 1; only TA battle royale admins may configure otherwise. */
  lifeLoss?: number;
  suddenDeathRounds?: Array<{
    id: string;
    sequence: number;
    course: string;
    targetPlayerIds: string[];
    results: Array<{ playerId: string; timeMs: number; isRetry: boolean }> | null;
    resolved: boolean;
  }>;
  createdAt: string;
}

export default function TimeAttackFinals({ params }: { params: Promise<{ id: string }> }) {
  const { id: tournamentId } = use(params);
  const { data: session } = useSession();
  /* i18n translation hooks for TA finals, finals, and common namespaces */
  const tTaFinals = useTranslations('taFinals');
  const tTaSuddenDeath = useTranslations('taSuddenDeath');
  const tFinals = useTranslations('finals');
  const tCommon = useTranslations('common');
  // Input is a native element, so this does not skip rendering by reference equality.
  // The memo keeps TA pages consistent and avoids rebuilding identical spread props during polling refreshes.
  const taTimeInputProps = useMemo(() => getTaTimeInputProps(tTaFinals('timeInputTitle')), [tTaFinals]);

  /**
   * Admin role check: only admin users can start rounds, enter times,
   * submit results, and eliminate players. Non-admin users see read-only
   * standings, history, and champion banner.
   */
  const isAdmin = session?.user?.role === 'admin';

  // === State Management ===
  const [entries, setEntries] = useState<TTEntry[]>([]);
  const [rounds, setRounds] = useState<PhaseRound[]>([]);
  // Available courses for the next round (received from GET response).
  // Used to populate the manual course selector dropdown.
  const [availableCourses, setAvailableCourses] = useState<string[]>([]);
  const [playedCourses, setPlayedCourses] = useState<string[]>([]);
  // Admin-selected course override. "__random__" = use random selection (default).
  // Cannot use "" because Radix UI Select reserves empty string for "no selection" (placeholder).
  const [selectedCourse, setSelectedCourse] = useState<string>('__random__');
  // Per-player TV assignments for the active round: playerId → TV number (1-4) or null.
  const [tvAssignments, setTvAssignments] = useState<Record<string, number | null>>({});
  // Admin-selected life loss for the NEXT round (TA battle royale phase3 only).
  // A one-off override — resets to '1' after each round starts so a special
  // round doesn't silently carry over into the next one.
  const [roundLifeLoss, setRoundLifeLoss] = useState<string>('1');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Current round state (after "Start Round" is clicked)
  const [currentRound, setCurrentRound] = useState<{
    roundNumber: number;
    course: string;
    lifeLoss: number;
  } | null>(null);
  const [courseTimes, setCourseTimes] = useState<Record<string, string>>({});
  const [retryFlags, setRetryFlags] = useState<Record<string, boolean>>({});
  const [submitting, setSubmitting] = useState(false);
  const retryFlagsRef = useRef<Record<string, boolean>>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [startingRound, setStartingRound] = useState(false);
  const [cancellingRound, setCancellingRound] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [undoingRound, setUndoingRound] = useState(false);
  const [showUndoConfirm, setShowUndoConfirm] = useState(false);
  const [cancellingLastRound, setCancellingLastRound] = useState(false);
  const [showCancelLastRoundConfirm, setShowCancelLastRoundConfirm] = useState(false);

  // Show random-fill button when tournament debugMode is enabled (admin only).
  const isDebugMode = useTournamentDebugMode(tournamentId);

  // Broadcast overlay state and handler — shared with ta-elimination-phase via hook.
  const { broadcastStatus, handleBroadcastReflect, resetBroadcastStatus, hasUnbroadcastedTvAssignment } =
    useBroadcastReflect(tournamentId, tvAssignments, entries);

  // Track if user is currently editing to pause polling
  const [isEditing, setIsEditing] = useState(false);

  // Admin action states
  const [isEliminateDialogOpen, setIsEliminateDialogOpen] = useState(false);
  const [entryToEliminate, setEntryToEliminate] = useState<TTEntry | null>(null);

  // Map of playerId → nickname for round history display
  const [playerNames, setPlayerNames] = useState<Record<string, string>>({});

  /** Whether the round history section is expanded. Defaults to collapsed
   *  to keep the focus on the active round and standings. */
  const [historyExpanded, setHistoryExpanded] = useState(true);
  const [taMode, setTaMode] = useState<TaMode>('standard');
  const [phase3Rules, setPhase3Rules] = useState<Phase3RulesDto>({
    initialLives: 3,
    lifeResetThresholds: [8, 4, 2],
    survivorsNeeded: 1,
    handicapEnabled: false,
    retryAppliesHandicap: false,
  });
  const [archived, setArchived] = useState(false);
  const [pendingSubmitResults, setPendingSubmitResults] = useState<
    Array<{ playerId: string; timeMs: number; isRetry?: boolean; tvNumber?: number }>
  >([]);
  const [submitPreview, setSubmitPreview] = useState<TaRoundPreviewRow[]>([]);
  const [submitPreviewOpen, setSubmitPreviewOpen] = useState(false);

  // === Data Fetching ===
  const fetchData = useCallback(async () => {
    setError(null);
    try {
      // Use the new phases API with phase3 parameter
      const response = await fetch(`/api/tournaments/${tournamentId}/ta/phases?phase=phase3`);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Failed to fetch finals data: ${response.status}`);
      }
      const json = await response.json();
      // Unwrap createSuccessResponse wrapper: { success, data: { entries, rounds, ... } }
      const data = json.data ?? json;
      setTaMode(data.taMode === 'battle_royale' ? 'battle_royale' : 'standard');
      if (data.phase3Rules) {
        setPhase3Rules(data.phase3Rules as Phase3RulesDto);
      }
      setArchived(data.archived === true);
      const fetchedEntries: TTEntry[] = data.entries || [];
      const fetchedRounds: PhaseRound[] = data.rounds || [];
      setEntries(fetchedEntries);
      setRounds(fetchedRounds);
      setAvailableCourses(data.availableCourses || []);
      setPlayedCourses(data.playedCourses || []);

      // Build player name map from entries
      const nameMap: Record<string, string> = {};
      fetchedEntries.forEach((e: TTEntry) => {
        nameMap[e.playerId] = e.player.nickname;
      });
      setPlayerNames(nameMap);

      // Auto-recover open (unsubmitted) rounds: if there's a round with empty
      // results in the DB and the client doesn't have a currentRound set,
      // automatically enter the time entry UI. Prevents orphaned rounds from
      // being invisible after page reloads.
      if (fetchedRounds.length > 0) {
        const lastRound = fetchedRounds[fetchedRounds.length - 1];
        const lastRoundResults = lastRound.results as unknown[];
        if (lastRoundResults.length === 0 && !currentRound) {
          const activeEntries = fetchedEntries.filter((e) => !e.eliminated);
          const initialTimes: Record<string, string> = {};
          const initialRetry: Record<string, boolean> = {};
          const initialTv: Record<string, number | null> = {};
          activeEntries.forEach((entry) => {
            initialTimes[entry.playerId] = '';
            initialRetry[entry.playerId] = false;
            initialTv[entry.playerId] = null;
          });
          setCurrentRound({
            roundNumber: lastRound.roundNumber,
            course: lastRound.course,
            lifeLoss: lastRound.lifeLoss ?? 1,
          });
          setCourseTimes(initialTimes);
          setRetryFlags(initialRetry);
          setTvAssignments(initialTv);
        }
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch data';
      logger.error('Failed to fetch data:', { error: err, tournamentId });
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [tournamentId, currentRound]);

  // Initial fetch
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    retryFlagsRef.current = retryFlags;
  }, [retryFlags]);

  // Auto-refresh every 3 seconds, but pause when user is editing to prevent
  // resetting their input. This ensures a smooth data entry experience.
  useEffect(() => {
    const interval = setInterval(() => {
      if (!isEditing) {
        fetchData();
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [fetchData, isEditing]);

  // === Event Handlers ===

  /**
   * Start a new round: calls the API to randomly select a course.
   * The server selects from the 20-course cycle (no repeats until all used).
   */
  const handleStartRound = async () => {
    setStartingRound(true);
    setSaveError(null);
    try {
      const response = await fetch(`/api/tournaments/${tournamentId}/ta/phases`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'start_round',
          phase: 'phase3',
          // Only include course when admin has manually selected one;
          // omitting it lets the server choose randomly (default behaviour).
          ...(selectedCourse && selectedCourse !== '__random__' ? { course: selectedCourse } : {}),
          // Custom life loss is a TA battle royale feature; the server rejects
          // a non-default value outside battle royale phase3, so only send it
          // when relevant.
          ...(taMode === 'battle_royale' ? { lifeLoss: Number(roundLifeLoss) } : {}),
        }),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to start round');
      }
      const json = await response.json();
      // Unwrap createSuccessResponse wrapper
      const data = json.data ?? json;

      // Initialize time entry form and per-player TV assignments for all active players
      const activeEntries = entries.filter((e) => !e.eliminated);
      const initialTimes: Record<string, string> = {};
      const initialRetry: Record<string, boolean> = {};
      const initialTv: Record<string, number | null> = {};
      activeEntries.forEach((entry) => {
        initialTimes[entry.playerId] = '';
        initialRetry[entry.playerId] = false;
        initialTv[entry.playerId] = null;
      });

      setCurrentRound({
        roundNumber: data.roundNumber,
        course: data.course,
        lifeLoss: data.lifeLoss ?? 1,
      });
      setCourseTimes(initialTimes);
      setRetryFlags(initialRetry);
      setTvAssignments(initialTv);
      resetBroadcastStatus();
      setSelectedCourse('__random__'); // Reset manual selection after round is started
      setRoundLifeLoss('1'); // Reset the one-off life-loss override after round is started
      fetchData();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to start round';
      setSaveError(errorMessage);
    } finally {
      setStartingRound(false);
    }
  };

  /**
   * Cancel the current round: calls the API to delete the unsubmitted
   * TTPhaseRound record, freeing the course back into the 20-course pool.
   */
  const handleCancelRound = async () => {
    if (!currentRound) return;
    setCancellingRound(true);
    setSaveError(null);
    try {
      const response = await fetch(`/api/tournaments/${tournamentId}/ta/phases`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'cancel_round',
          phase: 'phase3',
          roundNumber: currentRound.roundNumber,
        }),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to cancel round');
      }
      setCurrentRound(null);
      setCourseTimes({});
      setRetryFlags({});
      setTvAssignments({});
      resetBroadcastStatus();
      setIsEditing(false);
      setShowCancelConfirm(false);
      fetchData();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to cancel round';
      setSaveError(errorMessage);
      setShowCancelConfirm(false);
    } finally {
      setCancellingRound(false);
    }
  };

  /**
   * Undo the last submitted round: clears results and restores player state.
   * This mirrors the Phase 1/2 behavior so incorrect submissions can be fixed.
   */
  const handleUndoRound = async () => {
    setUndoingRound(true);
    setSaveError(null);
    try {
      const response = await fetch(`/api/tournaments/${tournamentId}/ta/phases`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'undo_round', phase: 'phase3' }),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to undo round');
      }
      setShowUndoConfirm(false);
      setCurrentRound(null);
      setCourseTimes({});
      setRetryFlags({});
      setTvAssignments({});
      resetBroadcastStatus();
      setIsEditing(false);
      fetchData();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to undo round';
      setSaveError(errorMessage);
      setShowUndoConfirm(false);
    } finally {
      setUndoingRound(false);
    }
  };

  /**
   * Cancel the last submitted round entirely: restores player state (same
   * as undo) but deletes the round record instead of clearing it in place,
   * freeing its course back into the 20-course pool. Use this when the
   * course/round itself was the mistake, not just the times entered for it
   * (issue #2761 — undo alone can't free a course, only redo it in place).
   */
  const handleCancelLastRound = async () => {
    setCancellingLastRound(true);
    setSaveError(null);
    try {
      const response = await fetch(`/api/tournaments/${tournamentId}/ta/phases`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cancel_last_round', phase: 'phase3' }),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to cancel round');
      }
      setShowCancelLastRoundConfirm(false);
      setCurrentRound(null);
      setCourseTimes({});
      setRetryFlags({});
      setTvAssignments({});
      resetBroadcastStatus();
      setIsEditing(false);
      fetchData();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to cancel round';
      setSaveError(errorMessage);
      setShowCancelLastRoundConfirm(false);
    } finally {
      setCancellingLastRound(false);
    }
  };

  /**
   * Fill random times for all active players in the current round (Dev only).
   * Uses shared generateRandomTimeString (45s-3:30 range) for consistency
   * with the qualifying page's random time fill feature.
   */
  const handleFillRandomTimes = () => {
    const activePlayerEntries = entries.filter((e) => !e.eliminated);
    const randomTimes: Record<string, string> = {};
    const clearedRetry: Record<string, boolean> = {};

    activePlayerEntries.forEach((entry) => {
      randomTimes[entry.playerId] = generateRandomTimeString();
      clearedRetry[entry.playerId] = false;
    });

    setCourseTimes(randomTimes);
    // Clear retry flags since we're filling with normal times
    setRetryFlags(clearedRetry);
    // Mark as editing so auto-refresh doesn't overwrite the filled values
    setIsEditing(true);
  };

  /** Handle time input change for a specific player */
  const handleTimeChange = useCallback((playerId: string, value: string) => {
    setIsEditing(true);
    setCourseTimes((prev) => ({ ...prev, [playerId]: value }));
    setRetryFlags((prev) => (prev[playerId] ? { ...prev, [playerId]: false } : prev));
  }, []);

  const handleTimeBlur = useCallback((playerId: string) => {
    setCourseTimes((prev) => {
      const raw = prev[playerId];
      if (!raw || raw.trim() === '') return prev;
      const formatted = autoFormatTime(raw);
      if (formatted !== null && formatted !== raw) {
        return { ...prev, [playerId]: formatted };
      }
      return prev;
    });
  }, []);

  /** Toggle retry penalty: sets time to 9:59.990 and marks isRetry flag */
  const handleRetryToggle = useCallback((playerId: string) => {
    setIsEditing(true);
    const isCurrentlyRetry = retryFlagsRef.current[playerId];
    const nextIsRetry = !isCurrentlyRetry;
    setRetryFlags((prev) => ({ ...prev, [playerId]: nextIsRetry }));
    setCourseTimes((prevTimes) => ({
      ...prevTimes,
      [playerId]: nextIsRetry ? RETRY_PENALTY_DISPLAY : '',
    }));
  }, []);

  const handleTvChange = useCallback(
    (playerId: string, value: number | null) => {
      setTvAssignments((prev) => ({ ...prev, [playerId]: value }));
      resetBroadcastStatus();
    },
    [resetBroadcastStatus],
  );

  /**
   * Submit round results: sends player times to the API.
   * The server handles:
   * - Retry penalty enforcement (9:59.990)
   * - Bottom half life deduction
   * - Elimination of players at 0 lives
   * - Life reset at thresholds (8, 4, 2 players)
   */
  const handleSubmitResults = () => {
    if (!currentRound) return;
    setSaveError(null);

    const activeRoundEntries = entries.filter((entry) => !entry.eliminated);
    const results: Array<{ playerId: string; timeMs: number; isRetry?: boolean; tvNumber?: number }> = [];
    const rawTimesByPlayer: Record<string, number> = {};

    for (const entry of activeRoundEntries) {
      const isRetry = retryFlags[entry.playerId] === true;
      const tvNumber = tvAssignments[entry.playerId] ?? null;
      const timeMs = isRetry ? RETRY_PENALTY_MS : timeToMs(courseTimes[entry.playerId] || '');
      if (timeMs === null) {
        setSaveError(tTaFinals('invalidTimeFor', { name: entry.player.nickname }));
        return;
      }
      rawTimesByPlayer[entry.playerId] = timeMs;
      results.push({
        playerId: entry.playerId,
        timeMs,
        ...(isRetry ? { isRetry: true } : {}),
        ...(tvNumber !== null ? { tvNumber } : {}),
      });
    }

    if (results.length < 2) {
      setSaveError(tTaFinals('needAtLeast2Players'));
      return;
    }

    try {
      setSubmitPreview(
        buildTaRoundPreview(
          activeRoundEntries.map((entry) => ({
            playerId: entry.playerId,
            playerName: entry.player.nickname,
            taHandicapSeconds: entry.taHandicapSeconds,
            lives: entry.lives,
          })),
          rawTimesByPlayer,
          retryFlags,
          taMode,
        ),
      );
      setPendingSubmitResults(results);
      setSubmitPreviewOpen(true);
    } catch (previewError) {
      setSaveError(previewError instanceof Error ? previewError.message : tTaFinals('previewError'));
    }
  };

  const confirmSubmitResults = async () => {
    if (!currentRound || pendingSubmitResults.length < 2) return;
    setSubmitting(true);
    setSaveError(null);
    try {
      const response = await fetch(`/api/tournaments/${tournamentId}/ta/phases`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'submit_results',
          phase: 'phase3',
          roundNumber: currentRound.roundNumber,
          results: pendingSubmitResults,
        }),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to submit results');
      }
      const json = await response.json();
      const data = json.data ?? json;
      setSubmitPreviewOpen(false);
      setPendingSubmitResults([]);
      setSubmitPreview([]);
      setCurrentRound(null);
      setCourseTimes({});
      setRetryFlags({});
      setTvAssignments({});
      resetBroadcastStatus();
      setIsEditing(false);
      if (data.tieBreakRequired) {
        await fetchData();
        return;
      }
      await fetchData();
    } catch (submitError) {
      setSaveError(submitError instanceof Error ? submitError.message : 'Failed to submit results');
    } finally {
      setSubmitting(false);
    }
  };

  const {
    pendingSuddenDeath,
    pendingSuddenDeathEntries,
    suddenDeathTimes,
    changingSuddenDeathCourse,
    submittingSuddenDeath,
    setSuddenDeathTime,
    handleSuddenDeathTimeBlur,
    handleSuddenDeathCourseChange,
    handleSubmitSuddenDeath,
  } = useTaSuddenDeath({
    tournamentId,
    phase: 'phase3',
    entries,
    rounds,
    fetchData,
    setSaveError,
    invalidTimeMessage: (name) => tTaFinals('invalidTimeFor', { name }),
  });

  /** Manually eliminate a specific player (admin override) */
  const handleEliminatePlayer = async () => {
    if (!entryToEliminate) return;
    try {
      // Use the main TA API for manual elimination since it supports direct entry updates
      const response = await fetch(`/api/tournaments/${tournamentId}/ta`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entryId: entryToEliminate.id,
          eliminated: true,
          action: 'eliminate',
        }),
      });
      if (response.ok) {
        setIsEliminateDialogOpen(false);
        setEntryToEliminate(null);
        fetchData();
      } else {
        const error = await response.json();
        alert(error.error || 'Failed to eliminate player');
      }
    } catch (err) {
      logger.error('Failed to eliminate player:', { error: err, tournamentId });
      alert('Failed to eliminate player');
    }
  };

  // === Derived State ===
  const activeEntries = entries.filter((e) => !e.eliminated);
  const eliminatedEntries = entries.filter((e) => e.eliminated);
  const isComplete = activeEntries.length <= 1 && entries.length > 0;

  // Check if there's an open (unsubmitted) round
  const hasOpenRound = rounds.length > 0 && (rounds[rounds.length - 1].results as unknown[]).length === 0;

  /** Count of completed rounds (with submitted results), used in multiple sections */
  const completedRoundsCount = rounds.filter((r) => (r.results as unknown[]).length > 0).length;
  const courseCycleStatus = getCourseCycleStatus(playedCourses);

  // Life reset notification: show when lives were just reset
  const lastCompletedRound = [...rounds].reverse().find((r) => (r.results as unknown[]).length > 0);
  const livesWereJustReset = lastCompletedRound?.livesReset === true;

  // === Loading State ===
  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div className="space-y-3">
            <div className="h-9 w-32 bg-muted animate-pulse rounded" />
            <div className="h-5 w-48 bg-muted animate-pulse rounded" />
          </div>
        </div>
        <CardSkeleton />
      </div>
    );
  }

  // === Error State ===
  if (error) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-semibold">{tTaFinals('phase3Title')}</h1>
          <Button variant="outline" asChild>
            <a href={`/tournaments/${tournamentId}/ta`}>{tFinals('backToQualification')}</a>
          </Button>
        </div>
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-destructive mb-4">{error}</p>
            <Button onClick={fetchData}>{tCommon('retry')}</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // === Empty State ===
  if (entries.length === 0) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-semibold">{tTaFinals('phase3Title')}</h1>
            <p className="text-muted-foreground">{tTaFinals('phase3Desc')}</p>
          </div>
          <Button variant="outline" asChild>
            <a href={`/tournaments/${tournamentId}/ta`}>{tFinals('backToQualification')}</a>
          </Button>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>{tTaFinals('noFinalsYet')}</CardTitle>
            <CardDescription>{tTaFinals('noFinalsDesc')}</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  // === Round-correction controls (shared) ===
  // Extracted so the same undo / cancel-last-round controls can appear both in
  // the active round-management card AND in a standalone card after the phase
  // is complete (champion decided) — the latter lets an admin fix a mistake in
  // the final round without a full phase reset. Buttons render only when at
  // least one round has been submitted; dialogs are rendered once at top level.
  const canManage = Boolean(isAdmin) && !archived;

  const roundCorrectionControls =
    completedRoundsCount > 0 ? (
      <RoundCorrectionControls
        translate={tTaFinals}
        actionsDisabled={undoingRound || cancellingLastRound || startingRound || hasOpenRound}
        undoingRound={undoingRound}
        cancellingLastRound={cancellingLastRound}
        showUndoConfirm={showUndoConfirm}
        onShowUndoConfirmChange={setShowUndoConfirm}
        showCancelConfirm={showCancelLastRoundConfirm}
        onShowCancelConfirmChange={setShowCancelLastRoundConfirm}
        onUndoRound={handleUndoRound}
        onCancelLastRound={handleCancelLastRound}
      />
    ) : null;

  // === Main Render ===
  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold">{tTaFinals('phase3Title')}</h1>
            <TaModeBadge mode={taMode} verbose />
            {archived && <Badge variant="outline">{tTaFinals('archivedBadge')}</Badge>}
          </div>
          <p className="text-muted-foreground text-sm sm:text-base">
            {isComplete
              ? tFinals('tournamentComplete')
              : tTaFinals('playersRemaining', { count: activeEntries.length })}
          </p>
        </div>
        <Button variant="outline" asChild>
          <a href={`/tournaments/${tournamentId}/ta`}>{tFinals('backToQualification')}</a>
        </Button>
      </div>

      <Card>
        <CardContent className="grid gap-2 py-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <span className="text-muted-foreground">{tTaFinals('initialLivesRule')}</span>{' '}
            <strong>{phase3Rules.initialLives}</strong>
          </div>
          <div>
            {taMode === 'battle_royale'
              ? tTaFinals('noLifeResetRule')
              : tTaFinals('resetThresholdRule', { thresholds: phase3Rules.lifeResetThresholds.join('/') })}
          </div>
          <div>{tTaFinals('bottomHalfLifeLossRule')}</div>
          <div>{phase3Rules.handicapEnabled ? tTaFinals('handicapRule') : tTaFinals('noHandicapRule')}</div>
        </CardContent>
      </Card>

      {/* Champion Banner */}
      {isComplete && activeEntries.length === 1 && (
        <Card className="border-accent bg-accent/10">
          <CardContent className="py-6 text-center">
            <h2 className="text-sm font-semibold text-muted-foreground">{tFinals('champion')}</h2>
            <p className="font-display text-3xl sm:text-4xl tracking-wide text-foreground mt-2">
              {activeEntries[0].player.nickname}
            </p>
            <p className="text-xs text-muted-foreground mt-2 font-mono tabular">
              {tTaFinals('livesRemaining', { lives: activeEntries[0].lives })}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Life Reset Notification: shown when last round triggered a life reset */}
      {livesWereJustReset && !isComplete && (
        <Card className="border-yellow-500 bg-yellow-500/10">
          <CardContent className="py-4 text-center">
            <p className="text-yellow-700 font-semibold">
              {tTaFinals('livesResetNotice', { count: activeEntries.length })}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Sudden-death panel (admin-only) */}
      <TASuddenDeathSection
        isAdmin={canManage}
        isComplete={isComplete}
        pendingSuddenDeath={pendingSuddenDeath}
        pendingSuddenDeathEntries={pendingSuddenDeathEntries}
        availableCourses={availableCourses}
        saveError={saveError}
        suddenDeathTimes={suddenDeathTimes}
        changingSuddenDeathCourse={changingSuddenDeathCourse}
        submittingSuddenDeath={submittingSuddenDeath}
        timeInputProps={taTimeInputProps}
        timeInputHelp={tTaFinals('timeInputHelp')}
        timePlaceholder={tTaFinals('timePlaceholder')}
        submittingLabel={tCommon('saving')}
        onCourseChange={handleSuddenDeathCourseChange}
        onTimeChange={setSuddenDeathTime}
        onTimeBlur={handleSuddenDeathTimeBlur}
        onSubmit={handleSubmitSuddenDeath}
      />

      {canManage &&
        !isComplete &&
        !pendingSuddenDeath &&
        (currentRound ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center gap-2">
                {tTaFinals('roundCourse', {
                  number: currentRound.roundNumber,
                  course: COURSE_INFO.find((c) => c.abbr === currentRound.course)?.name || currentRound.course,
                })}
                {currentRound.lifeLoss !== 1 && (
                  <Badge variant="outline" className="text-orange-600 border-orange-400 text-xs font-normal">
                    {tTaFinals('lifeLossTag', { count: currentRound.lifeLoss })}
                  </Badge>
                )}
              </CardTitle>
              <CardDescription>{tTaFinals('enterTimesDesc')}</CardDescription>
            </CardHeader>
            <CardContent>
              {saveError && (
                <div className="mb-4 p-3 bg-destructive/10 border border-destructive rounded-md">
                  <p className="text-destructive text-sm">{saveError}</p>
                </div>
              )}
              <div className="space-y-3">
                <p className={TA_TIME_INPUT_HELP_CLASS}>{tTaFinals('timeInputHelp')}</p>
                {activeEntries.map((entry) => (
                  <TaTimeEntryRow
                    key={entry.id}
                    playerId={entry.playerId}
                    playerName={entry.player.nickname}
                    livesLabel={
                      <TaLivesIndicator
                        lives={entry.lives}
                        maxLives={phase3Rules.initialLives}
                        eliminated={entry.eliminated}
                        eliminatedLabel={tTaFinals('eliminated')}
                      />
                    }
                    tvNumber={tvAssignments[entry.playerId] ?? null}
                    tvLabel={`${tCommon('tvNumber')} ${entry.player.nickname}`}
                    timeValue={courseTimes[entry.playerId] || ''}
                    timePlaceholder={tTaFinals('timePlaceholder')}
                    isRetry={retryFlags[entry.playerId]}
                    isEditingDisabled={submitting}
                    retryLabel={tCommon('retry')}
                    retryTitle={tTaFinals('retryPenalty')}
                    timeInputProps={taTimeInputProps}
                    onTvChange={handleTvChange}
                    onTimeChange={handleTimeChange}
                    onTimeBlur={handleTimeBlur}
                    onRetryToggle={handleRetryToggle}
                  />
                ))}
              </div>
              {/* 配信に反映: push TV1→player1Name, TV2→player2Name to broadcast overlay */}
              <div className="mt-3 flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleBroadcastReflect}
                    disabled={submitting}
                    className={
                      broadcastStatus === 'success'
                        ? 'border-green-500 text-green-700'
                        : broadcastStatus === 'error'
                          ? 'border-destructive text-destructive'
                          : ''
                    }
                  >
                    {broadcastStatus === 'success'
                      ? tCommon('broadcastReflected')
                      : broadcastStatus === 'error'
                        ? tCommon('broadcastError')
                        : tCommon('broadcastReflect')}
                  </Button>
                </div>
                {/* TV3/TV4 assignments are not sent to the broadcast overlay
                    (which only supports TV1/TV2). Inform the operator so
                    they know the button won't affect those players (issue #808). */}
                {hasUnbroadcastedTvAssignment && (
                  <p className="text-xs text-amber-600" role="status" aria-live="polite">
                    {tCommon('broadcastTv12Only')}
                  </p>
                )}
              </div>
              {/* Debug mode: Fill random times for all active players (admin + debugMode only) */}
              {canManage && isDebugMode && (
                <div className="mt-4">
                  <Button
                    onClick={handleFillRandomTimes}
                    variant="outline"
                    disabled={submitting}
                    className="w-full border-dashed border-orange-400 text-orange-600 hover:bg-orange-50"
                  >
                    <Dice5 className="h-4 w-4 mr-2" />
                    Fill Random Times (Debug)
                  </Button>
                </div>
              )}
              <div className="mt-6 flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => setShowCancelConfirm(true)}
                  disabled={submitting || cancellingRound}
                >
                  {tTaFinals('cancelRound')}
                </Button>
                <Button onClick={handleSubmitResults} disabled={submitting}>
                  {submitting ? tCommon('saving') : tTaFinals('submitDeductLives')}
                </Button>
              </div>

              {/* Cancel confirmation dialog to prevent accidental round deletion */}
              <Dialog open={showCancelConfirm} onOpenChange={setShowCancelConfirm}>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>{tTaFinals('cancelRoundTitle')}</DialogTitle>
                    <DialogDescription>
                      {tTaFinals('cancelRoundDesc', { course: currentRound?.course })}
                    </DialogDescription>
                  </DialogHeader>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setShowCancelConfirm(false)} disabled={cancellingRound}>
                      {tTaFinals('keepRound')}
                    </Button>
                    <Button variant="destructive" onClick={handleCancelRound} disabled={cancellingRound}>
                      {cancellingRound ? tTaFinals('cancelling') : tTaFinals('yesCancelRound')}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>{tTaFinals('tournamentControl')}</CardTitle>
              <CardDescription>{tTaFinals('startRoundDesc')}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {saveError && (
                  <div className="p-3 bg-destructive/10 border border-destructive rounded-md">
                    <p className="text-destructive text-sm">{saveError}</p>
                  </div>
                )}
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span>{tTaFinals('activePlayers')}</span>
                    <span className="font-bold">{activeEntries.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>{tTaFinals('eliminatedPlayers')}</span>
                    <span className="font-bold">{eliminatedEntries.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>{tTaFinals('roundsCompletedLabel')}</span>
                    <span className="font-bold">{completedRoundsCount}</span>
                  </div>
                </div>
                <CourseCycleStatusPanel
                  t={tTaFinals}
                  status={courseCycleStatus}
                  availableCoursesCount={availableCourses.length}
                />
                {/* Admin manual course override: selects a specific course instead of random.
                    Available courses come from the server-calculated 20-course cycle pool.
                    Leaving this on "ランダム" (default) preserves the existing random behaviour. */}
                <div className="space-y-1">
                  <Label className="text-sm text-muted-foreground">{tTaFinals('courseOverrideLabel')}</Label>
                  <Select
                    value={selectedCourse}
                    onValueChange={setSelectedCourse}
                    disabled={startingRound || hasOpenRound}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={tTaFinals('randomCourse')} />
                    </SelectTrigger>
                    <SelectContent>
                      {/* "__random__" sentinel: Radix UI Select forbids value="" (reserved for placeholder) */}
                      <SelectItem value="__random__">{tTaFinals('randomCourse')}</SelectItem>
                      {availableCourses.map((abbr) => {
                        const info = COURSE_INFO.find((c) => c.abbr === abbr);
                        return (
                          <SelectItem key={abbr} value={abbr}>
                            {info?.name || abbr}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>
                {/* TA battle royale only: override how many lives the bottom half
                    loses THIS round (default 1). Standard TA keeps the fixed
                    1-life-per-round rule, so the control is hidden there — the
                    server also rejects a non-default value outside battle royale. */}
                {taMode === 'battle_royale' && (
                  <div className="space-y-1">
                    <Label className="text-sm text-muted-foreground">{tTaFinals('roundLifeLossLabel')}</Label>
                    <Select
                      value={roundLifeLoss}
                      onValueChange={setRoundLifeLoss}
                      disabled={startingRound || hasOpenRound}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Array.from(
                          { length: TA_ROUND_LIFE_LOSS_MAX - TA_ROUND_LIFE_LOSS_MIN + 1 },
                          (_, index) => index + TA_ROUND_LIFE_LOSS_MIN,
                        ).map((count) => (
                          <SelectItem key={count} value={String(count)}>
                            {tTaFinals('lifeLossTag', { count })}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <Button
                  className="w-full"
                  size="lg"
                  onClick={handleStartRound}
                  disabled={startingRound || hasOpenRound}
                >
                  {startingRound
                    ? tTaFinals('selectingCourse')
                    : hasOpenRound
                      ? tTaFinals('completeOpenRound')
                      : tTaFinals('startRound', { number: rounds.length + 1 })}
                </Button>
                {roundCorrectionControls}
              </div>
            </CardContent>
          </Card>
        ))}

      {/* Final-round corrections (admin-only): once the champion is decided the
          round-management card above is hidden, but a mistake in the final
          round must still be fixable without resetting the whole phase
          (reported issue). Undoing restores the eliminated player, reopening
          the phase and bringing back the normal controls. */}
      {canManage && isComplete && !pendingSuddenDeath && completedRoundsCount > 0 && (
        <Card className="border-amber-400">
          <CardHeader>
            <CardTitle>{tTaFinals('correctFinalRoundTitle')}</CardTitle>
            <CardDescription>{tTaFinals('correctFinalRoundDesc')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">{roundCorrectionControls}</CardContent>
        </Card>
      )}

      {/* === Standings Section ===
       * Always visible so admin can monitor player lives at all times,
       * even while entering times for the current round.
       */}
      <Card>
        <CardHeader>
          <CardTitle>{tTaFinals('finalsStandings')}</CardTitle>
          <CardDescription>
            {tTaFinals('activeEliminated', { active: activeEntries.length, eliminated: eliminatedEntries.length })}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">#</TableHead>
                <TableHead>{tCommon('player')}</TableHead>
                {phase3Rules.handicapEnabled && <TableHead>{tTaFinals('handicap')}</TableHead>}
                <TableHead className="text-center">{tTaFinals('lives')}</TableHead>
                {/* Actions column: admin-only (manual elimination) */}
                {canManage && <TableHead className="text-right">{tCommon('actions')}</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((entry, index) => (
                <TableRow key={entry.id} className={entry.eliminated ? 'opacity-50' : ''}>
                  <TableCell className="font-bold">{index + 1}</TableCell>
                  <TableCell className="font-medium">
                    {entry.player.nickname}
                    {entry.eliminated && (
                      <Badge variant="destructive" className="ml-2 text-xs">
                        {tCommon('eliminated')}
                      </Badge>
                    )}
                  </TableCell>
                  {phase3Rules.handicapEnabled && (
                    <TableCell>
                      <TaHandicapBadge value={entry.taHandicapSeconds} />
                    </TableCell>
                  )}
                  <TableCell className="text-center">
                    <TaLivesIndicator
                      lives={entry.lives}
                      maxLives={phase3Rules.initialLives}
                      eliminated={entry.eliminated}
                      eliminatedLabel={tTaFinals('eliminated')}
                    />
                  </TableCell>
                  {/* Admin-only: manual elimination button */}
                  {canManage && (
                    <TableCell className="text-right">
                      {!entry.eliminated && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setEntryToEliminate(entry);
                            setIsEliminateDialogOpen(true);
                          }}
                        >
                          {tTaFinals('eliminate')}
                        </Button>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* === Round History Section ===
       * Collapsible to save vertical space. Uses a simple state toggle
       * rather than an Accordion component (YAGNI -- no new dependency needed).
       * Defaults to collapsed since admin rarely needs to review past rounds
       * while actively running the current round.
       */}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle>{tTaFinals('roundHistory')}</CardTitle>
              <CardDescription>{tTaFinals('roundsCompleted', { count: completedRoundsCount })}</CardDescription>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setHistoryExpanded((prev) => !prev)}>
              {historyExpanded ? tCommon('hide') : tCommon('show')}
            </Button>
          </div>
        </CardHeader>
        {historyExpanded && (
          <CardContent>
            {rounds.length === 0 ? (
              <p className="text-muted-foreground text-center py-4">{tTaFinals('noRoundsYet')}</p>
            ) : (
              <div className="space-y-4">
                {[...rounds]
                  .filter((r) => (r.results as unknown[]).length > 0)
                  .reverse()
                  .map((round) => {
                    const courseInfo = COURSE_INFO.find((c) => c.abbr === round.course);
                    const sortedResults = [...round.results].sort((a, b) => a.timeMs - b.timeMs);
                    const halfPoint = Math.ceil(sortedResults.length / 2);
                    const roundLifeLossCount = round.lifeLoss ?? 1;
                    return (
                      <div key={round.id} className="border rounded-lg p-4 space-y-2">
                        <div className="flex justify-between items-center">
                          <h4 className="font-semibold">
                            {tTaFinals('roundCourse', {
                              number: round.roundNumber,
                              course: courseInfo?.name || round.course,
                            })}
                          </h4>
                          <div className="flex gap-2">
                            {round.tvNumber && (
                              <Badge variant="outline" className="text-blue-600 border-blue-400 text-xs">
                                TV{round.tvNumber}
                              </Badge>
                            )}
                            {roundLifeLossCount !== 1 && (
                              <Badge variant="outline" className="text-orange-600 border-orange-400 text-xs">
                                {tTaFinals('lifeLossTag', { count: roundLifeLossCount })}
                              </Badge>
                            )}
                            {round.livesReset && (
                              <Badge className="bg-yellow-500 text-black">{tTaFinals('livesReset')}</Badge>
                            )}
                            {/* Show "手動選択" badge when admin manually specified the course */}
                            {round.manualOverride && (
                              <Badge variant="outline" className="text-amber-600 border-amber-400 text-xs">
                                {tTaFinals('manualCourseOverride')}
                              </Badge>
                            )}
                            <Badge variant="outline" className="font-mono text-xs">
                              {round.course}
                            </Badge>
                          </div>
                        </div>
                        <div className="space-y-1">
                          {sortedResults.map((result, idx) => {
                            const isEliminated = round.eliminatedIds?.includes(result.playerId);
                            // Prefer the server-computed lifeLost (accounts for a resolved
                            // sudden-death tiebreak on a boundary tie); a plain "slower half
                            // of raw time" split gets the boundary wrong for tied rounds.
                            // The raw-time fallback only applies to stale/legacy responses
                            // that predate this field.
                            const isBottomHalf =
                              typeof result.lifeLost === 'boolean' ? result.lifeLost : idx >= halfPoint;
                            return (
                              <div
                                key={result.playerId}
                                className={`flex justify-between text-sm ${isEliminated ? 'text-red-500 font-semibold' : isBottomHalf ? 'text-orange-500' : ''}`}
                              >
                                <span>
                                  {idx + 1}. {playerNames[result.playerId] || result.playerId}
                                  {result.isRetry && (
                                    <Badge variant="outline" className="ml-1 text-xs">
                                      {tCommon('retry')}
                                    </Badge>
                                  )}
                                  {isBottomHalf &&
                                    !isEliminated &&
                                    ` ${tTaFinals('lifeLossTag', { count: roundLifeLossCount })}`}
                                  {isEliminated && ` ${tTaFinals('eliminatedTag')}`}
                                  {typeof result.livesAfter === 'number' && (
                                    <span className="ml-1 font-mono text-xs text-muted-foreground">
                                      {tTaFinals('roundLivesRemaining', { lives: result.livesAfter })}
                                    </span>
                                  )}
                                </span>
                                <span className="text-right font-mono tabular-nums">
                                  {phase3Rules.handicapEnabled ? (
                                    <span className="flex flex-col">
                                      <strong>{msToDisplayTime(result.timeMs)}</strong>
                                      <span className="text-xs text-muted-foreground">
                                        {tTaFinals('rawTimeShort')} {msToDisplayTime(result.rawTimeMs ?? result.timeMs)}{' '}
                                        / {result.handicapSeconds ?? 0}s
                                      </span>
                                    </span>
                                  ) : (
                                    msToDisplayTime(result.timeMs)
                                  )}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                        {(round.suddenDeathRounds || []).length > 0 && (
                          <div className="mt-3 border-t pt-2 space-y-2">
                            {(round.suddenDeathRounds || []).map((sd) => (
                              <div key={sd.id} className="text-sm">
                                <div className="flex justify-between">
                                  <span className="font-medium">
                                    {tTaSuddenDeath('suddenDeathRoundLabel', { sequence: sd.sequence })}
                                  </span>
                                  <Badge variant="outline" className="font-mono text-xs">
                                    {sd.course}
                                  </Badge>
                                </div>
                                {sortResultsByTime(sd.results || []).map((result) => (
                                  <div key={result.playerId} className="flex justify-between text-muted-foreground">
                                    <span>{playerNames[result.playerId] || result.playerId}</span>
                                    <span className="font-mono">{msToDisplayTime(result.timeMs)}</span>
                                  </div>
                                ))}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
              </div>
            )}
          </CardContent>
        )}
      </Card>

      <Dialog open={submitPreviewOpen} onOpenChange={(open) => !submitting && setSubmitPreviewOpen(open)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{tTaFinals('reviewBeforeSubmit')}</DialogTitle>
            <DialogDescription>{tTaFinals('previewDescription')}</DialogDescription>
          </DialogHeader>
          {saveError && (
            <p className="text-sm text-destructive" role="alert">
              {saveError}
            </p>
          )}
          <div className="max-h-[60vh] space-y-2 overflow-y-auto">
            {submitPreview.map((row) => (
              <div
                key={row.playerId}
                className="grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-md border p-3 text-sm"
              >
                <strong>{row.projectedRank}</strong>
                <div>
                  <div className="font-medium">{row.playerName}</div>
                  <div className="text-xs text-muted-foreground">
                    {tTaFinals('rawTimeShort')} {msToDisplayTime(row.rawTimeMs)} / {row.handicapSeconds}s
                    {row.isRetry ? ` / ${tTaFinals('retryNoHandicap')}` : ''}
                  </div>
                </div>
                <div className="text-right font-mono tabular-nums">
                  <strong>{msToDisplayTime(row.adjustedTimeMs)}</strong>
                  <div className="text-xs text-muted-foreground">
                    {row.boundaryTie
                      ? tTaFinals('mayRequireSuddenDeath')
                      : row.projectedLifeLoss
                        ? tTaFinals('projectedLifeLossCount', { count: currentRound?.lifeLoss ?? 1 })
                        : tTaFinals('projectedSafe')}
                  </div>
                </div>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSubmitPreviewOpen(false)} disabled={submitting}>
              {tTaFinals('backToEdit')}
            </Button>
            <Button onClick={confirmSubmitResults} disabled={submitting}>
              {submitting ? tCommon('saving') : tTaFinals('confirmResults')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Manual Elimination Confirmation Dialog: admin-only */}
      {canManage && (
        <AlertDialog open={isEliminateDialogOpen} onOpenChange={setIsEliminateDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{tTaFinals('eliminatePlayerTitle')}</AlertDialogTitle>
              <AlertDialogDescription>
                {tTaFinals('eliminatePlayerDesc', { player: entryToEliminate?.player.nickname || '' })}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{tCommon('cancel')}</AlertDialogCancel>
              <AlertDialogAction onClick={handleEliminatePlayer}>{tTaFinals('eliminate')}</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}
