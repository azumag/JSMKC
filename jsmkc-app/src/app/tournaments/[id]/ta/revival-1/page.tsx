"use client";

/**
 * Loser's Revival Round 1 Page
 *
 * Admin page for managing the first revival round in Time Attack.
 * This round features players ranked 17-24 from qualification in a
 * sudden death elimination format.
 *
 * Format:
 * - 8 players start (qualification ranks 17-24)
 * - One course at a time: all players race, slowest is eliminated
 * - Continues until 4 players remain (the survivors)
 * - Survivors advance to Revival Round 2
 *
 * Features:
 * - Standings view with active/eliminated status
 * - Course progress tracking
 * - Course time entry dialog with automatic elimination of slowest player
 * - Round control panel showing status and available courses
 *
 * The page uses manual data fetching (not polling) since admin
 * actively controls when courses are run.
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
 * Convert time string to milliseconds for comparison during elimination.
 * Used to determine the slowest player in a course round.
 */
function timeToMs(time: string): number | null {
  if (!time || time === "") return null;
  const match = time.match(/^(\d{1,2}):(\d{2})\.(\d{1,3})$/);
  if (!match) return null;
  const minutes = parseInt(match[1], 10);
  const seconds = parseInt(match[2], 10);
  let ms = match[3];
  // Pad milliseconds to 3 digits for accurate comparison
  while (ms.length < 3) ms += "0";
  const milliseconds = parseInt(ms, 10);
  return minutes * 60 * 1000 + seconds * 1000 + milliseconds;
}

export default function RevivalRound1({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: tournamentId } = use(params);

  // === State Management ===
  const [entries, setEntries] = useState<TTEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCourseDialogOpen, setIsCourseDialogOpen] = useState(false);
  const [selectedCourse, setSelectedCourse] = useState<string | null>(null);
  const [courseTimes, setCourseTimes] = useState<Record<string, string>>({});
  const [eliminating, setEliminating] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // === Data Fetching ===
  const fetchData = useCallback(async () => {
    setError(null);
    try {
      // Fetch revival_1 stage entries
      const response = await fetch(`/api/tournaments/${tournamentId}/ta?stage=revival_1`);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Failed to fetch revival round 1 data: ${response.status}`);
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

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // === Event Handlers ===

  /** Open course time entry dialog with pre-filled data for active players */
  const handleCourseStart = (course: string) => {
    const activeEntries = entries.filter((e) => !e.eliminated);
    const initialTimes: Record<string, string> = {};
    // Pre-fill with existing times if available
    activeEntries.forEach((entry) => {
      initialTimes[entry.id] = entry.times?.[course] || "";
    });
    setCourseTimes(initialTimes);
    setSelectedCourse(course);
    setIsCourseDialogOpen(true);
  };

  /** Handle time input change for a specific entry */
  const handleTimeChange = (entryId: string, value: string) => {
    setCourseTimes((prev) => ({ ...prev, [entryId]: value }));
  };

  /**
   * Save course times and eliminate the slowest player.
   *
   * Process:
   * 1. Parse all entered times and find the slowest
   * 2. Update each player's times via the API
   * 3. For the slowest player, also trigger life deduction (elimination)
   * 4. Refresh data to show updated standings
   */
  const handleSaveCourseTimes = async () => {
    setEliminating(true);
    setSaveError(null);

    try {
      const activeEntries = entries.filter((e) => !e.eliminated);
      const timesToSave: Record<string, string> = {};
      const entryTimes: Array<{ entryId: string; timeMs: number | null }> = [];

      // Parse all entered times
      activeEntries.forEach((entry) => {
        const timeStr = courseTimes[entry.id] || "";
        const timeMs = timeToMs(timeStr);
        if (timeMs !== null) {
          timesToSave[entry.id] = timeStr;
          entryTimes.push({ entryId: entry.id, timeMs });
        }
      });

      // Need at least 2 valid times to determine who is slowest
      if (entryTimes.length < 2) {
        setSaveError("Need at least 2 valid times to compare");
        setEliminating(false);
        return;
      }

      // Sort by time ascending to find the slowest (last in sorted order)
      entryTimes.sort((a, b) => (a.timeMs ?? Infinity) - (b.timeMs ?? Infinity));

      // Identify slowest player(s) for elimination (handles ties)
      const slowestTime = entryTimes[entryTimes.length - 1].timeMs ?? Infinity;
      const slowestEntries = entryTimes.filter((et) => et.timeMs === slowestTime);

      // Update all active entries: save times and eliminate slowest
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

      // Close dialog and refresh data
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

  /**
   * Get completion status for each course.
   * A course is "completed" if all active (non-eliminated) players have a time for it.
   */
  const getCourseProgress = (): Array<{ course: string; completed: boolean }> => {
    const firstEntry = entries.find((e) => e.times);
    if (!firstEntry) return COURSE_INFO.map((c) => ({ course: c.abbr, completed: false }));
    return COURSE_INFO.map((c) => ({
      course: c.abbr,
      completed: entries.filter((e) => !e.eliminated).every((e) => e.times?.[c.abbr]),
    }));
  };

  // === Derived State ===
  const activeEntries = entries.filter((e) => !e.eliminated);
  const eliminatedEntries = entries.filter((e) => e.eliminated);
  // Round is complete when only survivors remain (or fewer)
  const isComplete = activeEntries.length <= 4 && entries.length > 0;

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
          <h1 className="text-3xl font-bold">Loser&apos;s Revival Round 1</h1>
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

  // === Empty State (no entries promoted yet) ===
  if (entries.length === 0) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold">Loser&apos;s Revival Round 1</h1>
            <p className="text-muted-foreground">Sudden death - players 17-24</p>
          </div>
          <Button variant="outline" asChild>
            <Link href={`/tournaments/${tournamentId}/ta`}>Back to Qualification</Link>
          </Button>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>No Players</CardTitle>
            <CardDescription>
              Complete qualification round and promote players 17-24 to revival round 1.
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
          <h1 className="text-2xl sm:text-3xl font-bold">Loser&apos;s Revival Round 1</h1>
          <p className="text-muted-foreground text-sm sm:text-base">
            {isComplete ? "Round Complete" : `${activeEntries.length} players remaining`}
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link href={`/tournaments/${tournamentId}/ta`}>Back to Qualification</Link>
        </Button>
      </div>

      {/* Round Complete Banner */}
      {isComplete && activeEntries.length === 1 && (
        <Card className="border-green-500 bg-green-500/10">
          <CardContent className="py-6 text-center">
            <div className="text-4xl mb-2">✓</div>
            <h2 className="text-2xl font-bold">Survivors (4)</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Advancing to revival round 2
            </p>
          </CardContent>
        </Card>
      )}

      {/* Tabbed Content */}
      <Tabs defaultValue="standings" className="space-y-4">
        <TabsList>
          <TabsTrigger value="standings">Standings</TabsTrigger>
          <TabsTrigger value="courses">Course Progress</TabsTrigger>
          {!isComplete && <TabsTrigger value="control">Round Control</TabsTrigger>}
        </TabsList>

        {/* Standings Tab */}
        <TabsContent value="standings">
          <Card>
            <CardHeader>
              <CardTitle>Standings</CardTitle>
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
                    <TableHead className="text-center">Status</TableHead>
                    <TableHead className="text-right">Total Time</TableHead>
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
                      <TableCell className="text-center">
                        {entry.eliminated ? (
                          <span className="text-gray-400">Out</span>
                        ) : (
                          <Badge className="bg-blue-500">Active</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {msToDisplayTime(entry.totalTime)}
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
              <CardDescription>Track completion per course</CardDescription>
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

        {/* Round Control Tab (only shown while round is active) */}
        {!isComplete && (
          <TabsContent value="control">
            <Card>
              <CardHeader>
                <CardTitle>Round Control</CardTitle>
                <CardDescription>
                  Start courses and manage elimination tournament
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
                    <h3 className="font-semibold mb-2">Round Status</h3>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span>Active Players:</span>
                        <span className="font-bold">{activeEntries.length}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Eliminated Players:</span>
                        <span className="font-bold">{eliminatedEntries.length}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Target Survivors:</span>
                        <span className="font-bold text-blue-500">4</span>
                      </div>
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
              Enter times for all remaining players. Slowest player(s) will be eliminated.
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
    </div>
  );
}
