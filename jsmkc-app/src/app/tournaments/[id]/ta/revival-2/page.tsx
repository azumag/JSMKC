"use client";

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
  DialogTrigger,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { COURSE_INFO } from "@/lib/constants";

interface Player {
  id: string;
  name: string;
  nickname: string;
}

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

function msToDisplayTime(ms: number | null): string {
  if (ms === null) return "-";
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  const milliseconds = ms % 1000;
  return `${minutes}:${seconds.toString().padStart(2, "0")}.${milliseconds.toString().padStart(3, "0")}`;
}

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

export default function RevivalRound2({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: tournamentId } = use(params);
  const [entries, setEntries] = useState<TTEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCourseDialogOpen, setIsCourseDialogOpen] = useState(false);
  const [selectedCourse, setSelectedCourse] = useState<string | null>(null);
  const [courseTimes, setCourseTimes] = useState<Record<string, string>>({});
  const [eliminating, setEliminating] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setError(null);
    try {
      const response = await fetch(`/api/tournaments/${tournamentId}/ta?stage=revival_2`);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Failed to fetch revival round 2 data: ${response.status}`);
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

  const handleCourseStart = (course: string) => {
    const activeEntries = entries.filter((e) => !e.eliminated);
    const initialTimes: Record<string, string> = {};
    activeEntries.forEach((entry) => {
      initialTimes[entry.id] = entry.times?.[course] || "";
    });
    setCourseTimes(initialTimes);
    setSelectedCourse(course);
    setIsCourseDialogOpen(true);
  };

  const handleTimeChange = (entryId: string, value: string) => {
    setCourseTimes((prev) => ({ ...prev, [entryId]: value }));
  };

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

      entryTimes.sort((a, b) => (a.timeMs ?? Infinity) - (b.timeMs ?? Infinity));

      const slowestTime = entryTimes[entryTimes.length - 1].timeMs ?? Infinity;
      const slowestEntries = entryTimes.filter((et) => et.timeMs === slowestTime);

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

  const getCourseProgress = (): Array<{ course: string; completed: boolean }> => {
    const firstEntry = entries.find((e) => e.times);
    if (!firstEntry) return COURSE_INFO.map((c) => ({ course: c.abbr, completed: false }));
    return COURSE_INFO.map((c) => ({
      course: c.abbr,
      completed: entries.every((e) => !e.eliminated && e.times?.[c.abbr]),
    }));
  };

  const activeEntries = entries.filter((e) => !e.eliminated);
  const eliminatedEntries = entries.filter((e) => e.eliminated);
  const isComplete = activeEntries.length <= 1 && entries.length > 0;

  if (loading) {
    return <div className="text-center py-8">Loading...</div>;
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold">Loser's Revival Round 2</h1>
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

  if (entries.length === 0) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold">Loser's Revival Round 2</h1>
            <p className="text-muted-foreground">Sudden death - players 13-16 + round 1 survivors</p>
          </div>
          <Button variant="outline" asChild>
            <Link href={`/tournaments/${tournamentId}/ta`}>Back to Qualification</Link>
          </Button>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>No Players</CardTitle>
            <CardDescription>
              Complete qualification round and revival round 1, then promote players to revival round 2.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">Loser's Revival Round 2</h1>
          <p className="text-muted-foreground text-sm sm:text-base">
            {isComplete ? "Round Complete" : `${activeEntries.length} players remaining`}
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link href={`/tournaments/${tournamentId}/ta`}>Back to Qualification</Link>
        </Button>
      </div>

      {isComplete && activeEntries.length === 1 && (
        <Card className="border-green-500 bg-green-500/10">
          <CardContent className="py-6 text-center">
            <div className="text-4xl mb-2">✓</div>
            <h2 className="text-2xl font-bold">Finals Qualifiers (4)</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Advancing to finals
            </p>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="standings" className="space-y-4">
        <TabsList>
          <TabsTrigger value="standings">Standings</TabsTrigger>
          <TabsTrigger value="courses">Course Progress</TabsTrigger>
          {!isComplete && <TabsTrigger value="control">Round Control</TabsTrigger>}
        </TabsList>

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
                    <TableHead>Source</TableHead>
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
                          <span className="text-gray-400">💀 Out</span>
                        ) : (
                          <Badge className="bg-blue-500">Active</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {msToDisplayTime(entry.totalTime)}
                      </TableCell>
                      <TableCell className="text-xs">
                        {entry.stage === "revival_1" ? "Revival 1" : "Qualification (13-16)"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

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
