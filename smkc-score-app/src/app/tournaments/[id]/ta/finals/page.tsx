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
import { COURSE_INFO, RETRY_PENALTY_DISPLAY, RETRY_PENALTY_MS } from "@/lib/constants";
import { generateRandomTimeString } from "@/lib/ta/time-utils";
import { CardSkeleton } from "@/components/ui/loading-skeleton";
import { Dice5 } from "lucide-react";

/** Player data structure from API */
interface Player {
  id: string;
  name: string;
  nickname: string;
}

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
  results: Array<{ playerId: string; timeMs: number; isRetry: boolean }>;
  eliminatedIds: string[] | null;
  livesReset: boolean;
  createdAt: string;
}

/**
 * Convert milliseconds to display format (M:SS.mmm).
 * Returns "-" for null values.
 */
function msToDisplayTime(ms: number | null): string {
  if (ms === null) return "-";
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  const milliseconds = ms % 1000;
  return `${minutes}:${seconds.toString().padStart(2, "0")}.${milliseconds.toString().padStart(3, "0")}`;
}

/**
 * Convert time string (M:SS.mmm) to milliseconds.
 * Returns null for empty or invalid strings.
 */
function timeToMs(time: string): number | null {
  if (!time || time === "") return null;
  const match = time.match(/^(\d{1,2}):(\d{2})\.(\d{1,3})$/);
  if (!match) return null;
  const minutes = parseInt(match[1], 10);
  const seconds = parseInt(match[2], 10);
  let ms = match[3];
  while (ms.length < 3) ms += "0";
  const milliseconds = parseInt(ms, 10);
  return minutes * 60 * 1000 + seconds * 1000 + milliseconds;
}

/**
 * Render visual lives indicator with heart icons.
 * Hearts turn red when only 1 life remains (danger state).
 */
function renderLives(lives: number, eliminated: boolean) {
  if (eliminated) {
    return <span className="text-gray-400">Eliminated</span>;
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
  /* i18n translation hooks for TA finals, finals, and common namespaces */
  const tTaFinals = useTranslations('taFinals');
  const tFinals = useTranslations('finals');
  const tCommon = useTranslations('common');

  // === State Management ===
  const [entries, setEntries] = useState<TTEntry[]>([]);
  const [rounds, setRounds] = useState<PhaseRound[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Current round state (after "Start Round" is clicked)
  const [currentRound, setCurrentRound] = useState<{
    roundNumber: number;
    course: string;
  } | null>(null);
  const [courseTimes, setCourseTimes] = useState<Record<string, string>>({});
  const [retryFlags, setRetryFlags] = useState<Record<string, boolean>>({});
  const [submitting, setSubmitting] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [startingRound, setStartingRound] = useState(false);
  const [cancellingRound, setCancellingRound] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  // Development-only flag: uses NODE_ENV which is inlined at build time by Next.js,
  // ensuring the dev button JSX is tree-shaken from production builds entirely.
  const isDevelopment = process.env.NODE_ENV === 'development';

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
      const data = await response.json();
      const fetchedEntries: TTEntry[] = data.entries || [];
      const fetchedRounds: PhaseRound[] = data.rounds || [];
      setEntries(fetchedEntries);
      setRounds(fetchedRounds);

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
          activeEntries.forEach((entry) => {
            initialTimes[entry.playerId] = "";
            initialRetry[entry.playerId] = false;
          });
          setCurrentRound({
            roundNumber: lastRound.roundNumber,
            course: lastRound.course,
          });
          setCourseTimes(initialTimes);
          setRetryFlags(initialRetry);
        }
      }
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to fetch data";
      console.error("Failed to fetch data:", err);
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [tournamentId]);

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
          body: JSON.stringify({ action: "start_round", phase: "phase3" }),
        }
      );
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to start round");
      }
      const data = await response.json();

      // Initialize time entry form for all active players
      const activeEntries = entries.filter((e) => !e.eliminated);
      const initialTimes: Record<string, string> = {};
      const initialRetry: Record<string, boolean> = {};
      activeEntries.forEach((entry) => {
        initialTimes[entry.playerId] = "";
        initialRetry[entry.playerId] = false;
      });

      setCurrentRound({
        roundNumber: data.roundNumber,
        course: data.course,
      });
      setCourseTimes(initialTimes);
      setRetryFlags(initialRetry);
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
        if (isRetry) {
          results.push({
            playerId: entry.playerId,
            timeMs: RETRY_PENALTY_MS,
            isRetry: true,
          });
        } else {
          const timeStr = courseTimes[entry.playerId] || "";
          const timeMs = timeToMs(timeStr);
          if (timeMs === null) {
            setSaveError(
              `Invalid time for ${entry.player.nickname}. Enter M:SS.mmm format.`
            );
            setSubmitting(false);
            return;
          }
          results.push({ playerId: entry.playerId, timeMs });
        }
      }

      if (results.length < 2) {
        setSaveError("Need at least 2 players to submit results");
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

      setCurrentRound(null);
      setCourseTimes({});
      setRetryFlags({});
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
      console.error("Failed to eliminate player:", err);
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
          <h1 className="text-3xl font-bold">{tTaFinals('phase3Title')}</h1>
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
            <h1 className="text-3xl font-bold">{tTaFinals('phase3Title')}</h1>
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
          <h1 className="text-2xl sm:text-3xl font-bold">
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
        <Card className="border-yellow-500 bg-yellow-500/10">
          <CardContent className="py-6 text-center">
            <div className="text-4xl mb-2">&#127942;</div>
            <h2 className="text-2xl font-bold">{tFinals('champion')}</h2>
            <p className="text-3xl font-bold text-yellow-500 mt-2">
              {activeEntries[0].player.nickname}
            </p>
            <p className="text-sm text-muted-foreground mt-1">
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
       * Occupies a fixed position at the top of the content area.
       * Transitions in-place between two states without tab switching (issue #168):
       * - No active round: stats summary + "Start Round" button
       * - Active round: time entry form for the current course
       */}
      {!isComplete && (
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
                  <div key={entry.id} className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <Label className="truncate block">
                        {entry.player.nickname}
                      </Label>
                      <div className="text-xs text-muted-foreground">
                        {renderLives(entry.lives, entry.eliminated)}
                      </div>
                    </div>
                    <Input
                      type="text"
                      placeholder="M:SS.mmm"
                      value={courseTimes[entry.playerId] || ""}
                      onChange={(e) =>
                        handleTimeChange(entry.playerId, e.target.value)
                      }
                      disabled={retryFlags[entry.playerId]}
                      className="font-mono w-32"
                    />
                    <Button
                      variant={
                        retryFlags[entry.playerId]
                          ? "destructive"
                          : "outline"
                      }
                      size="sm"
                      onClick={() => handleRetryToggle(entry.playerId)}
                      title="Mark as retry (penalty: 9:59.990)"
                    >
                      {tCommon('retry')}
                    </Button>
                  </div>
                ))}
              </div>
              {/* Development-only: Fill random times for all active players */}
              {isDevelopment && (
                <div className="mt-4">
                  <Button
                    onClick={handleFillRandomTimes}
                    variant="outline"
                    disabled={submitting}
                    className="w-full border-dashed border-orange-400 text-orange-600 hover:bg-orange-50"
                  >
                    <Dice5 className="h-4 w-4 mr-2" />
                    Fill Random Times (Dev Only)
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
              </div>
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
                <TableHead className="text-right">{tCommon('actions')}</TableHead>
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
                    {renderLives(entry.lives, entry.eliminated)}
                  </TableCell>
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
                            {round.livesReset && (
                              <Badge className="bg-yellow-500 text-black">
                                {tTaFinals('livesReset')}
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
                      </div>
                    );
                  })}
              </div>
            )}
          </CardContent>
        )}
      </Card>

      {/* Manual Elimination Confirmation Dialog */}
      <AlertDialog
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
      </AlertDialog>
    </div>
  );
}
