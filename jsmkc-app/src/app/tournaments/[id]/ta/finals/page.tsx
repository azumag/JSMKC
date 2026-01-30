"use client";

/**
 * Time Attack Finals Page
 *
 * Admin page for managing the TA finals - the climactic elimination tournament.
 * Unlike revival rounds (sudden death), finals use a life-based system:
 *
 * Format:
 * - Up to 16 players (top 12 from qualification + 4 from revival round 2)
 * - Each player starts with 3 lives
 * - Each course: bottom half (slowest times) loses 1 life
 * - Players reaching 0 lives are eliminated
 * - Lives are reset to 3 at thresholds: 8, 4, and 2 players remaining
 * - Last player standing is the champion
 *
 * Features:
 * - Standings with lives display (heart icons)
 * - Course time entry with automatic life deduction for bottom half
 * - Manual elimination for admin corrections
 * - Life reset button (available at 2/4/8 player thresholds)
 * - Finals reset for re-running the finals
 * - Auto-refresh every 3 seconds for live tournament tracking
 * - Champion banner when last player standing is determined
 */

import { useState, useEffect, useCallback, use } from "react";
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { COURSE_INFO } from "@/lib/constants";
import { CardSkeleton } from "@/components/ui/loading-skeleton";

/** Player data structure */
interface Player {
  id: string;
  name: string;
  nickname: string;
}

/** Time Trial entry data structure */
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
 * Convert time string to milliseconds for comparison.
 * Used to determine bottom half for life deduction.
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
 * Shows elimination status for eliminated players.
 * Hearts turn red when only 1 life remains (danger state).
 */
function renderLives(lives: number, eliminated: boolean) {
  if (eliminated) {
    return <span className="text-gray-400">Eliminated</span>;
  }
  const hearts = [];
  for (let i = 0; i < lives; i++) {
    hearts.push(<span key={i} className={lives === 1 ? "text-red-500" : "text-red-400"}>&#10084;&#65039;</span>);
  }
  return <span>{hearts}</span>;
}

export default function TimeAttackFinals({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: tournamentId } = use(params);

  // === State Management ===
  const [entries, setEntries] = useState<TTEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Course dialog states
  const [isCourseDialogOpen, setIsCourseDialogOpen] = useState(false);
  const [selectedCourse, setSelectedCourse] = useState<string | null>(null);
  const [courseTimes, setCourseTimes] = useState<Record<string, string>>({});
  const [eliminating, setEliminating] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Admin action states
  const [isResetDialogOpen, setIsResetDialogOpen] = useState(false);
  const [isEliminateDialogOpen, setIsEliminateDialogOpen] = useState(false);
  const [entryToEliminate, setEntryToEliminate] = useState<TTEntry | null>(null);

  // === Data Fetching ===
  const fetchData = useCallback(async () => {
    setError(null);
    try {
      const response = await fetch(`/api/tournaments/${tournamentId}/ta?stage=finals`);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Failed to fetch finals data: ${response.status}`);
      }
      const data = await response.json();
      setEntries(data.entries || []);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to fetch data";
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

  // Auto-refresh every 3 seconds for live tournament tracking
  useEffect(() => {
    const interval = setInterval(() => {
      fetchData();
    }, 3000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // === Event Handlers ===

  /** Open course time entry dialog */
  const handleCourseStart = (course: string) => {
    const activeEntries = entries.filter((e) => !e.eliminated);
    const initialTimes: Record<string, string> = {};
    activeEntries.forEach((entry) => {
      initialTimes[entry.id] = entry.times?.[course] || "";
    });
    setCourseTimes(initialTimes);
    setSelectedCourse(course);
    setIsCourseDialogOpen(true);
    setSaveError(null);
  };

  /** Handle time input change */
  const handleTimeChange = (entryId: string, value: string) => {
    setCourseTimes((prev) => ({ ...prev, [entryId]: value }));
  };

  /**
   * Save course times and deduct life from the slowest player.
   * In finals, the slowest player loses a life (rather than immediate elimination).
   * Elimination happens when a player's lives reach 0.
   */
  const handleSaveCourseTimes = async () => {
    setEliminating(true);
    setSaveError(null);

    try {
      const activeEntries = entries.filter((e) => !e.eliminated);
      const timesToSave: Record<string, string> = {};
      const entryTimes: Array<{ entryId: string; timeMs: number | null }> = [];

      activeEntries.forEach((entry) => {
        const timeStr = courseTimes[entry.id] || "";
        const timeMs = timeToMs(timeStr);
        if (timeMs !== null) {
          timesToSave[entry.id] = timeStr;
          entryTimes.push({ entryId: entry.id, timeMs });
        }
      });

      if (entryTimes.length < 2) {
        setSaveError("Need at least 2 valid times to compare");
        setEliminating(false);
        return;
      }

      // Sort by time to find bottom half for life deduction
      entryTimes.sort((a, b) => (a.timeMs ?? Infinity) - (b.timeMs ?? Infinity));

      const slowestTime = entryTimes[entryTimes.length - 1].timeMs ?? Infinity;
      const slowestEntries = entryTimes.filter((et) => et.timeMs === slowestTime);

      // Update all entries: save times and deduct life from slowest
      const updatePromises = activeEntries.map(async (entry) => {
        const currentTimes = (entry.times as Record<string, string>) || {};
        const updatedTimes = { ...currentTimes, [selectedCourse as string]: timesToSave[entry.id] || "" };
        const shouldEliminate = slowestEntries.some((se) => se.entryId === entry.id);

        const response = await fetch(`/api/tournaments/${tournamentId}/ta`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            entryId: entry.id,
            times: updatedTimes,
            livesDelta: shouldEliminate ? -1 : undefined,
            action: shouldEliminate ? "update_lives" : "update_times",
          }),
        });
        return response.json();
      });

      await Promise.all(updatePromises);

      setIsCourseDialogOpen(false);
      setSelectedCourse(null);
      setCourseTimes({});
      fetchData();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to save times";
      console.error("Failed to save times:", err);
      setSaveError(errorMessage);
    } finally {
      setEliminating(false);
    }
  };

  /** Reset all active players' elimination status (for re-running finals) */
  const handleResetFinals = async () => {
    try {
      const activeEntries = entries.filter((e) => !e.eliminated);
      const updatePromises = activeEntries.map((entry) =>
        fetch(`/api/tournaments/${tournamentId}/ta`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            entryId: entry.id,
            eliminated: false,
            action: "eliminate",
          }),
        })
      );

      await Promise.all(updatePromises);
      setIsResetDialogOpen(false);
      fetchData();
    } catch (err) {
      console.error("Failed to reset finals:", err);
      alert("Failed to reset finals");
    }
  };

  /**
   * Reset all active players' lives to 3.
   * Per SMK rules, lives reset at thresholds: 8, 4, and 2 players remaining.
   */
  const handleResetLives = async () => {
    try {
      const response = await fetch(`/api/tournaments/${tournamentId}/ta`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "reset_lives",
        }),
      });

      if (response.ok) {
        fetchData();
      } else {
        const error = await response.json();
        alert(error.error || "Failed to reset lives");
      }
    } catch (err) {
      console.error("Failed to reset lives:", err);
      alert("Failed to reset lives");
    }
  };

  /** Manually eliminate a specific player (admin override) */
  const handleEliminatePlayer = async () => {
    if (!entryToEliminate) return;

    try {
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

  /** Get course completion status */
  const getCourseProgress = (): Array<{ course: string; completed: boolean }> => {
    const firstEntry = entries.find((e) => e.times);
    if (!firstEntry) return COURSE_INFO.map((c) => ({ course: c.abbr, completed: false }));
    return COURSE_INFO.map((c) => ({
      course: c.abbr,
      completed: entries.every((e) => !e.eliminated && e.times?.[c.abbr]),
    }));
  };

  // === Derived State ===
  const activeEntries = entries.filter((e) => !e.eliminated);
  const eliminatedEntries = entries.filter((e) => e.eliminated);
  const isComplete = activeEntries.length <= 1 && entries.length > 0;

  // Life reset is available at SMK threshold player counts (2, 4, 8)
  const canResetLives = [2, 4, 8].includes(activeEntries.length);

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
          <h1 className="text-3xl font-bold">Time Attack Finals</h1>
          <Button variant="outline" asChild>
            <Link href={`/tournaments/${tournamentId}/ta`}>Back to Qualification</Link>
          </Button>
        </div>
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-destructive mb-4">{error}</p>
            <Button onClick={fetchData}>Retry</Button>
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
            <h1 className="text-3xl font-bold">Time Attack Finals</h1>
            <p className="text-muted-foreground">Elimination tournament</p>
          </div>
          <Button variant="outline" asChild>
            <Link href={`/tournaments/${tournamentId}/ta`}>Back to Qualification</Link>
          </Button>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>No Finals Yet</CardTitle>
            <CardDescription>
              Complete the qualification round and promote players to finals.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  // === Main Render ===
  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header with admin action buttons */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">Time Attack Finals</h1>
          <p className="text-muted-foreground text-sm sm:text-base">
            {isComplete ? "Tournament Complete" : `${activeEntries.length} players remaining`}
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          {/* Life reset button: only shown at SMK threshold counts */}
          {canResetLives && (
            <Button variant="default" onClick={handleResetLives} disabled={isComplete}>
              Reset Lives (All to 3)
            </Button>
          )}
          {/* Finals reset confirmation dialog */}
          <AlertDialog open={isResetDialogOpen} onOpenChange={setIsResetDialogOpen}>
            <AlertDialogTrigger asChild>
              <Button variant="outline">Reset Finals</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Reset Finals?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will reset all eliminations and lives for all players in finals.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleResetFinals}>Reset</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <Button variant="outline" asChild>
            <Link href={`/tournaments/${tournamentId}/ta`}>Back to Qualification</Link>
          </Button>
        </div>
      </div>

      {/* Champion Banner: shown when last player standing */}
      {isComplete && activeEntries.length === 1 && (
        <Card className="border-yellow-500 bg-yellow-500/10">
          <CardContent className="py-6 text-center">
            <div className="text-4xl mb-2">&#127942;</div>
            <h2 className="text-2xl font-bold">Champion</h2>
            <p className="text-3xl font-bold text-yellow-500 mt-2">
              {activeEntries[0].player.nickname}
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              Lives remaining: {activeEntries[0].lives}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Tabbed Content */}
      <Tabs defaultValue="standings" className="space-y-4">
        <TabsList>
          <TabsTrigger value="standings">Standings</TabsTrigger>
          <TabsTrigger value="courses">Course Progress</TabsTrigger>
          {!isComplete && <TabsTrigger value="control">Tournament Control</TabsTrigger>}
        </TabsList>

        {/* Standings Tab: includes Lives column and Eliminate action */}
        <TabsContent value="standings">
          <Card>
            <CardHeader>
              <CardTitle>Finals Standings</CardTitle>
              <CardDescription>
                {activeEntries.length} active, {eliminatedEntries.length} eliminated
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-16">Rank</TableHead>
                    <TableHead>Player</TableHead>
                    <TableHead className="text-center">Lives</TableHead>
                    <TableHead className="text-right">Total Time</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries.map((entry) => (
                    <TableRow key={entry.id} className={entry.eliminated ? "opacity-50" : ""}>
                      <TableCell className="font-bold">{entry.rank || "-"}</TableCell>
                      <TableCell className="font-medium">
                        {entry.player.nickname}
                        {entry.eliminated && (
                          <Badge variant="destructive" className="ml-2 text-xs">
                            Eliminated
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-center">{renderLives(entry.lives, entry.eliminated)}</TableCell>
                      <TableCell className="text-right font-mono">
                        {msToDisplayTime(entry.totalTime)}
                      </TableCell>
                      <TableCell className="text-right">
                        {/* Manual eliminate button for admin corrections */}
                        {!entry.eliminated && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setEntryToEliminate(entry);
                              setIsEliminateDialogOpen(true);
                            }}
                          >
                            Eliminate
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Course Progress Tab */}
        <TabsContent value="courses">
          <Card>
            <CardHeader>
              <CardTitle>Course Progress</CardTitle>
              <CardDescription>Track completion and eliminations per course</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {getCourseProgress().map((progress) => {
                  const courseInfo = COURSE_INFO.find((c) => c.abbr === progress.course);
                  return (
                    <div
                      key={progress.course}
                      className="flex items-center justify-between p-3 border rounded-lg"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-12 font-mono text-sm">{progress.course}</div>
                        <div className="flex-1">
                          <div className="font-medium">{courseInfo?.name}</div>
                          <div className="text-sm text-muted-foreground">{courseInfo?.cup}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {progress.completed ? (
                          <Badge className="bg-green-500">Complete</Badge>
                        ) : !isComplete ? (
                          <Button size="sm" onClick={() => handleCourseStart(progress.course)}>
                            Start
                          </Button>
                        ) : (
                          <Badge variant="outline">Skipped</Badge>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tournament Control Tab */}
        {!isComplete && (
          <TabsContent value="control">
            <Card>
              <CardHeader>
                <CardTitle>Tournament Control</CardTitle>
                <CardDescription>
                  Start courses and manage the elimination tournament
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <h3 className="font-semibold mb-2">Next Course</h3>
                    <div className="flex gap-2 flex-wrap">
                      {getCourseProgress()
                        .filter((p) => !p.completed)
                        .map((progress) => {
                          const courseInfo = COURSE_INFO.find((c) => c.abbr === progress.course);
                          return (
                            <Button
                              key={progress.course}
                              variant="outline"
                              onClick={() => handleCourseStart(progress.course)}
                            >
                              {progress.course} - {courseInfo?.name}
                            </Button>
                          );
                        })}
                    </div>
                  </div>
                  <div>
                    <h3 className="font-semibold mb-2">Tournament Status</h3>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span>Active Players:</span>
                        <span className="font-bold">{activeEntries.length}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Eliminated Players:</span>
                        <span className="font-bold">{eliminatedEntries.length}</span>
                      </div>
                      {/* Life reset availability indicator */}
                      {canResetLives && (
                        <div className="flex justify-between items-center bg-yellow-500/10 p-2 rounded border border-yellow-500">
                          <span className="text-yellow-700 font-semibold">Life Reset Available!</span>
                          <span className="text-xs text-muted-foreground">
                            {activeEntries.length === 2 ? "(Final 2 players)" :
                             activeEntries.length === 4 ? "(Top 4 players)" :
                             "(Top 8 players)"}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>

      {/* Course Time Entry Dialog */}
      <Dialog open={isCourseDialogOpen} onOpenChange={setIsCourseDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {selectedCourse && COURSE_INFO.find((c) => c.abbr === selectedCourse)?.name} - Time Entry
            </DialogTitle>
            <DialogDescription>
              Enter times for all remaining players. Slowest player(s) will lose a life.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            {saveError && (
              <div className="mb-4 p-3 bg-destructive/10 border border-destructive rounded-md">
                <p className="text-destructive text-sm">{saveError}</p>
              </div>
            )}
            <div className="space-y-3">
              {entries.filter((e) => !e.eliminated).map((entry) => (
                <div key={entry.id} className="flex items-center gap-4">
                  <div className="flex-1">
                    <Label>{entry.player.nickname}</Label>
                    <div className="text-xs text-muted-foreground">
                      Lives: {entry.lives}
                    </div>
                  </div>
                  <Input
                    type="text"
                    placeholder="M:SS.mmm"
                    value={courseTimes[entry.id] || ""}
                    onChange={(e) => handleTimeChange(entry.id, e.target.value)}
                    className="font-mono w-32"
                  />
                </div>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsCourseDialogOpen(false)}
              disabled={eliminating}
            >
              Cancel
            </Button>
            <Button onClick={handleSaveCourseTimes} disabled={eliminating}>
              {eliminating ? "Saving & Eliminating..." : "Save & Eliminate Slowest"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Manual Elimination Confirmation Dialog */}
      <AlertDialog open={isEliminateDialogOpen} onOpenChange={setIsEliminateDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminate Player?</AlertDialogTitle>
            <AlertDialogDescription>
              This will mark {entryToEliminate?.player.nickname} as eliminated. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleEliminatePlayer}>Eliminate</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
