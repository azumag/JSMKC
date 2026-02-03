"use client";

/**
 * TA Elimination Phase Component (Phase 1 / Phase 2)
 *
 * Shared component for managing single-elimination phases in the TA finals.
 * Used by Phase 1 (qualification ranks 17-24) and Phase 2 (Phase 1 survivors + ranks 13-16).
 *
 * Format:
 * - 8 players compete per phase
 * - One randomly selected course at a time (no repeats until all 20 used)
 * - Slowest player is eliminated each round
 * - Continues until targetSurvivors (4) players remain
 *
 * Features:
 * - Random course selection via server API (prevents manual bias)
 * - Retry penalty button (9:59.990) for players who retry during a course
 * - Round history with course, results, and eliminated player
 * - Standings with active/eliminated status
 * - Auto-refresh every 3 seconds for live tournament tracking
 */

import { useState, useEffect, useCallback } from "react";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { COURSE_INFO, RETRY_PENALTY_DISPLAY, RETRY_PENALTY_MS } from "@/lib/constants";
import { CardSkeleton } from "@/components/ui/loading-skeleton";

/** Props for the elimination phase component */
export interface TAEliminationPhaseProps {
  tournamentId: string;
  phase: "phase1" | "phase2";
  title: string;
  description: string;
  targetSurvivors: number;
}

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
 * Convert time string (M:SS.mmm) to milliseconds for submission.
 * Returns null for empty or invalid strings.
 */
function timeToMs(time: string): number | null {
  if (!time || time === "") return null;
  const match = time.match(/^(\d{1,2}):(\d{2})\.(\d{1,3})$/);
  if (!match) return null;
  const minutes = parseInt(match[1], 10);
  const seconds = parseInt(match[2], 10);
  let ms = match[3];
  // Pad milliseconds to 3 digits for accurate conversion
  while (ms.length < 3) ms += "0";
  const milliseconds = parseInt(ms, 10);
  return minutes * 60 * 1000 + seconds * 1000 + milliseconds;
}

export default function TAEliminationPhase({
  tournamentId,
  phase,
  title,
  description,
  targetSurvivors,
}: TAEliminationPhaseProps) {
  // i18n: 'taElimination' namespace for phase-specific strings,
  // 'common' namespace for shared UI labels (e.g., "Player")
  const tElim = useTranslations('taElimination');
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

  // Round start/cancel loading state
  const [startingRound, setStartingRound] = useState(false);
  const [cancellingRound, setCancellingRound] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  // Map of playerId → nickname for display in round history
  const [playerNames, setPlayerNames] = useState<Record<string, string>>({});

  // === Data Fetching ===
  const fetchData = useCallback(async () => {
    setError(null);
    try {
      const response = await fetch(
        `/api/tournaments/${tournamentId}/ta/phases?phase=${phase}`
      );
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.error || `Failed to fetch ${phase} data: ${response.status}`
        );
      }
      const data = await response.json();
      const fetchedEntries: TTEntry[] = data.entries || [];
      const fetchedRounds: PhaseRound[] = data.rounds || [];
      setEntries(fetchedEntries);
      setRounds(fetchedRounds);

      // Build player name map from entries for round history display
      const nameMap: Record<string, string> = {};
      fetchedEntries.forEach((e: TTEntry) => {
        nameMap[e.playerId] = e.player.nickname;
      });
      setPlayerNames(nameMap);

      // Auto-recover open (unsubmitted) rounds: if there's a round with empty
      // results in the DB and the client doesn't have a currentRound set,
      // automatically enter the time entry UI for that round.
      // This handles page reloads and prevents orphaned rounds from being invisible.
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
  }, [tournamentId, phase]);

  // Initial fetch
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Auto-refresh every 3 seconds for live tournament tracking
  useEffect(() => {
    const interval = setInterval(fetchData, 3000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // === Event Handlers ===

  /**
   * Start a new round: calls the API to randomly select a course
   * and create a TTPhaseRound record.
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
          body: JSON.stringify({ action: "start_round", phase }),
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
   * This prevents orphaned rounds when the admin decides not to proceed.
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
            phase,
            roundNumber: currentRound.roundNumber,
          }),
        }
      );
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to cancel round");
      }
      // Clear client state after successful DB deletion
      setCurrentRound(null);
      setCourseTimes({});
      setRetryFlags({});
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

  /** Handle time input change for a specific player */
  const handleTimeChange = (playerId: string, value: string) => {
    setCourseTimes((prev) => ({ ...prev, [playerId]: value }));
    // Clear retry flag when manually entering a time
    if (retryFlags[playerId]) {
      setRetryFlags((prev) => ({ ...prev, [playerId]: false }));
    }
  };

  /**
   * Toggle retry penalty for a player.
   * Sets the time to 9:59.990 and marks the isRetry flag.
   */
  const handleRetryToggle = (playerId: string) => {
    const isCurrentlyRetry = retryFlags[playerId];
    setRetryFlags((prev) => ({ ...prev, [playerId]: !isCurrentlyRetry }));
    if (!isCurrentlyRetry) {
      // Set penalty time display
      setCourseTimes((prev) => ({ ...prev, [playerId]: RETRY_PENALTY_DISPLAY }));
    } else {
      // Clear penalty time
      setCourseTimes((prev) => ({ ...prev, [playerId]: "" }));
    }
  };

  /**
   * Submit round results: sends player times to the API for elimination processing.
   * The server handles retry penalty enforcement and elimination of the slowest player.
   */
  const handleSubmitResults = async () => {
    if (!currentRound) return;
    setSubmitting(true);
    setSaveError(null);

    try {
      const activeEntries = entries.filter((e) => !e.eliminated);

      // Build results array from entered times
      const results: Array<{
        playerId: string;
        timeMs: number;
        isRetry?: boolean;
      }> = [];

      for (const entry of activeEntries) {
        const isRetry = retryFlags[entry.playerId];
        if (isRetry) {
          // Retry penalty: server will enforce RETRY_PENALTY_MS
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
            phase,
            roundNumber: currentRound.roundNumber,
            results,
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to submit results");
      }

      // Clear current round and refresh data
      setCurrentRound(null);
      setCourseTimes({});
      setRetryFlags({});
      fetchData();
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to submit results";
      setSaveError(errorMessage);
    } finally {
      setSubmitting(false);
    }
  };

  // === Derived State ===
  const activeEntries = entries.filter((e) => !e.eliminated);
  const eliminatedEntries = entries.filter((e) => e.eliminated);
  const isComplete =
    activeEntries.length <= targetSurvivors && entries.length > 0;

  // Check if the last round in the rounds list has no results yet (open round)
  const hasOpenRound =
    rounds.length > 0 &&
    (rounds[rounds.length - 1].results as unknown[]).length === 0;

  // === Loading State ===
  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div className="space-y-3">
            <div className="h-9 w-40 bg-muted animate-pulse rounded" />
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
          <h1 className="text-3xl font-bold">{title}</h1>
          <Button variant="outline" asChild>
            <Link href={`/tournaments/${tournamentId}/ta`}>
              {tElim('backToQualification')}
            </Link>
          </Button>
        </div>
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-destructive mb-4">{error}</p>
            <Button onClick={fetchData}>{tElim('retry')}</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // === Empty State (no entries promoted yet) ===
  if (entries.length === 0) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold">{title}</h1>
            <p className="text-muted-foreground">{description}</p>
          </div>
          <Button variant="outline" asChild>
            <Link href={`/tournaments/${tournamentId}/ta`}>
              {tElim('backToQualification')}
            </Link>
          </Button>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>{tElim('noPlayersTitle')}</CardTitle>
            <CardDescription>
              {tElim('noPlayersDesc')}
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
          <h1 className="text-2xl sm:text-3xl font-bold">{title}</h1>
          <p className="text-muted-foreground text-sm sm:text-base">
            {isComplete
              ? tElim('phaseComplete')
              : tElim('playersRemaining', { count: activeEntries.length, target: targetSurvivors })}
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link href={`/tournaments/${tournamentId}/ta`}>
            {tElim('backToQualification')}
          </Link>
        </Button>
      </div>

      {/* Phase Complete Banner */}
      {isComplete && (
        <Card className="border-green-500 bg-green-500/10">
          <CardContent className="py-6 text-center">
            <div className="text-4xl mb-2">&#10003;</div>
            <h2 className="text-2xl font-bold">
              {tElim('survivors', { count: activeEntries.length })}
            </h2>
            <div className="mt-2 space-y-1">
              {activeEntries.map((e) => (
                <p key={e.id} className="font-medium">
                  {e.player.nickname}
                </p>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tabbed Content */}
      <Tabs defaultValue={currentRound ? "current" : "standings"} className="space-y-4">
        <TabsList>
          {currentRound && <TabsTrigger value="current">{tElim('currentRound')}</TabsTrigger>}
          <TabsTrigger value="standings">{tElim('standings')}</TabsTrigger>
          <TabsTrigger value="history">{tElim('roundHistory')}</TabsTrigger>
          {!isComplete && !currentRound && (
            <TabsTrigger value="control">{tElim('roundControl')}</TabsTrigger>
          )}
        </TabsList>

        {/* Current Round Tab: time entry for the active round */}
        {currentRound && (
          <TabsContent value="current">
            <Card>
              <CardHeader>
                <CardTitle>
                  {tElim('roundTitle', { number: currentRound.roundNumber, course: COURSE_INFO.find((c) => c.abbr === currentRound.course)?.name || currentRound.course })}
                </CardTitle>
                <CardDescription>
                  {tElim('enterTimesDesc')}
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
                      className="flex items-center gap-3"
                    >
                      <div className="flex-1 min-w-0">
                        <Label className="truncate block">
                          {entry.player.nickname}
                        </Label>
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
                      {/* Retry penalty button: sets time to 9:59.990 */}
                      <Button
                        variant={
                          retryFlags[entry.playerId] ? "destructive" : "outline"
                        }
                        size="sm"
                        onClick={() => handleRetryToggle(entry.playerId)}
                        title={tElim('retryPenalty')}
                      >
                        {tElim('retry')}
                      </Button>
                    </div>
                  ))}
                </div>
                <div className="mt-6 flex justify-end gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setShowCancelConfirm(true)}
                    disabled={submitting || cancellingRound}
                  >
                    {tElim('cancelRound')}
                  </Button>
                  <Button onClick={handleSubmitResults} disabled={submitting}>
                    {submitting
                      ? tElim('submitting')
                      : tElim('submitAndEliminate')}
                  </Button>
                </div>

                {/* Cancel confirmation dialog to prevent accidental round deletion */}
                <Dialog open={showCancelConfirm} onOpenChange={setShowCancelConfirm}>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>{tElim('cancelRoundTitle')}</DialogTitle>
                      <DialogDescription>
                        {tElim('cancelRoundDesc', { course: currentRound?.course || '' })}
                      </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                      <Button
                        variant="outline"
                        onClick={() => setShowCancelConfirm(false)}
                        disabled={cancellingRound}
                      >
                        {tElim('keepRound')}
                      </Button>
                      <Button
                        variant="destructive"
                        onClick={handleCancelRound}
                        disabled={cancellingRound}
                      >
                        {cancellingRound ? tElim('cancelling') : tElim('yesCancelRound')}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {/* Standings Tab */}
        <TabsContent value="standings">
          <Card>
            <CardHeader>
              <CardTitle>{tElim('standings')}</CardTitle>
              <CardDescription>
                {tElim('activeEliminated', { active: activeEntries.length, eliminated: eliminatedEntries.length })}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-16">#</TableHead>
                    <TableHead>{tCommon('player')}</TableHead>
                    <TableHead className="text-center">Status</TableHead>
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
                            {tElim('eliminated')}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        {entry.eliminated ? (
                          <span className="text-gray-400">{tElim('out')}</span>
                        ) : (
                          <Badge className="bg-blue-500">{tElim('active')}</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Round History Tab */}
        <TabsContent value="history">
          <Card>
            <CardHeader>
              <CardTitle>{tElim('roundHistory')}</CardTitle>
              <CardDescription>
                {tElim('roundsCompleted', { count: rounds.filter((r) => (r.results as unknown[]).length > 0).length })}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {rounds.length === 0 ? (
                <p className="text-muted-foreground text-center py-4">
                  {tElim('noRoundsYet')}
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
                      // Sort results by time ascending for display
                      const sortedResults = [...round.results].sort(
                        (a, b) => a.timeMs - b.timeMs
                      );
                      return (
                        <div
                          key={round.id}
                          className="border rounded-lg p-4 space-y-2"
                        >
                          <div className="flex justify-between items-center">
                            <h4 className="font-semibold">
                              {tElim('roundTitle', { number: round.roundNumber, course: courseInfo?.name || round.course })}
                            </h4>
                            <Badge variant="outline" className="font-mono text-xs">
                              {round.course}
                            </Badge>
                          </div>
                          <div className="space-y-1">
                            {sortedResults.map((result, idx) => {
                              const isEliminated =
                                round.eliminatedIds?.includes(result.playerId);
                              return (
                                <div
                                  key={result.playerId}
                                  className={`flex justify-between text-sm ${isEliminated ? "text-red-500 font-semibold" : ""}`}
                                >
                                  <span>
                                    {idx + 1}. {playerNames[result.playerId] || result.playerId}
                                    {result.isRetry && (
                                      <Badge
                                        variant="outline"
                                        className="ml-1 text-xs"
                                      >
                                        {tElim('retry')}
                                      </Badge>
                                    )}
                                    {isEliminated && ` (${tElim('eliminated')})`}
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
          </Card>
        </TabsContent>

        {/* Round Control Tab */}
        {!isComplete && !currentRound && (
          <TabsContent value="control">
            <Card>
              <CardHeader>
                <CardTitle>Round Control</CardTitle>
                <CardDescription>
                  Start a new round with a randomly selected course
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
                      <span>Active Players:</span>
                      <span className="font-bold">{activeEntries.length}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Eliminated Players:</span>
                      <span className="font-bold">
                        {eliminatedEntries.length}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Target Survivors:</span>
                      <span className="font-bold text-blue-500">
                        {targetSurvivors}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Rounds Completed:</span>
                      <span className="font-bold">{rounds.filter((r) => (r.results as unknown[]).length > 0).length}</span>
                    </div>
                  </div>
                  <Button
                    className="w-full"
                    size="lg"
                    onClick={handleStartRound}
                    disabled={startingRound || hasOpenRound}
                  >
                    {startingRound
                      ? "Selecting Course..."
                      : hasOpenRound
                        ? "Complete Open Round First"
                        : `Start Round ${rounds.length + 1}`}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
