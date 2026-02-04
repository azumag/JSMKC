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
 * 4. Export:
 *    - Download qualification data as Excel/CSV file
 *
 * Data is refreshed every 3 seconds via polling for real-time updates
 * during live tournament operation.
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { COURSE_INFO, TOTAL_COURSES } from "@/lib/constants";
import { generateRandomTimeString } from "@/lib/ta/time-utils";
import { usePolling } from "@/lib/hooks/usePolling";
import { CardSkeleton } from "@/components/ui/loading-skeleton";
import { Dice5 } from "lucide-react";
import { toast } from "sonner";

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
  /** Per-course scores from qualification scoring system */
  courseScores: Record<string, number> | null;
  /** Total qualification points: floor(sum of per-course scores) */
  qualificationPoints: number | null;
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
  const { data: session } = useSession();
  const t = useTranslations('ta');
  const tc = useTranslations('common');

  /**
   * Admin role check: only admin users can add/remove players, edit times,
   * and promote to finals. Non-admin users see read-only standings.
   */
  const isAdmin = session?.user && session.user.role === 'admin';

  // === State Management ===
  const [error, setError] = useState<string | null>(null);

  // Dialog states
  const [isAddPlayerDialogOpen, setIsAddPlayerDialogOpen] = useState(false);
  const [isTimeEntryDialogOpen, setIsTimeEntryDialogOpen] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<TTEntry | null>(null);
  const [timeInputs, setTimeInputs] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Bulk player add: track selected player IDs and search query for filtering
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<string[]>([]);
  const [playerSearchQuery, setPlayerSearchQuery] = useState("");

  // Export state
  const [exporting, setExporting] = useState(false);

  // Development-only flag: inlined at build time, tree-shaken in production
  const isDevelopment = process.env.NODE_ENV === 'development';

  // Fill random times for all courses in the single-player time entry dialog
  const handleFillRandomTimes = () => {
    const randomTimes: Record<string, string> = {};
    COURSE_INFO.forEach((course) => {
      randomTimes[course.abbr] = generateRandomTimeString();
    });
    setTimeInputs(randomTimes);
    toast.success('Random times filled for all courses');
  };

  // Track bulk fill progress (null = not running)
  const [bulkFillProgress, setBulkFillProgress] = useState<string | null>(null);

  /**
   * Fill and save random times for ALL players in one click (Dev only).
   * Sequentially calls the PUT API for each entry to avoid race conditions.
   */
  const handleFillAllPlayersTimes = async () => {
    if (!confirm(`Fill random times for all ${entries.length} players?`)) return;
    setBulkFillProgress(`0 / ${entries.length}`);
    let successCount = 0;

    for (const entry of entries) {
      // Generate random times for all 20 courses
      const randomTimes: Record<string, string> = {};
      COURSE_INFO.forEach((course) => {
        randomTimes[course.abbr] = generateRandomTimeString();
      });

      try {
        const response = await fetch(`/api/tournaments/${tournamentId}/ta`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ entryId: entry.id, times: randomTimes }),
        });
        if (response.ok) successCount++;
      } catch {
        // Continue with remaining players even if one fails
      }
      setBulkFillProgress(`${successCount} / ${entries.length}`);
    }

    setBulkFillProgress(null);
    toast.success(`Random times saved for ${successCount} / ${entries.length} players`);
    refetch();
  };

  // Phase promotion states
  const [phaseStatus, setPhaseStatus] = useState<{
    phase1: { total: number; active: number; eliminated: number } | null;
    phase2: { total: number; active: number; eliminated: number } | null;
    phase3: { total: number; active: number; eliminated: number; winner: string | null } | null;
    currentPhase: string;
  } | null>(null);
  const [promotingPhase, setPromotingPhase] = useState<string | null>(null);

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
    const playersJson = await playersResponse.json();

    return {
      entries: taData.entries || [],
      allPlayers: playersJson.data ?? playersJson,
    };
  }, [tournamentId]);

  /*
   * Poll for updates every 3 seconds during live tournament operation.
   * cacheKey enables instant content display when returning to this tab.
   */
  const { data: pollData, error: pollError, refetch } = usePolling(
    fetchTournamentData, {
    interval: 3000,
    cacheKey: `tournament/${tournamentId}/ta`,
  });

  /*
   * Derive display data directly from polling response.
   * Avoids redundant local state and provides instant display from cache.
   */
  const entries: TTEntry[] = pollData?.entries ?? [];
  const allPlayers: Player[] = pollData?.allPlayers ?? [];

  // Check if qualification entries exist in each phase's rank range.
  // This directly mirrors the backend's getQualificationPlayersByRank checks.
  // If no players are ranked in a phase's range, that phase can be skipped.
  const phase1HasPlayers = entries.some(e => e.rank !== null && e.rank >= 17 && e.rank <= 24);
  const phase2HasPlayers = entries.some(e => e.rank !== null && e.rank >= 13 && e.rank <= 16);

  /* Sync polling errors to local error state for display */
  useEffect(() => {
    if (pollError) {
      setError(pollError);
    }
  }, [pollError]);

  /**
   * Fetch phase status from the phases API.
   * Called on mount and after promotion actions.
   */
  const fetchPhaseStatus = useCallback(async () => {
    try {
      const response = await fetch(`/api/tournaments/${tournamentId}/ta/phases`);
      if (response.ok) {
        const data = await response.json();
        setPhaseStatus(data.phaseStatus);
      }
    } catch {
      // Phase status fetch is non-critical; silently ignore errors
    }
  }, [tournamentId]);

  useEffect(() => {
    fetchPhaseStatus();
  }, [fetchPhaseStatus]);

  /**
   * Promote players to a specific phase via the phases API.
   * Used by Phase 1/2/3 promotion buttons.
   */
  const handlePromoteToPhase = async (action: string) => {
    setPromotingPhase(action);
    try {
      const response = await fetch(`/api/tournaments/${tournamentId}/ta/phases`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to promote players");
      }
      // Refresh phase status after promotion
      await fetchPhaseStatus();
      if (data.skipped && data.skipped.length > 0) {
        alert(`Promoted ${data.entries.length} players. Skipped: ${data.skipped.join(", ")} (incomplete times)`);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to promote";
      alert(errorMessage);
    } finally {
      setPromotingPhase(null);
    }
  };

  // === Event Handlers ===

  /** Add multiple selected players to the qualification round in batch.
   *  Uses the existing batch API endpoint (players: string[]) for efficiency. */
  const handleAddPlayers = async () => {
    if (selectedPlayerIds.length === 0) return;
    setSaving(true);
    setSaveError(null);
    try {
      const response = await fetch(`/api/tournaments/${tournamentId}/ta`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ players: selectedPlayerIds, action: "add" }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to add players");
      }

      // Reset dialog state on success
      setIsAddPlayerDialogOpen(false);
      setSelectedPlayerIds([]);
      setPlayerSearchQuery("");
      refetch();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to add players";
      console.error("Failed to add players:", err);
      setSaveError(errorMessage);
    } finally {
      setSaving(false);
    }
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
    if (!confirm(tc('confirmRemovePlayer'))) return;

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

  /** Players filtered by search query for the add-player dialog (case-insensitive partial match) */
  const filteredPlayers = availablePlayers.filter((p) => {
    if (!playerSearchQuery) return true;
    const q = playerSearchQuery.toLowerCase();
    return p.nickname.toLowerCase().includes(q) || p.name.toLowerCase().includes(q);
  });

  /** Whether all currently visible (filtered) players are selected */
  const allFilteredSelected = filteredPlayers.length > 0 &&
    filteredPlayers.every((p) => selectedPlayerIds.includes(p.id));

  /* Show error state if the first fetch fails and there's no cached data.
     Must be checked before the skeleton to avoid permanent loading on error. */
  if (!pollData && error) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold">{t('title')}</h1>
        <div className="text-center py-8">
          <p className="text-destructive mb-4">{error}</p>
          <Button onClick={refetch}>{tc('retry')}</Button>
        </div>
      </div>
    );
  }

  // === Loading State (only on first visit with no cached data) ===
  if (!pollData) {
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
          <h1 className="text-3xl font-bold">{t('title')}</h1>
        </div>
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-destructive mb-4">{error}</p>
            <Button onClick={refetch}>{tc('retry')}</Button>
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
          <h1 className="text-3xl font-bold">{t('qualificationTitle')}</h1>
          <p className="text-muted-foreground text-sm sm:text-base">
            {t('qualificationDesc')}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" onClick={handleExport} disabled={exporting}>
            {exporting ? tc('exporting') : tc('exportExcel')}
          </Button>
          {/* Legacy "Promote to Finals" button and dialog removed.
           * All promotion is now handled via the Phase 1/2/3 management card below.
           * See Phase 3 card "Go to Finals" link for the finals page entry point. */}
          {/* Add Players Dialog: admin-only, checkbox-based bulk selection */}
          {isAdmin && (
          <Dialog
            open={isAddPlayerDialogOpen}
            onOpenChange={(open) => {
              setIsAddPlayerDialogOpen(open);
              if (!open) {
                // Reset selection state when dialog closes
                setSaveError(null);
                setSelectedPlayerIds([]);
                setPlayerSearchQuery("");
              }
            }}
          >
            <DialogTrigger asChild>
              <Button variant="outline" className="w-full sm:w-auto">{tc('addPlayer')}</Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>{t('addPlayerToTA')}</DialogTitle>
                <DialogDescription>
                  {t('selectPlayersToAdd')}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3 py-2">
                {/* Search filter: narrow down players by name or nickname */}
                <Input
                  placeholder={t('searchPlayers')}
                  value={playerSearchQuery}
                  onChange={(e) => setPlayerSearchQuery(e.target.value)}
                />
                {/* Select All / Deselect All toggle for filtered results */}
                {filteredPlayers.length > 0 && (
                  <div className="flex items-center gap-2 py-1 border-b">
                    <Checkbox
                      id="select-all"
                      checked={allFilteredSelected}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          // Add all filtered players to selection (preserving already-selected non-filtered ones)
                          const filteredIds = filteredPlayers.map((p) => p.id);
                          setSelectedPlayerIds((prev) => [
                            ...new Set([...prev, ...filteredIds]),
                          ]);
                        } else {
                          // Remove only the filtered players from selection
                          const filteredIds = new Set(filteredPlayers.map((p) => p.id));
                          setSelectedPlayerIds((prev) =>
                            prev.filter((id) => !filteredIds.has(id))
                          );
                        }
                      }}
                    />
                    <Label htmlFor="select-all" className="cursor-pointer font-medium">
                      {t('selectAll')}
                    </Label>
                  </div>
                )}
                {/* Scrollable player list with checkboxes */}
                <div className="max-h-60 overflow-y-auto space-y-1">
                  {filteredPlayers.length === 0 ? (
                    <p className="text-muted-foreground text-sm py-2">
                      {tc('noPlayersSelected')}
                    </p>
                  ) : (
                    filteredPlayers.map((player) => (
                      <div key={player.id} className="flex items-center gap-2 py-1 px-1 rounded hover:bg-muted/50">
                        <Checkbox
                          id={`player-${player.id}`}
                          checked={selectedPlayerIds.includes(player.id)}
                          onCheckedChange={(checked) => {
                            setSelectedPlayerIds((prev) =>
                              checked
                                ? [...prev, player.id]
                                : prev.filter((id) => id !== player.id)
                            );
                          }}
                        />
                        <Label htmlFor={`player-${player.id}`} className="cursor-pointer flex-1">
                          {player.nickname} ({player.name})
                        </Label>
                      </div>
                    ))
                  )}
                </div>
                {saveError && (
                  <p className="text-destructive text-sm">{saveError}</p>
                )}
              </div>
              <DialogFooter>
                <Button
                  onClick={handleAddPlayers}
                  disabled={selectedPlayerIds.length === 0 || saving}
                >
                  {saving
                    ? t('adding')
                    : t('addSelectedPlayers', { count: selectedPlayerIds.length })}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          )}
        </div>
      </div>

      {/* Finals Phase Management: Promote players to phase 1/2/3 and navigate to phase pages */}
      {entries.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{t('finalsPhases')}</CardTitle>
            <CardDescription>
              {t('finalsPhaseDesc')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {/* Phase 1: Only relevant when there are ≥17 qualified players (ranks 17-24) */}
              <div className="border rounded-lg p-4 space-y-2">
                <h4 className="font-semibold">{t('phase1')}</h4>
                <p className="text-sm text-muted-foreground">{t('phase1Desc')}</p>
                {phaseStatus?.phase1 ? (
                  <div className="text-sm">
                    <span className="text-green-600">{phaseStatus.phase1.active} {tc('active')}</span>
                    {" / "}
                    <span className="text-red-500">{phaseStatus.phase1.eliminated} {tc('eliminated')}</span>
                  </div>
                ) : !phase1HasPlayers ? (
                  <p className="text-sm text-muted-foreground">{t('phase1Skipped')}</p>
                ) : (
                  <p className="text-sm text-muted-foreground">{tc('notStarted')}</p>
                )}
                <div className="flex gap-2">
                  {/* Promotion button: admin-only */}
                  {isAdmin && !phaseStatus?.phase1 && phase1HasPlayers && (
                    <Button
                      size="sm"
                      onClick={() => handlePromoteToPhase("promote_phase1")}
                      disabled={promotingPhase !== null}
                    >
                      {promotingPhase === "promote_phase1" ? tc('promoting') : t('startPhase1')}
                    </Button>
                  )}
                  {phaseStatus?.phase1 && (
                    <Button size="sm" variant="outline" asChild>
                      <Link href={`/tournaments/${tournamentId}/ta/phase1`}>{t('goToPhase1')}</Link>
                    </Button>
                  )}
                </div>
              </div>

              {/* Phase 2: Accessible when Phase 1 exists OR Phase 1 is skipped (no eligible players) */}
              <div className="border rounded-lg p-4 space-y-2">
                <h4 className="font-semibold">{t('phase2')}</h4>
                <p className="text-sm text-muted-foreground">{t('phase2Desc')}</p>
                {phaseStatus?.phase2 ? (
                  <div className="text-sm">
                    <span className="text-green-600">{phaseStatus.phase2.active} {tc('active')}</span>
                    {" / "}
                    <span className="text-red-500">{phaseStatus.phase2.eliminated} {tc('eliminated')}</span>
                  </div>
                ) : !phase2HasPlayers ? (
                  <p className="text-sm text-muted-foreground">{t('phase2Skipped')}</p>
                ) : (
                  <p className="text-sm text-muted-foreground">{tc('notStarted')}</p>
                )}
                <div className="flex gap-2">
                  {/* Promotion button: admin-only */}
                  {isAdmin && !phaseStatus?.phase2 && (phaseStatus?.phase1 || !phase1HasPlayers) && phase2HasPlayers && (
                    <Button
                      size="sm"
                      onClick={() => handlePromoteToPhase("promote_phase2")}
                      disabled={promotingPhase !== null}
                    >
                      {promotingPhase === "promote_phase2" ? tc('promoting') : t('startPhase2')}
                    </Button>
                  )}
                  {phaseStatus?.phase2 && (
                    <Button size="sm" variant="outline" asChild>
                      <Link href={`/tournaments/${tournamentId}/ta/phase2`}>{t('goToPhase2')}</Link>
                    </Button>
                  )}
                </div>
              </div>

              {/* Phase 3: Accessible when Phase 2 exists OR Phase 1+2 are skipped */}
              <div className="border rounded-lg p-4 space-y-2">
                <h4 className="font-semibold">{t('phase3')}</h4>
                <p className="text-sm text-muted-foreground">{t('phase3Desc')}</p>
                {phaseStatus?.phase3 ? (
                  <div className="text-sm">
                    <span className="text-green-600">{phaseStatus.phase3.active} {tc('active')}</span>
                    {" / "}
                    <span className="text-red-500">{phaseStatus.phase3.eliminated} {tc('eliminated')}</span>
                    {phaseStatus.phase3.winner && (
                      <span className="ml-2 text-yellow-600 font-bold">
                        {t('champion', { name: phaseStatus.phase3.winner })}
                      </span>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">{tc('notStarted')}</p>
                )}
                <div className="flex gap-2">
                  {/* Promotion button: admin-only */}
                  {isAdmin && !phaseStatus?.phase3 && (phaseStatus?.phase2 || !phase2HasPlayers) && (
                    <Button
                      size="sm"
                      onClick={() => handlePromoteToPhase("promote_phase3")}
                      disabled={promotingPhase !== null}
                    >
                      {promotingPhase === "promote_phase3" ? tc('promoting') : t('startPhase3')}
                    </Button>
                  )}
                  {phaseStatus?.phase3 && (
                    <Button size="sm" variant="outline" asChild>
                      <Link href={`/tournaments/${tournamentId}/ta/finals`}>{tc('goToFinals')}</Link>
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Main Content: Empty state or tabbed view */}
      {entries.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            {t('noPlayersYet')}
          </CardContent>
        </Card>
      ) : (
        <Tabs defaultValue="standings" className="space-y-4">
          <TabsList>
            <TabsTrigger value="standings">{tc('standings')}</TabsTrigger>
            {/* Time Entry tab: admin-only since non-admins cannot edit times */}
            {isAdmin && <TabsTrigger value="times">{t('timeEntry')}</TabsTrigger>}
          </TabsList>

          {/* Standings Tab: Ranked list of players */}
          <TabsContent value="standings">
            <Card>
              <CardHeader>
                <CardTitle>{t('qualificationStandings')}</CardTitle>
                <CardDescription>
                  {t('playersCompleted', { completed: entries.filter((e) => e.totalTime !== null).length, total: entries.length })}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-16">{t('rank')}</TableHead>
                      <TableHead>{tc('player')}</TableHead>
                      <TableHead className="text-center">{t('progress')}</TableHead>
                      <TableHead className="text-right">{tc('points')}</TableHead>
                      <TableHead className="text-right">{t('totalTime')}</TableHead>
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
                            {entry.qualificationPoints ?? "-"}
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

          {/* Time Entry Tab: Admin-only - edit times for each player */}
          {isAdmin && <TabsContent value="times">
            <Card>
              <CardHeader>
                <CardTitle>{t('timeEntry')}</CardTitle>
                <CardDescription>
                  {t('timeEntryDesc')}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{tc('player')}</TableHead>
                      <TableHead className="text-center">{t('progress')}</TableHead>
                      <TableHead className="text-right">{t('total')}</TableHead>
                      <TableHead className="text-right w-32">{t('action')}</TableHead>
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
                            {t('editTimes')}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteEntry(entry.id)}
                          >
                            {tc('remove')}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {/* Development-only: Fill random times for ALL players at once */}
                {isDevelopment && entries.length > 0 && (
                  <div className="mt-4">
                    <Button
                      onClick={handleFillAllPlayersTimes}
                      variant="outline"
                      disabled={bulkFillProgress !== null}
                      className="w-full border-dashed border-orange-400 text-orange-600 hover:bg-orange-50"
                    >
                      <Dice5 className="h-4 w-4 mr-2" />
                      {bulkFillProgress !== null
                        ? `Filling... (${bulkFillProgress})`
                        : `Fill All Players Random Times (${entries.length} players, Dev Only)`}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>}
        </Tabs>
      )}

      {/* Time Entry Dialog: Admin-only, course-by-course time input */}
      {isAdmin && <Dialog
        open={isTimeEntryDialogOpen}
        onOpenChange={(open) => {
          setIsTimeEntryDialogOpen(open);
          if (!open) setSaveError(null);
        }}
      >
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {t('enterTimesFor', { nickname: selectedEntry?.player.nickname ?? '' })}
            </DialogTitle>
            <DialogDescription>
              {t('enterTimeCourseDesc')}
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
                    <CardTitle className="text-sm">{t('cup', { cup })}</CardTitle>
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
          
          {/* Development-only: Fill random times button */}
          {isDevelopment && (
            <div className="px-6 py-2">
              <Button
                onClick={handleFillRandomTimes}
                variant="outline"
                disabled={saving}
                className="w-full border-dashed border-orange-400 text-orange-600 hover:bg-orange-50"
              >
                <Dice5 className="h-4 w-4 mr-2" />
                Fill Random Times (Dev Only)
              </Button>
            </div>
          )}
          
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsTimeEntryDialogOpen(false)}
            >
              {tc('cancel')}
            </Button>
            <Button onClick={handleSaveTimes} disabled={saving}>
              {saving ? tc('saving') : tc('saveTimes')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>}
    </div>
  );
}
