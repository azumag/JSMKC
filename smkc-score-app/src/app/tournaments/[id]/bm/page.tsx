/**
 * Battle Mode Qualification Page
 *
 * Main page for managing BM qualification rounds within a tournament.
 * Displays group standings and match lists with admin controls for:
 * - Setting up groups (assigning players to groups A, B, C)
 * - Entering match scores
 * - Exporting data to Excel/CSV
 * - Navigating to finals bracket
 *
 * Features:
 * - Real-time polling for live tournament updates
 * - Tabbed view switching between Standings and Matches
 * - Admin-only controls gated by session role
 * - Score entry dialog for individual matches
 * - Loading skeleton for initial page load
 *
 * Data flow:
 * - Fetches BM qualification data + all players via usePolling hook
 * - Standings are displayed per-group, sorted by score then point differential
 * - Matches show completion status and allow score entry/editing
 */

"use client";
import { fetchWithRetry } from "@/lib/fetch-with-retry";

import { useState, useCallback, useEffect, use } from "react";
import { useTranslations } from "next-intl";
import { useSession } from "next-auth/react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { GroupSetupDialog } from "@/components/tournament/group-setup-dialog";
import { ModePublishSwitch } from "@/components/tournament/mode-publish-switch";
import { QualificationPlayoffManager } from "@/components/tournament/qualification-playoff-manager";
import { RankCell } from "@/components/tournament/rank-cell";
import { TieWarningBanner } from "@/components/tournament/tie-warning-banner";
import {
  buildPlayoffRankAssignments,
  collectPlayoffGroups,
  computeTieAwareRanks,
  filterActiveTiedIds,
  findUnresolvedTies,
} from "@/lib/ranking-utils";
import { POLLING_INTERVAL, TV_NUMBER_OPTIONS } from "@/lib/constants";
import { extractArrayData } from "@/lib/api-response";
import { usePolling } from "@/lib/hooks/usePolling";
import { useQualificationActions } from "@/lib/hooks/useQualificationActions";
import { UpdateIndicator } from "@/components/ui/update-indicator";
import { CardSkeleton } from "@/components/ui/loading-skeleton";
import { createLogger } from "@/lib/client-logger";
import { parseManualScore } from "@/lib/parse-manual-score";
import { canCreateFinalsFromQualification } from "@/lib/finals-action-availability";
import type { Player } from "@/lib/types";

/** Client-side logger for error tracking */
const logger = createLogger({ serviceName: 'tournaments-bm' });

/** BM Qualification record with player stats and group assignment */
interface BMQualification {
  id: string;
  playerId: string;
  group: string;
  seeding: number | null;
  mp: number;        // Matches played
  wins: number;      // Match wins (3+ rounds won)
  ties: number;      // Match ties (2-2 split)
  losses: number;    // Match losses
  winRounds: number; // Total rounds won
  lossRounds: number; // Total rounds lost
  points: number;    // Round differential (winRounds - lossRounds)
  score: number;     // Match points (wins*2 + ties)
  rankOverride: number | null; // 管理者手動順位 (null = 自動計算)
  player: Player;
}

/** BM Match record with player relations */
interface BMMatch {
  id: string;
  matchNumber: number;
  roundNumber?: number;  // サークル方式のDay番号
  isBye?: boolean;       // BREAK不戦勝マッチ
  tvNumber?: number;     // 配信台番号
  player1Id: string;
  player2Id: string;
  player1Side: number;
  player2Side: number;
  score1: number;
  score2: number;
  completed: boolean;
  player1ReportedScore1?: number | null;
  player1ReportedScore2?: number | null;
  player2ReportedScore1?: number | null;
  player2ReportedScore2?: number | null;
  player1: Player;
  player2: Player;
}

/**
 * Battle Mode qualification page component.
 * Uses React 19's `use()` hook to unwrap the async params.
 */
export default function BattleModePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: tournamentId } = use(params);
  const t = useTranslations('bm');
  const tc = useTranslations('common');
  const { data: session } = useSession();
  /* Check admin role for conditional UI rendering */
  const isAdmin = session?.user && session.user.role === 'admin';

  /* State for group setup dialog */
  const [isSetupDialogOpen, setIsSetupDialogOpen] = useState(false);
  const [setupPlayers, setSetupPlayers] = useState<
    { playerId: string; group: string; seeding?: number }[]
  >([]);
  /* Product default: 2 groups (§10.2). */
  const [groupCount, setGroupCount] = useState(2);
  const [setupSaving, setSetupSaving] = useState(false);
  /* State for match filters */
  const [matchGroupFilter, setMatchGroupFilter] = useState<string>("all");
  const [matchPlayerFilter, setMatchPlayerFilter] = useState<string>("all");
  /* State for score entry dialog */
  const [isScoreDialogOpen, setIsScoreDialogOpen] = useState(false);
  const [selectedMatch, setSelectedMatch] = useState<BMMatch | null>(null);
  const [scoreForm, setScoreForm] = useState({ score1: 0, score2: 0 });
  /* Loading state for bracket generation buttons */
  const [generatingBracket, setGeneratingBracket] = useState(false);
  const [resettingBracket, setResettingBracket] = useState(false);
  /* Whether a finals or playoff bracket already exists on the server */
  const [finalsExists, setFinalsExists] = useState<boolean | undefined>(undefined);
  /* Track which match ID is currently being broadcast to prevent double-clicks */
  const [broadcastingMatchId, setBroadcastingMatchId] = useState<string | null>(null);
  /* Optimistic TV overrides: applied immediately on dropdown change, confirmed by next poll */
  const [tvOverrides, setTvOverrides] = useState<Record<string, number | null>>({});

  /**
   * Fetch both BM qualification data and all players in parallel.
   * This is the polling function called at the standard interval for live updates.
   */
  const fetchTournamentData = useCallback(async () => {
    const [bmResponse, playersResponse] = await Promise.all([
      fetchWithRetry(`/api/tournaments/${tournamentId}/bm`),
      /* limit=100 (API cap) avoids truncating the Setup dialog player list — see ta/page.tsx for rationale. */
      fetchWithRetry("/api/players?limit=100"),
    ]);

    if (!bmResponse.ok) {
      throw new Error(`Failed to fetch BM data: ${bmResponse.status}`);
    }

    if (!playersResponse.ok) {
      throw new Error(`Failed to fetch players: ${playersResponse.status}`);
    }

    const bmJson = await bmResponse.json();
    const bmData = bmJson.data ?? bmJson;
    const playersJson = await playersResponse.json();

    return {
      qualifications: bmData.qualifications || [],
      matches: bmData.matches || [],
      allPlayers: extractArrayData<Player>(playersJson),
      qualificationConfirmed: bmData.qualificationConfirmed ?? false,
    };
  }, [tournamentId]);

  /*
   * Set up polling at the standard interval for real-time updates.
   * cacheKey enables cross-mount data persistence: when navigating away
   * from this tab and back, cached data is shown instantly without
   * a loading skeleton flash.
   */
  const { data: pollData, error: pollError, lastUpdated, isPolling, refetch } = usePolling(
    fetchTournamentData, {
    interval: POLLING_INTERVAL,
    cacheKey: `tournament/${tournamentId}/bm`,
  });

  /*
   * Derive display data directly from polling response.
   * This avoids redundant local state and ensures data is available
   * immediately when restored from cache on tab re-entry.
   */
  const qualifications: BMQualification[] = pollData?.qualifications ?? [];
  const matches: BMMatch[] = pollData?.matches ?? [];
  const allPlayers: Player[] = pollData?.allPlayers ?? [];
  /* Whether qualification scores are locked by admin confirmation */
  const qualificationConfirmed: boolean = pollData?.qualificationConfirmed ?? false;
  const canCreateFinals = canCreateFinalsFromQualification({
    qualificationConfirmed,
    qualificationCount: qualifications.length,
    matchCount: matches.length,
    allMatchesCompleted: matches.every((m) => m.completed),
  });

  /**
   * On mount, check whether a finals or playoff bracket already exists
   * so the qualification page can show "Tournament View" instead of
   * "Generate Bracket" when the admin returns after creation.
   */
  useEffect(() => {
    let cancelled = false;
    async function checkFinals() {
      try {
        const res = await fetch(`/api/tournaments/${tournamentId}/bm/finals`);
        if (!res.ok) return;
        const json = await res.json();
        const data = json.data ?? json;
        const hasFinals = (data.matches?.length ?? 0) > 0;
        const hasPlayoff = (data.playoffMatches?.length ?? 0) > 0;
        if (!cancelled) setFinalsExists(hasFinals || hasPlayoff);
      } catch {
        // Silently ignore — the button will default to "Generate" on error
      }
    }
    checkFinals();
    return () => { cancelled = true; };
  }, [tournamentId]);

  /* Clear tvOverrides for matches where the API has caught up to the optimistic value */
  useEffect(() => {
    if (!pollData) return;
    setTvOverrides((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const match of (pollData.matches ?? [])) {
        if (match.id in next && next[match.id] === match.tvNumber) {
          delete next[match.id];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [pollData]);

  /* Shared handlers for rank override, TV assignment, and broadcast reflect */
  const { handleRankOverrideSave, handleBulkRankOverrideSave, handleTvAssign, handleBroadcastReflect } =
    useQualificationActions({ tournamentId, mode: "bm", refetch });

  /**
   * Handle group setup submission.
   * Sends the player-group assignments to the API which generates
   * round-robin matches for each group.
   */
  const handleSetup = async () => {
    if (setupPlayers.length === 0) {
      /* No players to save — close dialog (user cancelled or form was empty) */
      setIsSetupDialogOpen(false);
      return;
    }

    setSetupSaving(true);
    try {
      const response = await fetch(`/api/tournaments/${tournamentId}/bm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ players: setupPlayers }),
      });

      if (response.ok) {
        setIsSetupDialogOpen(false);
        setSetupPlayers([]);
        refetch();
      } else {
        /* Show server error to admin so they know why setup failed.
         * Close dialog even on error — user can reopen to retry. */
        setIsSetupDialogOpen(false);
        const errorData = await response.json().catch(() => ({}));
        const msg = errorData.error || `Setup failed (${response.status})`;
        alert(msg);
      }
    } catch (err) {
      logger.error("Failed to setup:", { error: err, tournamentId });
      setIsSetupDialogOpen(false);
      alert(tc('networkError') ?? 'Network error — please try again');
    } finally {
      setSetupSaving(false);
    }
  };

  /**
   * Toggle qualification confirmed state.
   * When confirmed, all score edits (admin and player) are locked.
   */
  const handleToggleQualificationConfirmed = async () => {
    const newValue = !qualificationConfirmed;
    /* Require explicit confirmation before locking */
    if (newValue && !confirm(tc('confirmQualificationDialog'))) return;

    try {
      const response = await fetch(`/api/tournaments/${tournamentId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ qualificationConfirmed: newValue }),
      });
      if (response.ok) {
        refetch();
      } else {
        const errorData = await response.json().catch(() => ({}));
        alert(errorData.error || 'Failed to update qualification status');
      }
    } catch (err) {
      logger.error('Failed to toggle qualification confirmed', { error: err, tournamentId });
    }
  };

  /**
   * Handle score submission for a match.
   * Sends score data via PUT which also recalculates player standings.
   */
  const handleScoreSubmit = async () => {
    if (!selectedMatch) return;

    /* Client-side validation: BM qualification requires sum === 4 for normal matches,
     * or 0-0 for disputed/no-show match clearing. */
    const isNormalMatch = scoreForm.score1 + scoreForm.score2 === 4;
    const isClearedMatch = scoreForm.score1 === 0 && scoreForm.score2 === 0;
    if (!isNormalMatch && !isClearedMatch) {
      alert(tc('totalRoundsMustBe4Or0'));
      return;
    }

    try {
      const response = await fetch(`/api/tournaments/${tournamentId}/bm`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          matchId: selectedMatch.id,
          score1: scoreForm.score1,
          score2: scoreForm.score2,
        }),
      });

      if (response.ok) {
        setIsScoreDialogOpen(false);
        setSelectedMatch(null);
        setScoreForm({ score1: 0, score2: 0 });
        refetch();
      }
    } catch (err) {
      logger.error("Failed to update score:", { error: err, tournamentId });
    }
  };

  /** Open the score entry dialog pre-populated with existing scores */
  const openScoreDialog = (match: BMMatch) => {
    setSelectedMatch(match);
    setScoreForm({ score1: match.score1, score2: match.score2 });
    setIsScoreDialogOpen(true);
  };

  /* Extract unique group names for tabbed display */
  const groups = [...new Set(qualifications.map((q) => q.group))].sort();

  /* Show error state if the first fetch fails and there's no cached data.
     Without this check, a network error would show a permanent skeleton. */
  if (!pollData && pollError) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold">{t('title')}</h1>
        <div className="text-center py-8">
          <p className="text-destructive mb-4">{pollError}</p>
          <Button onClick={refetch}>{tc('retry')}</Button>
        </div>
      </div>
    );
  }

  /* Loading skeleton shown only on first visit (no cached data yet) */
  if (!pollData) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4">
          <div className="space-y-3">
            <div className="h-9 w-32 bg-muted animate-pulse rounded" />
            <div className="h-5 w-48 bg-muted animate-pulse rounded" />
          </div>
          <div className="h-10 w-24 bg-muted animate-pulse rounded" />
        </div>
        <CardSkeleton />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page header with title, polling indicator, and action buttons */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4">
        <div>
          <h1 className="text-3xl font-bold">{t('title')}</h1>
          <p className="text-muted-foreground">
            {t('qualificationDesc')}
          </p>
          <div className="mt-2 flex items-center gap-2">
            <UpdateIndicator lastUpdated={lastUpdated} isPolling={isPolling} />
            {qualificationConfirmed && (
              <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">
                {tc('qualificationConfirmed')}
              </span>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          {/* Player score entry link — visible to all users */}
          <Button variant="outline" asChild>
            <Link href={`/tournaments/${tournamentId}/bm/participant`}>
              {tc('enterScore')}
            </Link>
          </Button>

          {/* Admin-only qualification confirmation toggle */}
          {isAdmin && qualifications.length > 0 && (
            <Button
              variant={qualificationConfirmed ? "destructive" : "outline"}
              onClick={handleToggleQualificationConfirmed}
            >
              {qualificationConfirmed ? tc('unconfirmQualification') : tc('confirmQualification')}
            </Button>
          )}

          {/* Admin-only bracket reset — visible only when a bracket exists */}
          {isAdmin && finalsExists === true && (
            <Button
              variant="destructive"
              disabled={resettingBracket}
              onClick={async () => {
                if (!confirm(tc('resetBracketConfirm'))) return;
                setResettingBracket(true);
                try {
                  const res = await fetch(`/api/tournaments/${tournamentId}/bm/finals`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ reset: true }),
                  });
                  if (!res.ok) {
                    const err = await res.json().catch(() => ({}));
                    alert(err.error || tc('failedResetBracket'));
                    return;
                  }
                  setFinalsExists(false);
                } finally {
                  setResettingBracket(false);
                }
              }}
            >
              {resettingBracket ? tc('resettingBracket') : tc('resetBracket')}
            </Button>
          )}

          {/* Finals / Playoff bracket action button.
           *  - If bracket already exists: shows "View Tournament" link.
           *  - Otherwise: generates bracket (Top-24 playoff or Top-16 finals)
           *    and then switches to the link state. */
          }
          {finalsExists === true ? (
            <Button variant="outline" asChild>
              <Link href={`/tournaments/${tournamentId}/bm/finals`}>
                {tc('viewTournament')}
              </Link>
            </Button>
          ) : canCreateFinals ? (
            <Button
              disabled={generatingBracket || finalsExists === undefined}
              onClick={async () => {
                setGeneratingBracket(true);
                try {
                  const needsPlayoff = qualifications.length > 16;
                  const topN = needsPlayoff ? 24 : 16;
                  const res = await fetch(`/api/tournaments/${tournamentId}/bm/finals`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ topN }),
                  });
                  if (!res.ok) {
                    const err = await res.json().catch(() => ({}));
                    alert(err.error || tc('failedGenerateBracket'));
                    return;
                  }
                  setFinalsExists(true);
                } finally {
                  setGeneratingBracket(false);
                }
              }}
            >
              {generatingBracket
                ? tc('generatingBracket')
                : qualifications.length > 16
                  ? tc('startPlayoff')
                  : tc('generateFinalsBracket')}
            </Button>
          ) : null}

          {/* Admin-only group setup/edit dialog (uses shared GroupSetupDialog component) */}
          {isAdmin && (
            <GroupSetupDialog
              mode="bm"
              allPlayers={allPlayers}
              setupPlayers={setupPlayers}
              setSetupPlayers={setSetupPlayers}
              isOpen={isSetupDialogOpen}
              setIsOpen={setIsSetupDialogOpen}
              onSave={handleSetup}
              saving={setupSaving}
              existingAssignments={qualifications.map((q) => ({
                playerId: q.playerId,
                group: q.group,
                seeding: q.seeding ?? undefined,
              }))}
              groupCount={groupCount}
              setGroupCount={setGroupCount}
            />
          )}

          {/* Per-mode independent publish toggle (issue #618) */}
          {isAdmin && (
            <ModePublishSwitch
              tournamentId={tournamentId}
              mode="bm"
              modeLabelKey="battleMode"
            />
          )}

        </div>
      </div>

      {/* Main content area - empty state or tabbed view */}
      {qualifications.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            {isAdmin ? t('noGroupsYet') : t('noGroupsYetViewer')}
          </CardContent>
        </Card>
      ) : (
        <Tabs defaultValue="standings" className="space-y-4">
          <TabsList>
            <TabsTrigger value="standings">{tc('standings')}</TabsTrigger>
            <TabsTrigger value="matches">{tc('matches')}</TabsTrigger>
          </TabsList>

          {/* Standings Tab - Group-by-group qualification standings */}
          <TabsContent value="standings">
            <div className="grid gap-6">
              {groups.map((group) => (
                <Card key={group}>
                  <CardHeader>
                    <CardTitle>{tc('groupLabel', { group })}</CardTitle>
                    <CardDescription>
                      {tc('playersCount', { count: qualifications.filter((q) => q.group === group).length })}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {(() => {
                      /*
                       * Compute tie-aware 1224 competition ranks for this group.
                       * computeTieAwareRanks assigns the same _autoRank to tied entries
                       * (equal score + points) and sorts by effective rank (override ?? autoRank).
                       * findUnresolvedTies returns IDs of entries in ties where not all
                       * members have a rankOverride — used for yellow row highlighting and banner.
                       */
                      const groupEntries = qualifications.filter((q) => q.group === group);
                      const byEffectiveRank = computeTieAwareRanks(
                        groupEntries,
                        (a, b) => b.score - a.score || b.points - a.points
                      );
                      const tiedIds = findUnresolvedTies(byEffectiveRank);
                      // Suppress trivial 0-0 ties: only flag players who have actually played.
                      const activeTiedIds = filterActiveTiedIds(tiedIds, groupEntries);
                      const playoffGroups = collectPlayoffGroups(byEffectiveRank, activeTiedIds).map((entries) => ({
                        id: `${group}-${entries[0]?._autoRank ?? 0}`,
                        rank: entries[0]?._autoRank ?? 0,
                        players: entries.map((entry) => ({
                          id: entry.id,
                          nickname: entry.player.nickname,
                          _autoRank: entry._autoRank,
                          rankOverride: entry.rankOverride,
                        })),
                      }));
                      return (
                        <>
                          <TieWarningBanner hasTies={activeTiedIds.size > 0} isAdmin={!!isAdmin} />
                          <QualificationPlayoffManager
                            groups={playoffGroups}
                            isAdmin={!!isAdmin}
                            onSave={async (entries) =>
                              handleBulkRankOverrideSave(
                                buildPlayoffRankAssignments(entries).map((entry) => ({
                                  qualificationId: entry.id,
                                  rankOverride: entry.rankOverride,
                                })),
                              )
                            }
                            onBroadcast={handleBroadcastReflect}
                          />
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead className="w-16">#</TableHead>
                                <TableHead>{tc('player')}</TableHead>
                                <TableHead className="text-center">{t('mp')}</TableHead>
                                <TableHead className="text-center">{t('w')}</TableHead>
                                <TableHead className="text-center">{t('t')}</TableHead>
                                <TableHead className="text-center">{t('l')}</TableHead>
                                <TableHead className="text-center">{t('plusMinus')}</TableHead>
                                <TableHead className="text-center">{t('pts')}</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {byEffectiveRank.map((q) => (
                                <TableRow
                                  key={q.id}
                                  className={activeTiedIds.has(q.id) ? "bg-yellow-50" : undefined}
                                >
                                  {/* RankCell handles amber badge display and inline admin editing */}
                                  <TableCell>
                                    <RankCell
                                      qualificationId={q.id}
                                      rankOverride={q.rankOverride}
                                      autoRank={q._autoRank}
                                      isAdmin={!!isAdmin}
                                      onSave={handleRankOverrideSave}
                                    />
                                  </TableCell>
                                  <TableCell className="font-medium">
                                    {q.player.nickname}
                                  </TableCell>
                                  <TableCell className="text-center">{q.mp}</TableCell>
                                  <TableCell className="text-center">{q.wins}</TableCell>
                                  <TableCell className="text-center">{q.ties}</TableCell>
                                  <TableCell className="text-center">{q.losses}</TableCell>
                                  <TableCell className="text-center">
                                    {q.points > 0 ? `+${q.points}` : q.points}
                                  </TableCell>
                                  <TableCell className="text-center font-bold">
                                    {q.score}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </>
                      );
                    })()}
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          {/* Matches Tab - Group-filtered, round-grouped match list */}
          <TabsContent value="matches">
            <Card>
              <CardHeader>
                <CardTitle>{tc('matchList')}</CardTitle>
                <CardDescription>
                  {tc('completedOf', {
                    completed: matches.filter((m) => m.completed).length,
                    total: matches.filter((m) => !m.isBye).length,
                  })}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {(() => {
                  /*
                   * Build player→group lookup from qualification data.
                   * Used to determine which group each match belongs to
                   * (the match model doesn't store group directly).
                   */
                  const playerGroupMap = new Map<string, string>();
                  for (const q of qualifications) {
                    playerGroupMap.set(q.playerId, q.group);
                  }

                  /*
                   * Group filter state is managed via URL-free local state.
                   * "all" shows every match; "A", "B", etc. filter by group.
                   */
                  const getMatchGroup = (m: BMMatch): string | undefined =>
                    playerGroupMap.get(m.player1Id) ?? playerGroupMap.get(m.player2Id);

                  /* Apply group filter, then player filter */
                  let filteredMatches = matchGroupFilter === "all"
                    ? matches
                    : matches.filter((m) => getMatchGroup(m) === matchGroupFilter);
                  if (matchPlayerFilter !== "all") {
                    filteredMatches = filteredMatches.filter(
                      (m) => m.player1Id === matchPlayerFilter || m.player2Id === matchPlayerFilter
                    );
                  }

                  /* Build list of players in the current group filter for the player dropdown */
                  const playersInScope = matchGroupFilter === "all"
                    ? qualifications
                    : qualifications.filter((q) => q.group === matchGroupFilter);
                  const playerOptions = playersInScope
                    .map((q) => ({ id: q.playerId, nickname: q.player.nickname }))
                    .sort((a, b) => a.nickname.localeCompare(b.nickname));

                  /*
                   * Group matches by roundNumber for circle-method display.
                   * Falls back to a flat list when roundNumber is not set (legacy data).
                   */
                  const hasRoundNumbers = filteredMatches.some((m) => m.roundNumber != null);
                  const matchesByDay = hasRoundNumbers
                    ? filteredMatches.reduce<Record<number, BMMatch[]>>((acc, m) => {
                        const day = m.roundNumber ?? 0;
                        if (!acc[day]) acc[day] = [];
                        acc[day].push(m);
                        return acc;
                      }, {})
                    : { 0: filteredMatches };
                  const sortedDays = Object.keys(matchesByDay)
                    .map(Number)
                    .sort((a, b) => a - b);

                  return (
                    <div className="space-y-6">
                      {/* Match filters: group buttons + player dropdown */}
                      <div className="flex flex-col sm:flex-row gap-3">
                        {/* Group filter buttons */}
                        {groups.length > 1 && (
                          <div className="flex gap-2 flex-wrap">
                            <Button
                              variant={matchGroupFilter === "all" ? "default" : "outline"}
                              size="sm"
                              onClick={() => { setMatchGroupFilter("all"); setMatchPlayerFilter("all"); }}
                            >
                              {tc('allGroups')}
                            </Button>
                            {groups.map((g) => (
                              <Button
                                key={g}
                                variant={matchGroupFilter === g ? "default" : "outline"}
                                size="sm"
                                onClick={() => { setMatchGroupFilter(g); setMatchPlayerFilter("all"); }}
                              >
                                {tc('groupLabel', { group: g })}
                              </Button>
                            ))}
                          </div>
                        )}
                        {/* Player filter dropdown */}
                        {playerOptions.length > 0 && (
                          <select
                            className="h-8 px-2 text-sm border rounded bg-background"
                            value={matchPlayerFilter}
                            onChange={(e) => setMatchPlayerFilter(e.target.value)}
                          >
                            <option value="all">{tc('allPlayers')}</option>
                            {playerOptions.map((p) => (
                              <option key={p.id} value={p.id}>{p.nickname}</option>
                            ))}
                          </select>
                        )}
                      </div>
                      {sortedDays.map((day) => (
                        <div key={day}>
                          {/* Round header (only shown when round-robin scheduling is active) */}
                          {hasRoundNumbers && day > 0 && (
                            <h3 className="font-semibold text-sm text-muted-foreground mb-2">
                              {tc('dayLabel', { day })}
                            </h3>
                          )}
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead className="w-16">#</TableHead>
                                <TableHead>{tc('player1')}</TableHead>
                                <TableHead className="text-center w-24">{tc('score')}</TableHead>
                                <TableHead>{tc('player2')}</TableHead>
                                {/* TV# column for broadcast assignment */}
                                <TableHead className="text-center w-16">{tc('tvNumber')}</TableHead>
                                <TableHead className="text-right">{tc('actions')}</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {matchesByDay[day].map((match) => (
                                <TableRow
                                  key={match.id}
                                  className={match.isBye ? "opacity-50 bg-muted/30" : ""}
                                >
                                  <TableCell>{match.matchNumber}</TableCell>
                                  <TableCell
                                    className={
                                      match.completed && match.score1 >= 3
                                        ? "font-bold"
                                        : ""
                                    }
                                  >
                                    {match.player1.nickname}
                                  </TableCell>
                                  <TableCell className="text-center font-mono">
                                    {match.isBye
                                      ? `${match.score1} - ${match.score2}`
                                      : match.completed
                                        ? `${match.score1} - ${match.score2}`
                                        : (() => {
                                            /* Report status indicators for pending matches:
                                               - Both reported (mismatch): yellow badge with both scores
                                               - One reported: blue text with reporter's score
                                               - None reported: dash */
                                            const p1r = match.player1ReportedScore1 != null;
                                            const p2r = match.player2ReportedScore1 != null;
                                            if (p1r && p2r) return (
                                              <span className="text-xs text-yellow-600" title={tc('mismatchTooltip')}>
                                                {match.player1ReportedScore1}-{match.player1ReportedScore2} / {match.player2ReportedScore1}-{match.player2ReportedScore2}
                                              </span>
                                            );
                                            if (p1r) return <span className="text-xs text-blue-500">({match.player1ReportedScore1}-{match.player1ReportedScore2})</span>;
                                            if (p2r) return <span className="text-xs text-blue-500">({match.player2ReportedScore1}-{match.player2ReportedScore2})</span>;
                                            return "- - -";
                                          })()}
                                  </TableCell>
                                  <TableCell
                                    className={
                                      !match.isBye && match.completed && match.score2 >= 3
                                        ? "font-bold"
                                        : ""
                                    }
                                  >
                                    {match.isBye ? tc('bye') : match.player2.nickname}
                                  </TableCell>
                                  {/* TV# assignment: admin can select TV number, others see read-only.
                                      Optimistic update: local state is updated immediately; API fires in background. */}
                                  <TableCell className="text-center">
                                    {isAdmin && !match.isBye ? (
                                      <select
                                        className="w-14 h-8 text-center text-sm border rounded bg-background"
                                        value={(match.id in tvOverrides ? tvOverrides[match.id] : match.tvNumber) ?? ""}
                                        onChange={(e) => {
                                          const val = e.target.value;
                                          const num = val ? parseInt(val) : null;
                                          setTvOverrides((prev) => ({ ...prev, [match.id]: num }));
                                          handleTvAssign(match.id, num);
                                        }}
                                      >
                                        <option value="">-</option>
                                        {TV_NUMBER_OPTIONS.map((tvNumber) => (
                                          <option key={tvNumber} value={tvNumber}>
                                            {tvNumber}
                                          </option>
                                        ))}
                                      </select>
                                    ) : (
                                      match.tvNumber ? `${match.tvNumber}` : "-"
                                    )}
                                  </TableCell>
                                  <TableCell className="text-right space-x-2">
                                    {/* Match detail link (not for BYE matches) */}
                                    {!match.isBye && (
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        asChild
                                      >
                                        <Link href={`/tournaments/${tournamentId}/bm/match/${match.id}`}>
                                          {tc('matchDetails')}
                                        </Link>
                                      </Button>
                                    )}
                                    {/* 配信に反映: admin pushes this match's players to the overlay */}
                                    {isAdmin && !match.isBye && (
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        disabled={broadcastingMatchId === match.id}
                                        onClick={async () => {
                                          setBroadcastingMatchId(match.id);
                                          await handleBroadcastReflect(match.player1.nickname, match.player2.nickname);
                                          setBroadcastingMatchId(null);
                                        }}
                                      >
                                        {broadcastingMatchId === match.id ? tc('saving') : tc('broadcastReflect')}
                                      </Button>
                                    )}
                                    {/* Admin-only score entry/edit button (not for BYE matches, locked when confirmed) */}
                                    {isAdmin && !match.isBye && (
                                      <Button
                                        variant={match.completed ? "outline" : "default"}
                                        size="sm"
                                        onClick={() => openScoreDialog(match)}
                                        disabled={qualificationConfirmed}
                                      >
                                        {match.completed ? tc('edit') : tc('enterScore')}
                                      </Button>
                                    )}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}

      {/* Score Entry Dialog - Admin interface for entering/editing match scores */}
      <Dialog open={isScoreDialogOpen} onOpenChange={setIsScoreDialogOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{t('enterMatchScore')}</DialogTitle>
            <DialogDescription>
              {selectedMatch && (
                <>
                  Match #{selectedMatch.matchNumber}:{" "}
                  {selectedMatch.player1.nickname} vs{" "}
                  {selectedMatch.player2.nickname}
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {/* §5.3 Character selection priority guidance */}
            {selectedMatch && (() => {
              /* Find previous completed match between the same two players */
              const p1 = selectedMatch.player1Id;
              const p2 = selectedMatch.player2Id;
              const prevMatch = matches
                .filter(m => m.completed && m.id !== selectedMatch.id &&
                  ((m.player1Id === p1 && m.player2Id === p2) || (m.player1Id === p2 && m.player2Id === p1)))
                .sort((a, b) => b.matchNumber - a.matchNumber)[0];
              if (!prevMatch) {
                return <p className="text-sm text-muted-foreground text-center">{tc('characterPriorityFirst')}</p>;
              }
              /* Determine who lost the previous match */
              const p1Score = prevMatch.player1Id === p1 ? prevMatch.score1 : prevMatch.score2;
              const p2Score = prevMatch.player1Id === p1 ? prevMatch.score2 : prevMatch.score1;
              const loserNickname = p1Score < p2Score ? selectedMatch.player1.nickname : selectedMatch.player2.nickname;
              return <p className="text-sm text-blue-600 text-center">{tc('characterPriority', { player: loserNickname })}</p>;
            })()}
            <div className="flex items-center justify-center gap-4">
              {/* Player 1 score input */}
              <div className="text-center min-w-0 max-w-[140px]">
                <Label htmlFor={`bm-score1-${selectedMatch?.id}`} className="block truncate w-full">{selectedMatch?.player1.nickname}</Label>
                <Input
                  id={`bm-score1-${selectedMatch?.id}`}
                  type="number"
                  min={0}
                  max={4}
                  value={scoreForm.score1}
                  onChange={(e) =>
                    /* Strict parse: reject "2.5"/"1e2" that parseInt would
                     * silently coerce into a valid-looking integer and pass
                     * the "sum === 4" check at submit. */
                    setScoreForm({
                      ...scoreForm,
                      score1: parseManualScore(e.target.value) ?? 0,
                    })
                  }
                  className="w-20 text-center text-2xl"
                  aria-label={`${selectedMatch?.player1.nickname} score`}
                />
              </div>
              <span className="text-2xl" aria-hidden="true">-</span>
              {/* Player 2 score input */}
              <div className="text-center min-w-0 max-w-[140px]">
                <Label htmlFor={`bm-score2-${selectedMatch?.id}`} className="block truncate w-full">{selectedMatch?.player2.nickname}</Label>
                <Input
                  id={`bm-score2-${selectedMatch?.id}`}
                  type="number"
                  min={0}
                  max={4}
                  value={scoreForm.score2}
                  onChange={(e) =>
                    setScoreForm({
                      ...scoreForm,
                      score2: parseManualScore(e.target.value) ?? 0,
                    })
                  }
                  className="w-20 text-center text-2xl"
                />
              </div>
            </div>
            {/* Validation warning when total rounds > 4.
               Always rendered to reserve vertical space and prevent layout shift. */}
            <p className={`text-sm text-center ${(scoreForm.score1 + scoreForm.score2 !== 4 && !(scoreForm.score1 === 0 && scoreForm.score2 === 0)) ? 'text-yellow-600' : 'invisible'}`}>
              {tc('totalRoundsMustBe4Or0')}
            </p>
          </div>
          <DialogFooter>
            <div className="flex w-full justify-between">
              <Button
                variant="outline"
                onClick={() => setScoreForm({ score1: 0, score2: 0 })}
              >
                {tc('clearScores')}
              </Button>
              <Button onClick={handleScoreSubmit}>{tc('saveScore')}</Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
