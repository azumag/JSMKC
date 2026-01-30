"use client";

/**
 * Time Attack Qualification Page
 *
 * Main admin page for managing the TA (Time Attack) qualification round.
 * This page provides:
 *
 * 1. Player Management:
 *    - Add players to the qualification round from the registered players list
 *    - Remove players from the qualification round
 *
 * 2. Time Entry:
 *    - Enter/edit individual course times for each player (20 courses)
 *    - Times are entered in M:SS.mmm format (e.g., 1:23.456)
 *    - Total times and rankings are automatically calculated on save
 *
 * 3. Standings View:
 *    - Live standings sorted by rank with progress indicators
 *    - Shows completion status (N/20 courses entered)
 *
 * 4. Promotion:
 *    - Promote top N players or manually selected players to finals
 *    - Supports both automatic (top N by rank) and manual selection modes
 *
 * 5. Export:
 *    - Download qualification data as Excel/CSV file
 *
 * Data is refreshed every 3 seconds via polling for real-time updates
 * during live tournament operation.
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
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { COURSE_INFO, TOTAL_COURSES } from "@/lib/constants";
import { usePolling } from "@/lib/hooks/usePolling";
import { CardSkeleton } from "@/components/ui/loading-skeleton";

/** Player data structure from the API */
interface Player {
  id: string;
  name: string;
  nickname: string;
}

/** Time Trial entry data structure from the API */
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
 * Convert milliseconds to human-readable display format (M:SS.mmm).
 * Returns "-" for null values (no time recorded).
 */
function msToDisplayTime(ms: number | null): string {
  if (ms === null) return "-";
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  const milliseconds = ms % 1000;
  return `${minutes}:${seconds.toString().padStart(2, "0")}.${milliseconds.toString().padStart(3, "0")}`;
}

export default function TimeAttackPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: tournamentId } = use(params);

  // === State Management ===
  const [entries, setEntries] = useState<TTEntry[]>([]);
  const [allPlayers, setAllPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Dialog states
  const [isAddPlayerDialogOpen, setIsAddPlayerDialogOpen] = useState(false);
  const [isTimeEntryDialogOpen, setIsTimeEntryDialogOpen] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<TTEntry | null>(null);
  const [timeInputs, setTimeInputs] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Promotion states
  const [finalsCount, setFinalsCount] = useState(0);
  const [isPromoteDialogOpen, setIsPromoteDialogOpen] = useState(false);
  const [promoting, setPromoting] = useState(false);
  const [topN, setTopN] = useState(8);
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<string[]>([]);
  const [promotionMode, setPromotionMode] = useState<"topN" | "manual">("topN");

  // Export state
  const [exporting, setExporting] = useState(false);

  // === Data Fetching ===
  // Fetch tournament data and player list in parallel
  const fetchTournamentData = useCallback(async () => {
    const [taResponse, playersResponse] = await Promise.all([
      fetch(`/api/tournaments/${tournamentId}/ta?stage=qualification`),
      fetch("/api/players"),
    ]);

    if (!taResponse.ok) {
      const errorData = await taResponse.json().catch(() => ({}));
      throw new Error(errorData.error || `Failed to fetch TA data: ${taResponse.status}`);
    }

    if (!playersResponse.ok) {
      const errorData = await playersResponse.json().catch(() => ({}));
      throw new Error(errorData.error || `Failed to fetch players: ${playersResponse.status}`);
    }

    const taData = await taResponse.json();
    const players = await playersResponse.json();

    return {
      entries: taData.entries || [],
      allPlayers: players,
      finalsCount: taData.finalsCount || 0,
    };
  }, [tournamentId]);

  // Poll for updates every 3 seconds during live tournament operation
  const { data: pollData, loading: pollLoading, error: pollError, refetch } = usePolling(
    fetchTournamentData, {
    interval: 3000,
  });

  // Sync polling data to component state
  useEffect(() => {
    if (pollData) {
      setEntries(pollData.entries);
      setAllPlayers(pollData.allPlayers);
      setFinalsCount(pollData.finalsCount);
    }
  }, [pollData]);

  useEffect(() => {
    setLoading(pollLoading);
  }, [pollLoading]);

  useEffect(() => {
    if (pollError) {
      setError(pollError);
    }
  }, [pollError]);

  // === Event Handlers ===

  /** Add a player to the qualification round */
  const handleAddPlayer = async (playerId: string) => {
    setSaveError(null);
    try {
      const response = await fetch(`/api/tournaments/${tournamentId}/ta`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to add player");
      }

      setIsAddPlayerDialogOpen(false);
      refetch();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to add player";
      console.error("Failed to add player:", err);
      setSaveError(errorMessage);
    }
  };

  /** Promote players to finals using selected mode (topN or manual) */
  const handlePromoteToFinals = async () => {
    setPromoting(true);

    try {
      const body = {
        action: "promote_to_finals",
        ...((promotionMode === "topN") ? { topN } : { players: selectedPlayerIds }),
      };

      const response = await fetch(`/api/tournaments/${tournamentId}/ta`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to promote players");
      }

      const data = await response.json();
      setIsPromoteDialogOpen(false);
      setSelectedPlayerIds([]);
      refetch();

      // Alert user about skipped players (incomplete times)
      if (data.skipped && data.skipped.length > 0) {
        alert(`Promoted ${data.entries.length} players. Skipped ${data.skipped.join(", ")} (incomplete times)`);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to promote players";
      console.error("Failed to promote players:", err);
      alert(errorMessage);
    } finally {
      setPromoting(false);
    }
  };

  /** Toggle player selection for manual promotion mode */
  const togglePlayerSelection = (playerId: string) => {
    setSelectedPlayerIds((prev) =>
      prev.includes(playerId)
        ? prev.filter((id) => id !== playerId)
        : [...prev, playerId]
    );
  };

  /** Open the time entry dialog for a specific player */
  const openTimeEntryDialog = (entry: TTEntry) => {
    setSelectedEntry(entry);
    setTimeInputs(entry.times || {});
    setSaveError(null);
    setIsTimeEntryDialogOpen(true);
  };

  /** Handle individual course time input change */
  const handleTimeChange = (course: string, value: string) => {
    setTimeInputs((prev) => ({ ...prev, [course]: value }));
  };

  /** Save all entered times for the selected player */
  const handleSaveTimes = async () => {
    if (!selectedEntry) return;

    setSaving(true);
    setSaveError(null);
    try {
      const response = await fetch(`/api/tournaments/${tournamentId}/ta`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entryId: selectedEntry.id,
          times: timeInputs,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to save times");
      }

      setIsTimeEntryDialogOpen(false);
      setSelectedEntry(null);
      setTimeInputs({});
      refetch();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to save times";
      console.error("Failed to save times:", err);
      setSaveError(errorMessage);
    } finally {
      setSaving(false);
    }
  };

  /** Delete an entry from the qualification round (with confirmation) */
  const handleDeleteEntry = async (entryId: string) => {
    if (!confirm("Are you sure you want to remove this player?")) return;

    try {
      const response = await fetch(
        `/api/tournaments/${tournamentId}/ta?entryId=${entryId}`,
        { method: "DELETE" }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to delete entry");
      }

      refetch();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to delete entry";
      console.error("Failed to delete entry:", err);
      setError(errorMessage);
    }
  };

  /** Export qualification data as downloadable Excel/CSV file */
  const handleExport = async () => {
    setExporting(true);
    try {
      const response = await fetch(`/api/tournaments/${tournamentId}/ta/export`);
      if (!response.ok) {
        throw new Error("Failed to export data");
      }

      // Create download link and trigger browser download
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `time-attack-${new Date().toISOString().split("T")[0]}.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to export";
      console.error("Failed to export:", err);
      setError(errorMessage);
    } finally {
      setExporting(false);
    }
  };

  // === Helper Functions ===

  /** Count how many course times have been entered for an entry */
  const getEnteredTimesCount = (entry: TTEntry): number => {
    if (!entry.times) return 0;
    return Object.values(entry.times).filter((t) => t && t !== "").length;
  };

  /** Filter to players not yet added to this tournament's TA qualification */
  const availablePlayers = allPlayers.filter(
    (p) => !entries.find((e) => e.playerId === p.id)
  );

  // === Loading State ===
  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div className="space-y-3">
            <div className="h-9 w-24 bg-muted animate-pulse rounded" />
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
          <h1 className="text-3xl font-bold">Time Attack</h1>
          <Button variant="outline" asChild>
            <Link href={`/tournaments/${tournamentId}`}>Back</Link>
          </Button>
        </div>
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-destructive mb-4">{error}</p>
            <Button onClick={refetch}>Retry</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // === Main Render ===
  return (
    <div className="space-y-6">
      {/* Header with action buttons */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4">
        <div>
          <h1 className="text-3xl font-bold">Time Attack - Qualification</h1>
          <p className="text-muted-foreground text-sm sm:text-base">
            Top 12 advance to finals • Players 13-16 to revival round 2 • Players 17-24 to revival round 1
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" onClick={handleExport} disabled={exporting}>
            {exporting ? "Exporting..." : "Export Excel"}
          </Button>
          <Button
            variant="default"
            onClick={() => setIsPromoteDialogOpen(true)}
            disabled={finalsCount === 0}
          >
            Promote to Finals ({finalsCount})
          </Button>
          {/* Promotion Dialog */}
          <Dialog open={isPromoteDialogOpen} onOpenChange={setIsPromoteDialogOpen}>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Promote Players to Finals</DialogTitle>
                <DialogDescription>
                  Select players to promote to the finals stage
                </DialogDescription>
              </DialogHeader>
              <div className="py-4 space-y-4">
                <div>
                  <Label>Promotion Mode</Label>
                  <Tabs defaultValue="topN" className="mt-2">
                    <TabsList className="w-full">
                      <TabsTrigger
                        value="topN"
                        onClick={() => setPromotionMode("topN")}
                      >
                        Top N Players
                      </TabsTrigger>
                      <TabsTrigger
                        value="manual"
                        onClick={() => setPromotionMode("manual")}
                      >
                        Manual Selection
                      </TabsTrigger>
                    </TabsList>
                    <TabsContent value="topN" className="mt-4">
                      <Label>Number of players to promote</Label>
                      <Input
                        type="number"
                        min="1"
                        max="12"
                        value={topN}
                        onChange={(e) => setTopN(parseInt(e.target.value) || 1)}
                        className="mt-2"
                      />
                    </TabsContent>
                    <TabsContent value="manual" className="mt-4">
                      {entries.length === 0 ? (
                        <p className="text-muted-foreground text-sm">No players added yet</p>
                      ) : (
                        <div className="space-y-2 max-h-60 overflow-y-auto">
                          {entries
                            .sort((a, b) => (a.totalTime ?? Infinity) - (b.totalTime ?? Infinity))
                            .map((entry) => (
                              <div
                                key={entry.id}
                                className="flex items-center justify-between p-2 hover:bg-muted rounded cursor-pointer"
                                onClick={() => togglePlayerSelection(entry.playerId)}
                              >
                                <div className="flex items-center gap-2">
                                  <input
                                    type="checkbox"
                                    checked={selectedPlayerIds.includes(entry.playerId)}
                                    onChange={() => togglePlayerSelection(entry.playerId)}
                                    className="pointer-events-none"
                                  />
                                  <span>{entry.player.nickname}</span>
                                  {entry.totalTime === null && (
                                    <Badge variant="destructive" className="text-xs">
                                      Incomplete
                                    </Badge>
                                  )}
                                </div>
                                <span className="font-mono text-sm">
                                  {msToDisplayTime(entry.totalTime)}
                                </span>
                              </div>
                            ))}
                        </div>
                      )}
                      <p className="text-sm text-muted-foreground">
                        {selectedPlayerIds.length} players selected
                      </p>
                    </TabsContent>
                  </Tabs>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsPromoteDialogOpen(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={handlePromoteToFinals}
                  disabled={
                    promoting ||
                    (promotionMode === "manual" && selectedPlayerIds.length === 0)
                  }
                >
                  {promoting ? "Promoting..." : "Promote to Finals"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          {/* Add Player Dialog */}
          <Dialog
            open={isAddPlayerDialogOpen}
            onOpenChange={(open) => {
              setIsAddPlayerDialogOpen(open);
              if (!open) setSaveError(null);
            }}
          >
            <DialogTrigger asChild>
              <Button variant="outline" className="w-full sm:w-auto">Add Player</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Player to Time Attack</DialogTitle>
                <DialogDescription>
                  Select a player to add to the qualification round.
                </DialogDescription>
              </DialogHeader>
              <div className="py-4">
                <Label>Select Player</Label>
                <Select onValueChange={handleAddPlayer}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose player..." />
                  </SelectTrigger>
                  <SelectContent>
                    {availablePlayers.map((player) => (
                      <SelectItem key={player.id} value={player.id}>
                        {player.nickname} ({player.name})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {saveError && (
                  <p className="text-destructive text-sm mt-2">{saveError}</p>
                )}
              </div>
            </DialogContent>
          </Dialog>
          <Button variant="outline" asChild>
            <Link href={`/tournaments/${tournamentId}`}>Back</Link>
          </Button>
        </div>
      </div>

      {/* Main Content: Empty state or tabbed view */}
      {entries.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            No players added yet. Click &quot;Add Player&quot; to begin.
          </CardContent>
        </Card>
      ) : (
        <Tabs defaultValue="standings" className="space-y-4">
          <TabsList>
            <TabsTrigger value="standings">Standings</TabsTrigger>
            <TabsTrigger value="times">Time Entry</TabsTrigger>
          </TabsList>

          {/* Standings Tab: Ranked list of players */}
          <TabsContent value="standings">
            <Card>
              <CardHeader>
                <CardTitle>Qualification Standings</CardTitle>
                <CardDescription>
                  {entries.filter((e) => e.totalTime !== null).length} /{" "}
                  {entries.length} players completed
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-16">Rank</TableHead>
                      <TableHead>Player</TableHead>
                      <TableHead className="text-center">Progress</TableHead>
                      <TableHead className="text-right">Total Time</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {entries
                      .sort((a, b) => {
                        if (a.rank === null && b.rank === null) return 0;
                        if (a.rank === null) return 1;
                        if (b.rank === null) return -1;
                        return a.rank - b.rank;
                      })
                      .map((entry) => (
                        <TableRow key={entry.id}>
                          <TableCell className="font-bold">
                            {entry.rank || "-"}
                          </TableCell>
                          <TableCell className="font-medium">
                            {entry.player.nickname}
                          </TableCell>
                          <TableCell className="text-center">
                            {getEnteredTimesCount(entry)} / {TOTAL_COURSES}
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

          {/* Time Entry Tab: Edit times for each player */}
          <TabsContent value="times">
            <Card>
              <CardHeader>
                <CardTitle>Time Entry</CardTitle>
                <CardDescription>
                  Enter times for each player (format: M:SS.mmm)
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Player</TableHead>
                      <TableHead className="text-center">Progress</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="text-right w-32">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {entries.map((entry) => (
                      <TableRow key={entry.id}>
                        <TableCell className="font-medium">
                          {entry.player.nickname}
                        </TableCell>
                        <TableCell className="text-center">
                          {getEnteredTimesCount(entry)} / {TOTAL_COURSES}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {msToDisplayTime(entry.totalTime)}
                        </TableCell>
                        <TableCell className="text-right space-x-2">
                          <Button
                            size="sm"
                            onClick={() => openTimeEntryDialog(entry)}
                          >
                            Edit Times
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteEntry(entry.id)}
                          >
                            Remove
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}

      {/* Time Entry Dialog: Course-by-course time input */}
      <Dialog
        open={isTimeEntryDialogOpen}
        onOpenChange={(open) => {
          setIsTimeEntryDialogOpen(open);
          if (!open) setSaveError(null);
        }}
      >
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Enter Times - {selectedEntry?.player.nickname}
            </DialogTitle>
            <DialogDescription>
              Enter time for each course (format: M:SS.mmm, e.g., 1:23.456)
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            {saveError && (
              <div className="mb-4 p-3 bg-destructive/10 border border-destructive rounded-md">
                <p className="text-destructive text-sm">{saveError}</p>
              </div>
            )}
            {/* Course time inputs organized by cup (Mushroom, Flower, Star, Special) */}
            <div className="grid grid-cols-2 gap-4">
              {["Mushroom", "Flower", "Star", "Special"].map((cup) => (
                <Card key={cup}>
                  <CardHeader className="py-2">
                    <CardTitle className="text-sm">{cup} Cup</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {COURSE_INFO.filter((c) => c.cup === cup).map((course) => (
                      <div
                        key={course.abbr}
                        className="flex items-center gap-2"
                      >
                        <Label className="w-12 text-xs font-mono">
                          {course.abbr}
                        </Label>
                        <Input
                          type="text"
                          placeholder="M:SS.mmm"
                          value={timeInputs[course.abbr] || ""}
                          onChange={(e) =>
                            handleTimeChange(course.abbr, e.target.value)
                          }
                          className="font-mono text-sm"
                        />
                      </div>
                    ))}
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsTimeEntryDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button onClick={handleSaveTimes} disabled={saving}>
              {saving ? "Saving..." : "Save Times"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
