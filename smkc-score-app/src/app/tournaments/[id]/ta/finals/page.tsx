"use client";

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

import { useState, useEffect, useCallback, use } from "react";
import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { COURSE_INFO, RETRY_PENALTY_DISPLAY, RETRY_PENALTY_MS, TV_NUMBER_OPTIONS } from "@/lib/constants";
import { generateRandomTimeString, msToDisplayTime, timeToMs } from "@/lib/ta/time-utils";
import {
  TA_FINALS_ROUND_CONTROLS_CLASS,
  TA_FINALS_ROUND_ENTRY_ROW_CLASS,
  TA_FINALS_ROUND_PLAYER_LABEL_CLASS,
  TA_FINALS_ROUND_PLAYER_NAME_CLASS,
  TA_FINALS_TIME_INPUT_CLASS,
  getTaTimeInputProps,
} from "@/lib/ta/time-entry-layout";
import { CardSkeleton } from "@/components/ui/loading-skeleton";
import { Dice5 } from "lucide-react";
import { createLogger } from "@/lib/client-logger";
import type { Player } from "@/lib/types";
import { useTournamentDebugMode } from "@/lib/hooks/use-tournament-debug-mode";
import { useBroadcastReflect } from "@/lib/hooks/use-broadcast-reflect";

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
  player: Player;
}

/** Round record from the phases API */
interface PhaseRound {
  id: string;
  phase: string;
  roundNumber: number;
  course: string;
  tvNumber?: number | null;
  results: Array<{ playerId: string; timeMs: number; isRetry: boolean }>;
  eliminatedIds: string[] | null;
  livesReset: boolean;
  manualOverride: boolean;
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

/**
 * Render visual lives indicator with heart icons.
 * Hearts turn red when only 1 life remains (danger state).
 * eliminatedLabel is a translated string passed from the component to avoid i18n hooks at module scope.
 */
function renderLives(lives: number, eliminated: boolean, eliminatedLabel: string) {
  if (eliminated) {
    return <span className="text-gray-400">{eliminatedLabel}</span>;
  }
  const hearts = [];
  for (let i = 0; i < lives; i++) {
    hearts.push(
      <span
        key={i}
        className={lives === 1 ? "text-red-500" : "text-red-400"}
      >
        &#10084;&#65039;
      </span>
    );
  }
  return <span>{hearts}</span>;
}

export default function TimeAttackFinals({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: tournamentId } = use(params);
  const { data: session } = useSession();
  /* i18n translation hooks for TA finals, finals, and common namespaces */
  const tTaFinals = useTranslations('taFinals');
  const tFinals = useTranslations('finals');
  const tCommon = useTranslations('common');
  const taTimeInputProps = getTaTimeInputProps(tTaFinals('timeInputTitle'));

  /**
   * Admin role check: only admin users can start rounds, enter times,
   * submit results, and eliminate players. Non-admin users see read-only
   * standings, history, and champion banner.
   */
  const isAdmin = session?.user && session.user.role === 'admin';

  // === State Management ===
  const [entries, setEntries] = useState<TTEntry[]>([]);
  const [rounds, setRounds] = useState<PhaseRound[]>([]);
  // Available courses for the next round (received from GET response).
  // Used to populate the manual course selector dropdown.
  const [availableCourses, setAvailableCourses] = useState<string[]>([]);
  // Admin-selected course override. "__random__" = use random selection (default).
  // Cannot use "" because Radix UI Select reserves empty string for "no selection" (placeholder).
  const [selectedCourse, setSelectedCourse] = useState<string>("__random__");
  // Per-player TV assignments for the active round: playerId → TV number (1-4) or null.
  const [tvAssignments, setTvAssignments] = useState<Record<string, number | null>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Current round state (after "Start Round" is clicked)
  const [currentRound, setCurrentRound] = useState<{
    roundNumber: number;
    course: string;
  } | null>(null);
  const [courseTimes, setCourseTimes] = useState<Record<string, string>>({});
  const [retryFlags, setRetryFlags] = useState<Record<string, boolean>>({});
  const [suddenDeathTimes, setSuddenDeathTimes] = useState<Record<string, string>>({});
  const [changingSuddenDeathCourse, setChangingSuddenDeathCourse] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [startingRound, setStartingRound] = useState(false);
  const [cancellingRound, setCancellingRound] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [undoingRound, setUndoingRound] = useState(false);
  const [showUndoConfirm, setShowUndoConfirm] = useState(false);

  // Show random-fill button when tournament debugMode is enabled (admin only).
  const isDebugMode = useTournamentDebugMode(tournamentId);

  // Broadcast overlay state and handler — shared with ta-elimination-phase via hook.
  const {
    broadcastStatus,
    handleBroadcastReflect,
    resetBroadcastStatus,
    hasUnbroadcastedTvAssignment,
  } = useBroadcastReflect(tournamentId, tvAssignments, entries);

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

  // === Data Fetching ===
  const fetchData = useCallback(async () => {
    setError(null);
    try {
      // Use the new phases API with phase3 parameter
      const response = await fetch(
        `/api/tournaments/${tournamentId}/ta/phases?phase=phase3`
      );
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.error || `Failed to fetch finals data: ${response.status}`
        );
      }
      const json = await response.json();
      // Unwrap createSuccessResponse wrapper: { success, data: { entries, rounds, ... } }
      const data = json.data ?? json;
      const fetchedEntries: TTEntry[] = data.entries || [];
      const fetchedRounds: PhaseRound[] = data.rounds || [];
      setEntries(fetchedEntries);
      setRounds(fetchedRounds);
      setAvailableCourses(data.availableCourses || []);

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
            initialTimes[entry.playerId] = "";
            initialRetry[entry.playerId] = false;
            initialTv[entry.playerId] = null;
          });
          setCurrentRound({
            roundNumber: lastRound.roundNumber,
            course: lastRound.course,
          });
          setCourseTimes(initialTimes);
          setRetryFlags(initialRetry);
          setTvAssignments(initialTv);
        }
      }
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to fetch data";
      logger.error("Failed to fetch data:", { error: err, tournamentId });
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [tournamentId, currentRound]);

  // Initial fetch
  useEffect(() => {
    fetchData();
  }, [fetchData]);

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
      const response = await fetch(
        `/api/tournaments/${tournamentId}/ta/phases`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "start_round",
            phase: "phase3",
            // Only include course when admin has manually selected one;
            // omitting it lets the server choose randomly (default behaviour).
            ...(selectedCourse && selectedCourse !== "__random__" ? { course: selectedCourse } : {}),
          }),
        }
      );
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to start round");
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
        initialTimes[entry.playerId] = "";
        initialRetry[entry.playerId] = false;
        initialTv[entry.playerId] = null;
      });

      setCurrentRound({
        roundNumber: data.roundNumber,
        course: data.course,
      });
      setCourseTimes(initialTimes);
      setRetryFlags(initialRetry);
      setTvAssignments(initialTv);
      resetBroadcastStatus();
      setSelectedCourse("__random__"); // Reset manual selection after round is started
      fetchData();
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to start round";
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
      const response = await fetch(
        `/api/tournaments/${tournamentId}/ta/phases`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "cancel_round",
            phase: "phase3",
            roundNumber: currentRound.roundNumber,
          }),
        }
      );
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to cancel round");
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
      const errorMessage =
        err instanceof Error ? err.message : "Failed to cancel round";
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
      const response = await fetch(
        `/api/tournaments/${tournamentId}/ta/phases`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "undo_round", phase: "phase3" }),
        }
      );
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to undo round");
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
      const errorMessage =
        err instanceof Error ? err.message : "Failed to undo round";
      setSaveError(errorMessage);
      setShowUndoConfirm(false);
    } finally {
      setUndoingRound(false);
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
  const handleTimeChange = (playerId: string, value: string) => {
    setIsEditing(true);
    setCourseTimes((prev) => ({ ...prev, [playerId]: value }));
    if (retryFlags[playerId]) {
      setRetryFlags((prev) => ({ ...prev, [playerId]: false }));
    }
  };

  /** Toggle retry penalty: sets time to 9:59.990 and marks isRetry flag */
  const handleRetryToggle = (playerId: string) => {
    const isCurrentlyRetry = retryFlags[playerId];
    setRetryFlags((prev) => ({ ...prev, [playerId]: !isCurrentlyRetry }));
    if (!isCurrentlyRetry) {
      setCourseTimes((prev) => ({
        ...prev,
        [playerId]: RETRY_PENALTY_DISPLAY,
      }));
    } else {
      setCourseTimes((prev) => ({ ...prev, [playerId]: "" }));
    }
  };

  /**
   * Submit round results: sends player times to the API.
   * The server handles:
   * - Retry penalty enforcement (9:59.990)
   * - Bottom half life deduction
   * - Elimination of players at 0 lives
   * - Life reset at thresholds (8, 4, 2 players)
   */
  const handleSubmitResults = async () => {
    if (!currentRound) return;
    setSubmitting(true);
    setSaveError(null);

    try {
      const activeEntries = entries.filter((e) => !e.eliminated);
      const results: Array<{
        playerId: string;
        timeMs: number;
        isRetry?: boolean;
      }> = [];

      for (const entry of activeEntries) {
        const isRetry = retryFlags[entry.playerId];
        const tvNumber = tvAssignments[entry.playerId] ?? null;
        if (isRetry) {
          results.push({
            playerId: entry.playerId,
            timeMs: RETRY_PENALTY_MS,
            isRetry: true,
            ...(tvNumber !== null ? { tvNumber } : {}),
          });
        } else {
          const timeStr = courseTimes[entry.playerId] || "";
          const timeMs = timeToMs(timeStr);
          if (timeMs === null) {
            setSaveError(
              tTaFinals('invalidTimeFor', { name: entry.player.nickname })
            );
            setSubmitting(false);
            return;
          }
          results.push({
            playerId: entry.playerId,
            timeMs,
            ...(tvNumber !== null ? { tvNumber } : {}),
          });
        }
      }

      if (results.length < 2) {
        setSaveError(tTaFinals('needAtLeast2Players'));
        setSubmitting(false);
        return;
      }

      const response = await fetch(
        `/api/tournaments/${tournamentId}/ta/phases`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "submit_results",
            phase: "phase3",
            roundNumber: currentRound.roundNumber,
            results,
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to submit results");
      }
      const json = await response.json();
      const data = json.data ?? json;
      if (data.tieBreakRequired) {
        setCurrentRound(null);
        setCourseTimes({});
        setRetryFlags({});
        setTvAssignments({});
        setSuddenDeathTimes({});
        resetBroadcastStatus();
        setIsEditing(false);
        fetchData();
        return;
      }

      setCurrentRound(null);
      setCourseTimes({});
      setRetryFlags({});
      setTvAssignments({});
      resetBroadcastStatus();
      setIsEditing(false);
      fetchData();
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to submit results";
      setSaveError(errorMessage);
    } finally {
      setSubmitting(false);
    }
  };

  const pendingSuddenDeath = rounds
    .flatMap((round) => (round.suddenDeathRounds || []).map((sd) => ({ ...sd, round })))
    .find((sd) => !sd.resolved);

  const pendingSuddenDeathEntries = pendingSuddenDeath
    ? entries.filter((entry) => pendingSuddenDeath.targetPlayerIds.includes(entry.playerId))
    : [];

  const handleSuddenDeathCourseChange = async (course: string) => {
    if (!pendingSuddenDeath) return;
    setChangingSuddenDeathCourse(true);
    setSaveError(null);
    try {
      const response = await fetch(`/api/tournaments/${tournamentId}/ta/phases`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "change_sudden_death_course",
          phase: "phase3",
          suddenDeathRoundId: pendingSuddenDeath.id,
          course,
        }),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to change sudden-death course");
      }
      fetchData();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to change sudden-death course");
    } finally {
      setChangingSuddenDeathCourse(false);
    }
  };

  const handleSubmitSuddenDeath = async () => {
    if (!pendingSuddenDeath) return;
    setSubmitting(true);
    setSaveError(null);
    try {
      const results = pendingSuddenDeathEntries.map((entry) => {
        const timeMs = timeToMs(suddenDeathTimes[entry.playerId] || "");
        if (timeMs === null) {
          throw new Error(tTaFinals('invalidTimeFor', { name: entry.player.nickname }));
        }
        return { playerId: entry.playerId, timeMs };
      });
      const response = await fetch(`/api/tournaments/${tournamentId}/ta/phases`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "submit_sudden_death",
          phase: "phase3",
          suddenDeathRoundId: pendingSuddenDeath.id,
          results,
        }),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to submit sudden-death results");
      }
      setSuddenDeathTimes({});
      fetchData();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to submit sudden-death results");
    } finally {
      setSubmitting(false);
    }
  };


  /** Manually eliminate a specific player (admin override) */
  const handleEliminatePlayer = async () => {
    if (!entryToEliminate) return;
    try {
      // Use the main TA API for manual elimination since it supports direct entry updates
      const response = await fetch(`/api/tournaments/${tournamentId}/ta`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entryId: entryToEliminate.id,
          eliminated: true,
          action: "eliminate",
        }),
      });
      if (response.ok) {
        setIsEliminateDialogOpen(false);
        setEntryToEliminate(null);
        fetchData();
      } else {
        const error = await response.json();
        alert(error.error || "Failed to eliminate player");
      }
    } catch (err) {
      logger.error("Failed to eliminate player:", { error: err, tournamentId });
      alert("Failed to eliminate player");
    }
  };

  // === Derived State ===
  const activeEntries = entries.filter((e) => !e.eliminated);
  const eliminatedEntries = entries.filter((e) => e.eliminated);
  const isComplete = activeEntries.length <= 1 && entries.length > 0;

  // Check if there's an open (unsubmitted) round
  const hasOpenRound =
    rounds.length > 0 &&
    (rounds[rounds.length - 1].results as unknown[]).length === 0;

  /** Count of completed rounds (with submitted results), used in multiple sections */
  const completedRoundsCount = rounds.filter(
    (r) => (r.results as unknown[]).length > 0
  ).length;

  // Life reset notification: show when lives were just reset
  const lastCompletedRound = [...rounds]
    .reverse()
    .find((r) => (r.results as unknown[]).length > 0);
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
            <Link href={`/tournaments/${tournamentId}/ta`}>
              {tFinals('backToQualification')}
            </Link>
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
            <p className="text-muted-foreground">
              {tTaFinals('phase3Desc')}
            </p>
          </div>
          <Button variant="outline" asChild>
            <Link href={`/tournaments/${tournamentId}/ta`}>
              {tFinals('backToQualification')}
            </Link>
          </Button>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>{tTaFinals('noFinalsYet')}</CardTitle>
            <CardDescription>
              {tTaFinals('noFinalsDesc')}
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  // === Main Render ===
  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-semibold">
            {tTaFinals('phase3Title')}
          </h1>
          <p className="text-muted-foreground text-sm sm:text-base">
            {isComplete
              ? tFinals('tournamentComplete')
              : tTaFinals('playersRemaining', { count: activeEntries.length })}
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link href={`/tournaments/${tournamentId}/ta`}>
            {tFinals('backToQualification')}
          </Link>
        </Button>
      </div>

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

      {/* === Round Control / Time Entry Section ===
       * Admin-only: non-admin users see read-only standings and history.
       * Transitions in-place between two states without tab switching (issue #168):
       * - No active round: stats summary + "Start Round" button
       * - Active round: time entry form for the current course
       */}
      {isAdmin && !isComplete && pendingSuddenDeath && (
        <Card className="border-amber-500">
          <CardHeader>
            <CardTitle>Sudden-death tiebreak</CardTitle>
            <CardDescription>
              Round {pendingSuddenDeath.round.roundNumber}, tiebreak #{pendingSuddenDeath.sequence}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {saveError && (
              <div className="mb-4 p-3 bg-destructive/10 border border-destructive rounded-md">
                <p className="text-destructive text-sm">{saveError}</p>
              </div>
            )}
            <div className="mb-4 space-y-1">
              <Label className="text-sm text-muted-foreground">Sudden-death course</Label>
              <Select
                value={pendingSuddenDeath.course}
                onValueChange={handleSuddenDeathCourseChange}
                disabled={changingSuddenDeathCourse || submitting}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[...new Set([pendingSuddenDeath.course, ...availableCourses])].map((abbr) => {
                    const info = COURSE_INFO.find((c) => c.abbr === abbr);
                    return <SelectItem key={abbr} value={abbr}>{info?.name || abbr}</SelectItem>;
                  })}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-3">
              {pendingSuddenDeathEntries.map((entry) => (
                <div key={entry.id} className="flex items-center gap-2">
                  <Label className="flex-1 truncate">{entry.player.nickname}</Label>
                  <Input
                    type="text"
                    {...taTimeInputProps}
                    placeholder={tTaFinals('timePlaceholder')}
                    value={suddenDeathTimes[entry.playerId] || ""}
                    onChange={(e) => setSuddenDeathTimes((prev) => ({ ...prev, [entry.playerId]: e.target.value }))}
                    className={TA_FINALS_TIME_INPUT_CLASS}
                  />
                </div>
              ))}
            </div>
            <div className="mt-6 flex justify-end">
              <Button onClick={handleSubmitSuddenDeath} disabled={submitting}>
                {submitting ? tCommon('saving') : 'Submit sudden death'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {isAdmin && !isComplete && !pendingSuddenDeath && (
        currentRound ? (
          <Card>
            <CardHeader>
              <CardTitle>
                {tTaFinals('roundCourse', {
                  number: currentRound.roundNumber,
                  course: COURSE_INFO.find((c) => c.abbr === currentRound.course)
                    ?.name || currentRound.course,
                })}
              </CardTitle>
              <CardDescription>
                {tTaFinals('enterTimesDesc')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {saveError && (
                <div className="mb-4 p-3 bg-destructive/10 border border-destructive rounded-md">
                  <p className="text-destructive text-sm">{saveError}</p>
                </div>
              )}
              <div className="space-y-3">
                {activeEntries.map((entry) => (
                  <div
                    key={entry.id}
                    className={TA_FINALS_ROUND_ENTRY_ROW_CLASS}
                    data-testid="ta-finals-round-entry-row"
                  >
                    <div className={TA_FINALS_ROUND_PLAYER_LABEL_CLASS}>
                      <Label
                        className={TA_FINALS_ROUND_PLAYER_NAME_CLASS}
                        data-testid="ta-finals-round-player-name"
                      >
                        {entry.player.nickname}
                      </Label>
                      <div className="text-xs text-muted-foreground">
                        {renderLives(entry.lives, entry.eliminated, tTaFinals('eliminated'))}
                      </div>
                    </div>
                    <div
                      className={TA_FINALS_ROUND_CONTROLS_CLASS}
                      data-testid="ta-finals-round-controls"
                    >
                    {/* Per-player TV number selector: assign which screen this player uses */}
                    <select
                      className="h-9 w-full rounded border bg-background px-2 text-center text-sm sm:h-8 sm:w-16 sm:shrink-0"
                      value={tvAssignments[entry.playerId] ?? ""}
                      onChange={(e) => {
                        setTvAssignments((prev) => ({
                          ...prev,
                          [entry.playerId]: e.target.value ? parseInt(e.target.value) : null,
                        }));
                        resetBroadcastStatus();
                      }}
                      aria-label={`${tCommon('tvNumber')} ${entry.player.nickname}`}
                    >
                      <option value="">-</option>
                      {TV_NUMBER_OPTIONS.map((n) => <option key={n} value={n}>TV{n}</option>)}
                    </select>
                    <Input
                      type="text"
                      {...taTimeInputProps}
                      placeholder={tTaFinals('timePlaceholder')}
                      value={courseTimes[entry.playerId] || ""}
                      onChange={(e) =>
                        handleTimeChange(entry.playerId, e.target.value)
                      }
                      disabled={retryFlags[entry.playerId]}
                      className={TA_FINALS_TIME_INPUT_CLASS}
                    />
                    <Button
                      variant={
                        retryFlags[entry.playerId]
                          ? "destructive"
                          : "outline"
                      }
                      size="sm"
                      onClick={() => handleRetryToggle(entry.playerId)}
                      title={tTaFinals('retryPenalty')}
                    >
                      {tCommon('retry')}
                    </Button>
                    </div>
                  </div>
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
                  <p className="text-xs text-muted-foreground">
                    {tCommon('broadcastTv12Only')}
                  </p>
                )}
              </div>
              {/* Debug mode: Fill random times for all active players (admin + debugMode only) */}
              {isAdmin && isDebugMode && (
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
                  {submitting
                    ? tCommon('saving')
                    : tTaFinals('submitDeductLives')}
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
                    <Button
                      variant="outline"
                      onClick={() => setShowCancelConfirm(false)}
                      disabled={cancellingRound}
                    >
                      {tTaFinals('keepRound')}
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={handleCancelRound}
                      disabled={cancellingRound}
                    >
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
              <CardDescription>
                {tTaFinals('startRoundDesc')}
              </CardDescription>
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
                    <span className="font-bold">
                      {activeEntries.length}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>{tTaFinals('eliminatedPlayers')}</span>
                    <span className="font-bold">
                      {eliminatedEntries.length}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>{tTaFinals('roundsCompletedLabel')}</span>
                    <span className="font-bold">
                      {completedRoundsCount}
                    </span>
                  </div>
                </div>
                {/* Admin manual course override: selects a specific course instead of random.
                    Available courses come from the server-calculated 20-course cycle pool.
                    Leaving this on "ランダム" (default) preserves the existing random behaviour. */}
                <div className="space-y-1">
                  <Label className="text-sm text-muted-foreground">{tTaFinals('courseOverrideLabel')}</Label>
                  <Select value={selectedCourse} onValueChange={setSelectedCourse} disabled={startingRound || hasOpenRound}>
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
                {completedRoundsCount > 0 && (
                  <Button
                    variant="outline"
                    className="w-full text-amber-700 border-amber-400 hover:bg-amber-50"
                    onClick={() => setShowUndoConfirm(true)}
                    disabled={undoingRound || startingRound || hasOpenRound}
                  >
                    {tTaFinals('undoLastRound')}
                  </Button>
                )}
              </div>

              <Dialog open={showUndoConfirm} onOpenChange={setShowUndoConfirm}>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>{tTaFinals('undoRoundTitle')}</DialogTitle>
                    <DialogDescription>
                      {tTaFinals('undoRoundDesc')}
                    </DialogDescription>
                  </DialogHeader>
                  <DialogFooter>
                    <Button
                      variant="outline"
                      onClick={() => setShowUndoConfirm(false)}
                      disabled={undoingRound}
                    >
                      {tTaFinals('keepRound')}
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={handleUndoRound}
                      disabled={undoingRound}
                    >
                      {undoingRound ? tTaFinals('undoing') : tTaFinals('yesUndoRound')}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </CardContent>
          </Card>
        )
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
                <TableHead className="text-center">{tTaFinals('lives')}</TableHead>
                {/* Actions column: admin-only (manual elimination) */}
                {isAdmin && <TableHead className="text-right">{tCommon('actions')}</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((entry, index) => (
                <TableRow
                  key={entry.id}
                  className={entry.eliminated ? "opacity-50" : ""}
                >
                  <TableCell className="font-bold">{index + 1}</TableCell>
                  <TableCell className="font-medium">
                    {entry.player.nickname}
                    {entry.eliminated && (
                      <Badge
                        variant="destructive"
                        className="ml-2 text-xs"
                      >
                        {tCommon('eliminated')}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-center">
                    {renderLives(entry.lives, entry.eliminated, tTaFinals('eliminated'))}
                  </TableCell>
                  {/* Admin-only: manual elimination button */}
                  {isAdmin && (
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
              <CardDescription>
                {tTaFinals('roundsCompleted', { count: completedRoundsCount })}
              </CardDescription>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setHistoryExpanded((prev) => !prev)}
            >
              {historyExpanded ? tCommon('hide') : tCommon('show')}
            </Button>
          </div>
        </CardHeader>
        {historyExpanded && (
          <CardContent>
            {rounds.length === 0 ? (
              <p className="text-muted-foreground text-center py-4">
                {tTaFinals('noRoundsYet')}
              </p>
            ) : (
              <div className="space-y-4">
                {[...rounds]
                  .filter((r) => (r.results as unknown[]).length > 0)
                  .reverse()
                  .map((round) => {
                    const courseInfo = COURSE_INFO.find(
                      (c) => c.abbr === round.course
                    );
                    const sortedResults = [...round.results].sort(
                      (a, b) => a.timeMs - b.timeMs
                    );
                    const halfPoint = Math.ceil(sortedResults.length / 2);
                    return (
                      <div
                        key={round.id}
                        className="border rounded-lg p-4 space-y-2"
                      >
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
                            {round.livesReset && (
                              <Badge className="bg-yellow-500 text-black">
                                {tTaFinals('livesReset')}
                              </Badge>
                            )}
                            {/* Show "手動選択" badge when admin manually specified the course */}
                            {round.manualOverride && (
                              <Badge variant="outline" className="text-amber-600 border-amber-400 text-xs">
                                {tTaFinals('manualCourseOverride')}
                              </Badge>
                            )}
                            <Badge
                              variant="outline"
                              className="font-mono text-xs"
                            >
                              {round.course}
                            </Badge>
                          </div>
                        </div>
                        <div className="space-y-1">
                          {sortedResults.map((result, idx) => {
                            const isEliminated =
                              round.eliminatedIds?.includes(result.playerId);
                            // Bottom half loses a life (shown with visual indicator)
                            const isBottomHalf = idx >= halfPoint;
                            return (
                              <div
                                key={result.playerId}
                                className={`flex justify-between text-sm ${isEliminated ? "text-red-500 font-semibold" : isBottomHalf ? "text-orange-500" : ""}`}
                              >
                                <span>
                                  {idx + 1}.{" "}
                                  {playerNames[result.playerId] ||
                                    result.playerId}
                                  {result.isRetry && (
                                    <Badge
                                      variant="outline"
                                      className="ml-1 text-xs"
                                    >
                                      {tCommon('retry')}
                                    </Badge>
                                  )}
                                  {isBottomHalf && !isEliminated && ` ${tTaFinals('minusOneLife')}`}
                                  {isEliminated && ` ${tTaFinals('eliminatedTag')}`}
                                </span>
                                <span className="font-mono">
                                  {msToDisplayTime(result.timeMs)}
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
                                  <span className="font-medium">Sudden death #{sd.sequence}</span>
                                  <Badge variant="outline" className="font-mono text-xs">{sd.course}</Badge>
                                </div>
                                {(sd.results || []).map((result) => (
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

      {/* Manual Elimination Confirmation Dialog: admin-only */}
      {isAdmin && <AlertDialog
        open={isEliminateDialogOpen}
        onOpenChange={setIsEliminateDialogOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{tTaFinals('eliminatePlayerTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {tTaFinals('eliminatePlayerDesc', { player: entryToEliminate?.player.nickname || '' })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tCommon('cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleEliminatePlayer}>
              {tTaFinals('eliminate')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>}
    </div>
  );
}
