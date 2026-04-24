"use client";
import { fetchWithRetry } from "@/lib/fetch-with-retry";

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
 *    - Times are entered in M:SS.mm format (e.g., 1:23.45)
 *    - Total times and rankings are automatically calculated on save
 *
 * 3. Standings View:
 *    - Live standings sorted by rank with progress indicators
 *    - Shows completion status (N/20 courses entered)
 *
 * 4. Export:
 *    - Download qualification data as Excel/CSV file
 *
 * Data is refreshed at the standard polling interval for real-time updates
 * during live tournament operation.
 */

import { useState, useEffect, useCallback, useMemo, use } from "react";
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
import { COURSE_INFO, POLLING_INTERVAL, TOTAL_COURSES } from "@/lib/constants";
import { applyAutoPairsToSetup } from "@/lib/ta/pair-utils";
import { extractArrayData } from "@/lib/api-response";
import { autoFormatTime, generateRandomTimeString, msToDisplayTime, timeToMs } from "@/lib/ta/time-utils";
import { usePolling } from "@/lib/hooks/usePolling";
import { CardSkeleton } from "@/components/ui/loading-skeleton";
import { Dice5, ChevronDown, ChevronRight, Eye, Lock, Unlock } from "lucide-react";
import { toast } from "sonner";
import { createLogger } from "@/lib/client-logger";
import { parseManualScore } from "@/lib/parse-manual-score";

const logger = createLogger({ serviceName: 'tournaments-ta' });

/** Unique cup names derived from course metadata, used for grouping course displays */
const CUP_NAMES = [...new Set(COURSE_INFO.map((c) => c.cup))];

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
  /** §3.1: Seeding for pair assignment (per-tournament, lower = stronger) */
  seeding: number | null;
  /** §3.1: Partner player ID for pair running */
  partnerId: string | null;
  times: Record<string, string> | null;
  totalTime: number | null;
  rank: number | null;
  /** Per-course scores from qualification scoring system */
  courseScores: Record<string, number> | null;
  /** Total qualification points: floor(sum of per-course scores) */
  qualificationPoints: number | null;
  player: Player;
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
   * Admin role check: only admin users can add/remove players,
   * promote to finals, and edit any player's times.
   */
  const isAdmin = session?.user && session.user.role === 'admin';

  /**
   * Player self-edit check: logged-in players can edit their own times.
   * Uses session.user.playerId (set during player-credential login) to
   * identify which entry belongs to the current user.
   * The API enforces the same ownership check server-side via requireAdminOrPlayerSession().
   */
  const currentPlayerId = session?.user?.playerId;

  /**
   * Whether the current user can edit a specific entry's times.
   * Returns false if the entry's stage is frozen (applies to both admins and players).
   * Otherwise: admins can edit any entry; players can only edit their own.
   */
  const canEditEntry = (entry: TTEntry): boolean => {
    if (frozenStages.includes(entry.stage)) return false;
    if (isAdmin) return true;
    if (currentPlayerId && entry.playerId === currentPlayerId) return true;
    return false;
  };

  /** Whether the current user can edit any entries (admin or player with own entry).
   *  Controls whether editable time entry features are shown. */
  const canEditAnyEntry = isAdmin || !!currentPlayerId;

  // === State Management ===
  const [error, setError] = useState<string | null>(null);

  // Dialog states
  const [isTimeEntryDialogOpen, setIsTimeEntryDialogOpen] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<TTEntry | null>(null);
  const [timeInputs, setTimeInputs] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  /*
   * Unified "Setup / Edit Players" dialog (admin-only). Replaces the former
   * separate "Add Player" + "Manage Pairs" dialogs so player roster, seeding,
   * and pair partners are all configured in one place — matching BM/MR/GP's
   * group setup dialog pattern. On open, setupEntries is pre-populated from
   * the current qualification entries so unchecking removes and checking adds.
   */
  const [isSetupDialogOpen, setIsSetupDialogOpen] = useState(false);
  const [setupEntries, setSetupEntries] = useState<Array<{
    playerId: string;
    seeding?: number;
    partnerId?: string | null;
  }>>([]);

  // View-only dialog state: opened when non-admin/non-owner clicks "View Times"
  const [isViewTimesDialogOpen, setIsViewTimesDialogOpen] = useState(false);
  const [viewEntry, setViewEntry] = useState<TTEntry | null>(null);

  // Course rankings accordion state: tracks which courses are expanded
  const [expandedCourses, setExpandedCourses] = useState<Set<string>>(new Set());

  // Search query used inside the unified setup dialog
  const [playerSearchQuery, setPlayerSearchQuery] = useState("");

  // Public modes visibility state (for admin toggle).
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
      fetchWithRetry(`/api/tournaments/${tournamentId}/ta?stage=qualification`),
      /* limit=100 is the API's hard cap (src/lib/pagination.ts). The default of 50
       * silently truncates the Setup Players search once the roster grows past
       * that — newly-created players end up paginated out and can no longer be
       * added from the dialog. Request the max in one hop; if a deployment
       * ever needs >100, the dialog must switch to server-side search instead. */
      fetchWithRetry("/api/players?limit=100"),
    ]);

    if (!taResponse.ok) {
      const errorData = await taResponse.json().catch(() => ({}));
      throw new Error(errorData.error || `Failed to fetch TA data: ${taResponse.status}`);
    }

    if (!playersResponse.ok) {
      const errorData = await playersResponse.json().catch(() => ({}));
      throw new Error(errorData.error || `Failed to fetch players: ${playersResponse.status}`);
    }

    const taJson = await taResponse.json();
    const playersJson = await playersResponse.json();

    // Unwrap createSuccessResponse wrapper: { success, data: { entries, ... } }
    const taData = taJson.data ?? taJson;

    return {
      entries: taData.entries || [],
      allPlayers: extractArrayData<Player>(playersJson),
      qualificationRegistrationLocked: taData.qualificationRegistrationLocked || false,
      frozenStages: taData.frozenStages || [],
    };
  }, [tournamentId]);

  /*
   * Poll at the standard interval during live tournament operation.
   * cacheKey enables instant content display when returning to this tab.
   */
  const { data: pollData, error: pollError, refetch } = usePolling(
    fetchTournamentData, {
    interval: POLLING_INTERVAL,
    cacheKey: `tournament/${tournamentId}/ta`,
  });

  /*
   * Derive display data directly from polling response.
   * Avoids redundant local state and provides instant display from cache.
   */
  const entries: TTEntry[] = useMemo(
    () => pollData?.entries ?? [],
    [pollData?.entries],
  );
  const allPlayers: Player[] = useMemo(
    () => pollData?.allPlayers ?? [],
    [pollData?.allPlayers],
  );
  const qualificationRegistrationLocked: boolean = pollData?.qualificationRegistrationLocked ?? false;
  /** Frozen stages from the tournament - stages in this array cannot be edited */
  const frozenStages: string[] = pollData?.frozenStages ?? [];
  const showQualificationRegistrationLockedToast = () => {
    toast.info(t('qualificationRegistrationLocked'));
  };

  // === Unified Setup Dialog (§3.1 pair management + player roster) ===

  /**
   * Open the setup dialog, seeding local setupEntries from the current
   * qualification roster so user edits are diffed against the server state
   * when they click Save.
   */
  const openSetupDialog = useCallback(() => {
    const qualEntries = entries.filter((e) => e.stage === "qualification");
    setSetupEntries(
      qualEntries
        .map((e) => ({
          playerId: e.playerId,
          seeding: e.seeding ?? undefined,
          partnerId: e.partnerId ?? null,
        }))
        .sort((a, b) => (a.seeding ?? Infinity) - (b.seeding ?? Infinity)),
    );
    setSaveError(null);
    setPlayerSearchQuery("");
    setIsSetupDialogOpen(true);
  }, [entries]);

  /**
   * Compute snake pairs from the current setupEntries (local dialog state)
   * and apply them in-place. Operates on the in-flight dialog state rather
   * than the server so the admin can preview/adjust before saving.
   *
   * Also invoked automatically whenever a seeding input changes so the UI
   * mirrors §3.1 without requiring an extra button click (previously users
   * could save seeded entries with no partners assigned).
   */
  const handleAutoPair = () => {
    setSetupEntries((prev) => applyAutoPairsToSetup(prev));
  };

  /**
   * Diff setupEntries against the current qualification roster and persist.
   * Order matters: deletions first, then bulk adds (with seeding), then
   * per-entry seeding + partner updates so the server's row set matches
   * the final dialog state when we refetch.
   */
  const handleSaveSetup = async () => {
    if (saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      const existing = entries.filter((e) => e.stage === "qualification");
      const existingByPlayerId = new Map(existing.map((e) => [e.playerId, e]));
      const setupByPlayerId = new Map(setupEntries.map((s) => [s.playerId, s]));

      /* 1. Delete entries that were unchecked. Sequential to avoid hammering D1. */
      for (const e of existing) {
        if (setupByPlayerId.has(e.playerId)) continue;
        const res = await fetch(
          `/api/tournaments/${tournamentId}/ta?entryId=${e.id}`,
          { method: "DELETE" },
        );
        if (!res.ok && res.status !== 404) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || `Failed to remove ${e.player.nickname}`);
        }
      }

      /* 2. Add newly-checked players via the batch endpoint (supports seeding). */
      const toAdd = setupEntries.filter((s) => !existingByPlayerId.has(s.playerId));
      if (toAdd.length > 0) {
        const res = await fetch(`/api/tournaments/${tournamentId}/ta`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            playerEntries: toAdd.map((s) => ({
              playerId: s.playerId,
              ...(typeof s.seeding === "number" ? { seeding: s.seeding } : {}),
            })),
          }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || "Failed to add players");
        }
      }

      /* 3. Re-fetch so we have entry ids for anything just added, then
       * reconcile seeding + partner per entry. */
      const refreshed = await fetchWithRetry(
        `/api/tournaments/${tournamentId}/ta?stage=qualification`,
      );
      if (!refreshed.ok) throw new Error("Failed to refetch TA entries");
      const refreshedJson = await refreshed.json();
      const refreshedEntries: TTEntry[] =
        (refreshedJson.data ?? refreshedJson).entries ?? [];
      const refreshedByPlayerId = new Map(
        refreshedEntries.map((e) => [e.playerId, e]),
      );

      for (const s of setupEntries) {
        const entry = refreshedByPlayerId.get(s.playerId);
        if (!entry) continue;

        /* Update seeding only when it actually changes. `undefined` on the
         * setup side clears seeding back to null. */
        const desiredSeeding = typeof s.seeding === "number" ? s.seeding : null;
        if (desiredSeeding !== entry.seeding) {
          const res = await fetch(`/api/tournaments/${tournamentId}/ta`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              entryId: entry.id,
              action: "update_seeding",
              seeding: desiredSeeding,
            }),
          });
          if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(
              err.error || `Failed to update seeding for ${entry.player.nickname}`,
            );
          }
        }

        const desiredPartnerId = s.partnerId ?? null;
        if (desiredPartnerId !== (entry.partnerId ?? null)) {
          const res = await fetch(`/api/tournaments/${tournamentId}/ta`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              entryId: entry.id,
              action: "set_partner",
              partnerId: desiredPartnerId,
            }),
          });
          if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(
              err.error || `Failed to update partner for ${entry.player.nickname}`,
            );
          }
        }
      }

      setIsSetupDialogOpen(false);
      refetch();
      toast.success(t("pairsSaved"));
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Save failed";
      setSaveError(msg);
      toast.error(msg);
      logger.error("Failed to save setup:", { error: err, tournamentId });
    } finally {
      setSaving(false);
    }
  };

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
      const response = await fetchWithRetry(`/api/tournaments/${tournamentId}/ta/phases`);
      if (response.ok) {
        const json = await response.json();
        // Unwrap createSuccessResponse wrapper: { success, data: { phaseStatus } }
        const data = json.data ?? json;
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
      const json = await response.json();
      if (!response.ok) {
        throw new Error(json.error || "Failed to promote players");
      }
      // Unwrap createSuccessResponse wrapper: { success, data: { entries, skipped } }
      const data = json.data ?? json;
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

  /**
   * Toggle freeze/unfreeze for the qualification stage (admin only).
   * Updates the tournament's frozenStages array via the tournament PUT endpoint.
   * When frozen, all time edits for qualification entries are blocked.
   */
  const handleToggleFreeze = async () => {
    const isFrozen = frozenStages.includes("qualification");
    const newFrozen = isFrozen
      ? frozenStages.filter((s) => s !== "qualification")
      : [...frozenStages, "qualification"];

    try {
      const response = await fetch(`/api/tournaments/${tournamentId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ frozenStages: newFrozen }),
      });
      if (!response.ok) throw new Error("Failed to update freeze state");
      refetch();
      toast.success(isFrozen ? t('unfreezeQualification') : t('freezeQualification'));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to toggle freeze");
    }
  };

  // === Event Handlers ===

  /** Open the time entry dialog for a specific player */
  const openTimeEntryDialog = (entry: TTEntry) => {
    setSelectedEntry(entry);
    setTimeInputs(entry.times || {});
    setSaveError(null);
    setIsTimeEntryDialogOpen(true);
  };

  /** Open the read-only view dialog for a specific player's times */
  const openViewTimesDialog = (entry: TTEntry) => {
    setViewEntry(entry);
    setIsViewTimesDialogOpen(true);
  };

  /** Toggle course expansion in the course rankings accordion */
  const toggleCourse = (courseAbbr: string) => {
    setExpandedCourses((prev) => {
      const next = new Set(prev);
      if (next.has(courseAbbr)) {
        next.delete(courseAbbr);
      } else {
        next.add(courseAbbr);
      }
      return next;
    });
  };

  /**
   * Get ranked players for a specific course, sorted by time (fastest first).
   * Uses timeToMs() for correct numeric comparison (localeCompare on time
   * strings produces wrong order when minute digits differ, e.g. "2:05" vs "1:59").
   * Only includes players who have recorded a time for this course.
   */
  const getCourseRankings = (courseAbbr: string) => {
    return entries
      .filter((e) => e.times && e.times[courseAbbr] && e.times[courseAbbr] !== "")
      .sort((a, b) => {
        const msA = timeToMs(a.times![courseAbbr]) ?? Infinity;
        const msB = timeToMs(b.times![courseAbbr]) ?? Infinity;
        return msA - msB;
      });
  };

  /** Handle individual course time input change */
  const handleTimeChange = (course: string, value: string) => {
    setTimeInputs((prev) => ({ ...prev, [course]: value }));
  };

  /** Auto-format time on blur — normalizes input to M:SS.mm */
  const handleTimeBlur = (course: string) => {
    const raw = timeInputs[course];
    if (!raw || raw.trim() === "") return;
    const formatted = autoFormatTime(raw);
    if (formatted !== null && formatted !== raw) {
      setTimeInputs((prev) => ({ ...prev, [course]: formatted }));
    }
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
      logger.error("Failed to save times:", { error: err, tournamentId });
      setSaveError(errorMessage);
    } finally {
      setSaving(false);
    }
  };


  // === Helper Functions ===

  /** Count how many course times have been entered for an entry */
  const getEnteredTimesCount = (entry: TTEntry): number => {
    if (!entry.times) return 0;
    return Object.values(entry.times).filter((t) => t && t !== "").length;
  };

  /** Players filtered by search query for the setup dialog (case-insensitive partial match) */
  const filteredPlayers = allPlayers.filter((p) => {
    if (!playerSearchQuery) return true;
    const q = playerSearchQuery.toLowerCase();
    return p.nickname.toLowerCase().includes(q) || p.name.toLowerCase().includes(q);
  });

  /** Set of playerIds currently included in the setup (drives checkbox state) */
  const setupPlayerIdSet = new Set(setupEntries.map((s) => s.playerId));

  /** Whether all currently visible (filtered) players are already in the setup */
  const allFilteredSelected = filteredPlayers.length > 0 &&
    filteredPlayers.every((p) => setupPlayerIdSet.has(p.id));

  /** Has the qualification roster been initialized (controls Setup vs Edit label)? */
  const hasQualificationRoster = entries.some((e) => e.stage === "qualification");

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
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-bold">{t('qualificationTitle')}</h1>
            {/* Show frozen badge when qualification stage is locked */}
            {frozenStages.includes("qualification") && (
              <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2.5 py-0.5 text-xs font-medium text-destructive">
                <Lock className="h-3 w-3" />
                {t('frozenBadge')}
              </span>
            )}
          </div>
          <p className="text-muted-foreground text-sm sm:text-base">
            {t('qualificationDesc')}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {/* Freeze/Unfreeze qualification stage (admin only) */}
          {isAdmin && (
            <Button
              variant={frozenStages.includes("qualification") ? "destructive" : "outline"}
              onClick={handleToggleFreeze}
              size="sm"
            >
              {frozenStages.includes("qualification") ? (
                <><Unlock className="h-4 w-4 mr-1" />{t('unfreezeQualification')}</>
              ) : (
                <><Lock className="h-4 w-4 mr-1" />{t('freezeQualification')}</>
              )}
            </Button>
          )}
          {/* Legacy "Promote to Finals" button and dialog removed.
           * All promotion is now handled via the Phase 1/2/3 management card below.
           * See Phase 3 card "Go to Finals" link for the finals page entry point. */}
          {/*
           * Unified Setup / Edit Players dialog.
           * Single admin entry point for: roster selection, seeding input,
           * and partner assignment. Matches BM/MR/GP's group setup dialog so
           * TA no longer has separate "Add Player" + "Manage Pairs" flows.
           */}
          {isAdmin && (
            <Dialog
              open={isSetupDialogOpen}
              onOpenChange={(open) => {
                if (qualificationRegistrationLocked && open) return;
                if (open) {
                  openSetupDialog();
                } else {
                  setIsSetupDialogOpen(false);
                  setSaveError(null);
                  setPlayerSearchQuery("");
                }
              }}
            >
              <DialogTrigger asChild>
                <Button
                  variant={hasQualificationRoster ? "outline" : "default"}
                  className={`w-full sm:w-auto ${qualificationRegistrationLocked ? "cursor-not-allowed opacity-50" : ""}`}
                  aria-disabled={qualificationRegistrationLocked}
                  title={qualificationRegistrationLocked ? t("qualificationRegistrationLocked") : undefined}
                  onClick={(event) => {
                    if (!qualificationRegistrationLocked) return;
                    event.preventDefault();
                    showQualificationRegistrationLockedToast();
                  }}
                >
                  {hasQualificationRoster ? t("editPlayers") : t("setupPlayers")}
                </Button>
              </DialogTrigger>
              <DialogContent className="w-[calc(100vw-2rem)] sm:w-[calc(100vw-4rem)] md:w-[max-content] lg:max-w-5xl max-h-[90vh] flex flex-col p-4 sm:p-5 md:p-6">
                <DialogHeader>
                  <DialogTitle>
                    {hasQualificationRoster ? t("editPlayersTitle") : t("setupPlayersTitle")}
                  </DialogTitle>
                  <DialogDescription>
                    {hasQualificationRoster ? t("editPlayersDesc") : t("setupPlayersDesc")}
                  </DialogDescription>
                </DialogHeader>

                <div className="flex-1 overflow-y-auto md:overflow-y-auto">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4 md:h-full">
                    {/* Left column: all players checklist */}
                    <div className="flex flex-col min-h-0">
                      <h4 className="font-medium mb-2">{tc("player")}</h4>
                      <Input
                        placeholder={t("searchPlayers")}
                        value={playerSearchQuery}
                        onChange={(e) => setPlayerSearchQuery(e.target.value)}
                        className="mb-2"
                      />
                      {filteredPlayers.length > 0 && (
                        <div className="flex items-center gap-2 py-1 border-b mb-1">
                          <Checkbox
                            id="setup-select-all"
                            checked={allFilteredSelected}
                            onCheckedChange={(checked) => {
                              if (checked) {
                                const toAdd = filteredPlayers
                                  .filter((p) => !setupPlayerIdSet.has(p.id))
                                  .map((p) => ({
                                    playerId: p.id,
                                    seeding: undefined as number | undefined,
                                    partnerId: null as string | null,
                                  }));
                                setSetupEntries((prev) => [...prev, ...toAdd]);
                              } else {
                                const visibleIds = new Set(filteredPlayers.map((p) => p.id));
                                setSetupEntries((prev) =>
                                  prev.filter((s) => !visibleIds.has(s.playerId)),
                                );
                              }
                            }}
                            className="h-11 w-11 sm:h-10 sm:w-10 md:h-5 md:w-5"
                          />
                          <Label htmlFor="setup-select-all" className="cursor-pointer font-medium">
                            {t("selectAll")}
                          </Label>
                        </div>
                      )}
                      <div className="flex-1 min-h-0 overflow-y-auto space-y-1">
                        {filteredPlayers.length === 0 ? (
                          <p className="text-muted-foreground text-sm py-2">
                            {tc("noPlayersSelected")}
                          </p>
                        ) : (
                          filteredPlayers.map((player) => (
                            <div
                              key={player.id}
                              className="flex items-center gap-2 py-2 sm:py-1 px-2 sm:px-1 rounded hover:bg-muted/50"
                            >
                              <Checkbox
                                id={`setup-player-${player.id}`}
                                checked={setupPlayerIdSet.has(player.id)}
                                onCheckedChange={(checked) => {
                                  if (checked) {
                                    setSetupEntries((prev) =>
                                      prev.some((s) => s.playerId === player.id)
                                        ? prev
                                        : [
                                            ...prev,
                                            { playerId: player.id, seeding: undefined, partnerId: null },
                                          ],
                                    );
                                  } else {
                                    setSetupEntries((prev) =>
                                      prev.filter((s) => s.playerId !== player.id),
                                    );
                                  }
                                }}
                                className="h-11 w-11 sm:h-10 sm:w-10 md:h-5 md:w-5"
                              />
                              <Label
                                htmlFor={`setup-player-${player.id}`}
                                className="cursor-pointer flex-1"
                              >
                                {player.nickname} ({player.name})
                              </Label>
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    {/* Right column: selected entries with seeding + partner */}
                    <div className="flex flex-col min-h-0">
                      <div className="flex flex-wrap items-center gap-2 mb-2">
                        <h4 className="font-medium">
                          {tc("selectedPlayers", { count: setupEntries.length })}
                        </h4>
                        <div className="flex-1" />
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleAutoPair}
                          disabled={setupEntries.length < 2}
                          title={t("managePairsDesc")}
                        >
                          {t("autoPair")}
                        </Button>
                      </div>
                      <div className="flex-1 min-h-0 overflow-y-auto border rounded-lg">
                        {setupEntries.length === 0 ? (
                          <p className="text-muted-foreground text-sm py-4 text-center">
                            {tc("noPlayersSelected")}
                          </p>
                        ) : (
                          <div className="divide-y">
                            {setupEntries.map((s) => {
                              const player = allPlayers.find((p) => p.id === s.playerId);
                              return (
                                <div
                                  key={s.playerId}
                                  className="flex items-center gap-2 px-3 py-2"
                                >
                                  <Input
                                    type="number"
                                    min={1}
                                    placeholder="#"
                                    value={s.seeding ?? ""}
                                    onChange={(e) => {
                                      /* Strict parse: reject "1.5"/"1e2" that parseInt
                                       * would silently truncate before `>= 1` passes. */
                                      const parsed = parseManualScore(e.target.value);
                                      const seeding =
                                        parsed !== null && parsed >= 1 ? parsed : undefined;
                                      /* Recompute snake pairs immediately so the partner
                                       * column reflects §3.1 as soon as seedings change. */
                                      setSetupEntries((prev) =>
                                        applyAutoPairsToSetup(
                                          prev.map((p) =>
                                            p.playerId === s.playerId ? { ...p, seeding } : p,
                                          ),
                                        ),
                                      );
                                    }}
                                    className="w-14 h-11 sm:h-10 md:h-9 text-center text-sm"
                                    aria-label={`${player?.nickname ?? s.playerId} seeding`}
                                  />
                                  <span className="flex-1 min-w-0 text-sm truncate">
                                    {player?.nickname ?? `ID: ${s.playerId.slice(0, 8)}`}
                                  </span>
                                  <select
                                    className="border rounded px-2 py-1 text-sm bg-background h-11 sm:h-10 md:h-9 max-w-[130px]"
                                    value={s.partnerId ?? ""}
                                    onChange={(ev) => {
                                      const val = ev.target.value || null;
                                      /* Maintain reciprocal partner links within the dialog
                                       * state so the UI mirrors the server's bidirectional
                                       * storage (A↔B). */
                                      setSetupEntries((prev) => {
                                        const oldPartner = s.partnerId ?? null;
                                        const next = prev.map((p) => {
                                          if (p.playerId === s.playerId) {
                                            return { ...p, partnerId: val };
                                          }
                                          if (oldPartner && p.playerId === oldPartner) {
                                            return { ...p, partnerId: null };
                                          }
                                          if (val && p.playerId === val) {
                                            /* Also clear the new partner's prior link */
                                            return { ...p, partnerId: s.playerId };
                                          }
                                          return p;
                                        });
                                        return next;
                                      });
                                    }}
                                    aria-label={`${player?.nickname ?? s.playerId} partner`}
                                  >
                                    <option value="">{t("noPair")}</option>
                                    {setupEntries
                                      .filter((e) => e.playerId !== s.playerId)
                                      .map((e) => {
                                        const ep = allPlayers.find((p) => p.id === e.playerId);
                                        return (
                                          <option key={e.playerId} value={e.playerId}>
                                            {ep?.nickname ?? e.playerId}
                                            {typeof e.seeding === "number" ? ` (#${e.seeding})` : ""}
                                          </option>
                                        );
                                      })}
                                  </select>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() =>
                                      setSetupEntries((prev) =>
                                        prev.filter((p) => p.playerId !== s.playerId),
                                      )
                                    }
                                    className="min-h-[44px] md:min-h-[32px]"
                                  >
                                    {tc("remove")}
                                  </Button>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {saveError && (
                  <p className="text-destructive text-sm pt-2">{saveError}</p>
                )}

                <DialogFooter className="pt-4 border-t">
                  <Button variant="outline" onClick={() => setIsSetupDialogOpen(false)}>
                    {tc("cancel")}
                  </Button>
                  <Button onClick={handleSaveSetup} disabled={saving}>
                    {saving ? t("savingPlayers") : t("savePlayers")}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      {/* Finals Phase Management: Promote players to phase 1/2/3 and navigate to phase pages.
       * Only shown after qualification is frozen (completed) or if any phase has already started,
       * preventing premature access to finals controls while qualification is still in progress. */}
      {entries.length > 0 && (frozenStages.includes("qualification") || phaseStatus?.phase1 || phaseStatus?.phase2 || phaseStatus?.phase3) && (
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
                <div className="flex items-center gap-2">
                  <h4 className="font-semibold">{t('phase1')}</h4>
                </div>
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
                <div className="flex gap-2 flex-wrap">
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

              {/* Phase 2: Only shown when Phase 1 has been started or skipped (no eligible players).
               * This prevents displaying Phase 2 controls before Phase 1 is resolved. */}
              {(phaseStatus?.phase1 || !phase1HasPlayers) && <div className="border rounded-lg p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <h4 className="font-semibold">{t('phase2')}</h4>
                </div>
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
                <div className="flex gap-2 flex-wrap">
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
              </div>}

              {/* Phase 3: Only shown when Phase 2 has been started or skipped.
               * Both Phase 1 and Phase 2 must be resolved before Phase 3 appears. */}
              {(phaseStatus?.phase2 || (!phase1HasPlayers && !phase2HasPlayers) || (phaseStatus?.phase1 && !phase2HasPlayers)) && <div className="border rounded-lg p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <h4 className="font-semibold">{t('phase3')}</h4>
                </div>
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
                <div className="flex gap-2 flex-wrap">
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
              </div>}
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
            {/* Time list tab: visible to all users.
             *  Admin/player sees "タイム入力", others see "タイム一覧" */}
            <TabsTrigger value="times">
              {canEditAnyEntry ? t('timeEntry') : t('timeList')}
            </TabsTrigger>
            {/* Course rankings tab: per-course accordion view, visible to all */}
            <TabsTrigger value="courseRankings">{t('courseRankings')}</TabsTrigger>
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
                      <TableHead>{t('pairPartner')}</TableHead>
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
                          <TableCell className="text-sm text-muted-foreground">
                            {entry.partnerId
                              ? (entries.find(e => e.playerId === entry.partnerId)?.player.nickname ?? "-")
                              : "-"}
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

          {/* Time List/Entry Tab: visible to all users.
           *  Admin/player can edit times; others can view times read-only. */}
          <TabsContent value="times">
            <Card>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle>{canEditAnyEntry ? t('timeEntry') : t('timeList')}</CardTitle>
                    <CardDescription>
                      {canEditAnyEntry ? t('timeEntryDesc') : t('timeListDesc')}
                    </CardDescription>
                  </div>
                  {/* Quick-access button: lets logged-in players open their own
                   *  time entry dialog directly without scrolling the table.
                   *  Only shown when the player has an entry in this tournament. */}
                  {currentPlayerId && entries.find((e) => e.playerId === currentPlayerId) && (
                    <Button
                      size="sm"
                      onClick={() => {
                        const myEntry = entries.find((e) => e.playerId === currentPlayerId);
                        if (myEntry) openTimeEntryDialog(myEntry);
                      }}
                    >
                      {t('editTimes')}
                    </Button>
                  )}
                </div>
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
                          {/* Edit button: admin can edit all; player can edit own entry only */}
                          {canEditEntry(entry) ? (
                            <Button
                              size="sm"
                              onClick={() => openTimeEntryDialog(entry)}
                            >
                              {t('editTimes')}
                            </Button>
                          ) : (
                            /* View button: read-only access for all other users */
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => openViewTimesDialog(entry)}
                            >
                              <Eye className="h-3 w-3 mr-1" />
                              {t('viewTimes')}
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {/* Development-only: Fill random times for ALL players at once */}
                {isDevelopment && isAdmin && entries.length > 0 && (
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
          </TabsContent>

          {/* Course Rankings Tab: per-course accordion view, visible to all users.
           *  Shows all 20 courses grouped by cup. Expanding a course reveals
           *  all players' times ranked fastest-first. */}
          <TabsContent value="courseRankings">
            <Card>
              <CardHeader>
                <CardTitle>{t('courseRankings')}</CardTitle>
                <CardDescription>{t('courseRankingsDesc')}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {CUP_NAMES.map((cup) => (
                  <div key={cup} className="space-y-1">
                    <h4 className="font-semibold text-sm text-muted-foreground pt-2">
                      {t('cup', { cup })}
                    </h4>
                    {COURSE_INFO.filter((c) => c.cup === cup).map((course) => {
                      const isExpanded = expandedCourses.has(course.abbr);
                      const rankings = isExpanded ? getCourseRankings(course.abbr) : [];
                      return (
                        <div key={course.abbr} className="border rounded-lg">
                          {/* Course header: click to expand/collapse */}
                          <button
                            type="button"
                            className="w-full flex items-center justify-between p-3 text-left hover:bg-muted/50 transition-colors"
                            onClick={() => toggleCourse(course.abbr)}
                          >
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-sm font-medium w-10">
                                {course.abbr}
                              </span>
                              <span className="text-sm text-muted-foreground">
                                {course.name}
                              </span>
                            </div>
                            {isExpanded
                              ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
                              : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                          </button>
                          {/* Expanded: show player rankings for this course */}
                          {isExpanded && (
                            <div className="border-t px-3 pb-3">
                              {rankings.length === 0 ? (
                                <p className="text-sm text-muted-foreground py-2">
                                  {t('noTimeRecorded')}
                                </p>
                              ) : (
                                <Table>
                                  <TableHeader>
                                    <TableRow>
                                      <TableHead className="w-12">{t('rank')}</TableHead>
                                      <TableHead>{tc('player')}</TableHead>
                                      <TableHead className="text-right">{t('time')}</TableHead>
                                      <TableHead className="text-right">{t('courseScore')}</TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {rankings.map((entry, idx) => (
                                      <TableRow key={entry.id}>
                                        <TableCell className="font-bold">
                                          {idx + 1}
                                        </TableCell>
                                        <TableCell className="font-medium">
                                          {entry.player.nickname}
                                        </TableCell>
                                        <TableCell className="text-right font-mono">
                                          {entry.times![course.abbr]}
                                        </TableCell>
                                        <TableCell className="text-right font-mono text-muted-foreground">
                                          {entry.courseScores?.[course.abbr]?.toFixed(1) ?? "-"}
                                        </TableCell>
                                      </TableRow>
                                    ))}
                                  </TableBody>
                                </Table>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}


{/* Time Entry Dialog: visible for admins (any entry) and players (own entry).
       * The dialog is opened via openTimeEntryDialog() which is only callable
       * through the canEditEntry() gated "Edit Times" button. */}
      {canEditAnyEntry && <Dialog
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
              {CUP_NAMES.map((cup) => (
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
                          placeholder="M:SS.mm"
                          value={timeInputs[course.abbr] || ""}
                          onChange={(e) =>
                            handleTimeChange(course.abbr, e.target.value)
                          }
                          onBlur={() => handleTimeBlur(course.abbr)}
                          className="font-mono text-sm"
                        />
                      </div>
                    ))}
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
          
          {/* Development-only: Fill random times button (admin only) */}
          {isDevelopment && isAdmin && (
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

      {/* View Times Dialog: read-only view of a player's times.
       *  Opened by the "View Times" button for entries the user cannot edit.
       *  Same layout as the edit dialog but displays text instead of inputs. */}
      <Dialog
        open={isViewTimesDialogOpen}
        onOpenChange={setIsViewTimesDialogOpen}
      >
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {t('viewTimesFor', { nickname: viewEntry?.player.nickname ?? '' })}
            </DialogTitle>
          </DialogHeader>
          <div className="py-4">
            {/* Course times displayed as read-only text, organized by cup */}
            <div className="grid grid-cols-2 gap-4">
              {CUP_NAMES.map((cup) => (
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
                        <span className="w-12 text-xs font-mono text-muted-foreground">
                          {course.abbr}
                        </span>
                        <span className="font-mono text-sm">
                          {viewEntry?.times?.[course.abbr] || t('noTimeRecorded')}
                        </span>
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
              onClick={() => setIsViewTimesDialogOpen(false)}
            >
              {tc('close')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
