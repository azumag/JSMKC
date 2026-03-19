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
// eslint-disable-next-line -- auto-retry for Workers 1101
import { fetchWithRetry } from "@/lib/fetch-with-retry";

import { useState, useCallback, use } from "react";
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
import { POLLING_INTERVAL } from "@/lib/constants";
import { extractArrayData } from "@/lib/api-response";
import { usePolling } from "@/lib/hooks/usePolling";
import { UpdateIndicator } from "@/components/ui/update-indicator";
import { CardSkeleton } from "@/components/ui/loading-skeleton";
import { createLogger } from "@/lib/client-logger";

/** Client-side logger for error tracking */
const logger = createLogger({ serviceName: 'tournaments-bm' });

/** Player data structure */
interface Player {
  id: string;
  name: string;
  nickname: string;
}

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
  const [groupCount, setGroupCount] = useState(3);
  const [setupSaving, setSetupSaving] = useState(false);
  /* State for score entry dialog */
  const [isScoreDialogOpen, setIsScoreDialogOpen] = useState(false);
  const [selectedMatch, setSelectedMatch] = useState<BMMatch | null>(null);
  const [scoreForm, setScoreForm] = useState({ score1: 0, score2: 0 });

  /* State for CSV export */
  const [exporting, setExporting] = useState(false);

  /**
   * Fetch both BM qualification data and all players in parallel.
   * This is the polling function called at the standard interval for live updates.
   */
  const fetchTournamentData = useCallback(async () => {
    const [bmResponse, playersResponse] = await Promise.all([
      fetchWithRetry(`/api/tournaments/${tournamentId}/bm`),
      fetchWithRetry("/api/players"),
    ]);

    if (!bmResponse.ok) {
      throw new Error(`Failed to fetch BM data: ${bmResponse.status}`);
    }

    if (!playersResponse.ok) {
      throw new Error(`Failed to fetch players: ${playersResponse.status}`);
    }

    const bmData = await bmResponse.json();
    const playersJson = await playersResponse.json();

    return {
      qualifications: bmData.qualifications || [],
      matches: bmData.matches || [],
      allPlayers: extractArrayData<Player>(playersJson),
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

  /**
   * Handle group setup submission.
   * Sends the player-group assignments to the API which generates
   * round-robin matches for each group.
   */
  const handleSetup = async () => {
    if (setupPlayers.length === 0) {
      alert(tc('addAtLeastOnePlayer'));
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
        /* Show server error to admin so they know why setup failed */
        const errorData = await response.json().catch(() => ({}));
        const msg = errorData.error || `Setup failed (${response.status})`;
        alert(msg);
      }
    } catch (err) {
      logger.error("Failed to setup:", { error: err, tournamentId });
      alert(tc('networkError') ?? 'Network error — please try again');
    } finally {
      setSetupSaving(false);
    }
  };

  /**
   * Handle score submission for a match.
   * Sends score data via PUT which also recalculates player standings.
   */
  const handleScoreSubmit = async () => {
    if (!selectedMatch) return;

    /* Client-side validation: BM qualification requires exactly 4 rounds */
    if (scoreForm.score1 + scoreForm.score2 !== 4) {
      alert(tc('totalRoundsShouldEqual4'));
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

  /**
   * Handle TV number assignment for a match.
   * Calls the PATCH endpoint to update the match's broadcast TV assignment.
   */
  const handleTvAssign = async (matchId: string, tvNumber: number | null) => {
    try {
      await fetch(`/api/tournaments/${tournamentId}/bm`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matchId, tvNumber }),
      });
      refetch();
    } catch (err) {
      logger.error("Failed to assign TV:", { error: err, tournamentId, matchId });
    }
  };

  /** Open the score entry dialog pre-populated with existing scores */
  const openScoreDialog = (match: BMMatch) => {
    setSelectedMatch(match);
    setScoreForm({ score1: match.score1, score2: match.score2 });
    setIsScoreDialogOpen(true);
  };

  /**
   * Handle CSV/Excel export.
   * Downloads the export file via the BM export API endpoint.
   * Creates a temporary link element to trigger the browser download.
   */
  const handleExport = async () => {
    setExporting(true);
    try {
      const response = await fetch(`/api/tournaments/${tournamentId}/bm/export`);
      if (!response.ok) {
        throw new Error("Failed to export data");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `battle-mode-${new Date().toISOString().split("T")[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      logger.error("Failed to export:", { error: err, tournamentId });
    } finally {
      setExporting(false);
    }
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
          <div className="mt-2">
            <UpdateIndicator lastUpdated={lastUpdated} isPolling={isPolling} />
          </div>
        </div>
        <div className="flex gap-2">
          {/* Player score entry link — visible to all users */}
          <Button variant="outline" asChild>
            <Link href={`/tournaments/${tournamentId}/bm/participant`}>
              {tc('enterScore')}
            </Link>
          </Button>

          {/* Admin-only export button */}
          {isAdmin && (
            <Button
              variant="outline"
              onClick={handleExport}
              disabled={exporting}
            >
              {exporting ? tc('exporting') : tc('exportToExcel')}
            </Button>
          )}

          {/* Link to finals page (only shown when ALL qualification matches are completed) */}
          {qualifications.length > 0 &&
           matches.length > 0 &&
           matches.every((m) => m.completed) && (
            <Button asChild>
              <Link href={`/tournaments/${tournamentId}/bm/finals`}>
                {tc('goToFinals')}
              </Link>
            </Button>
          )}

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
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-12">#</TableHead>
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
                        {qualifications
                          .filter((q) => q.group === group)
                          .sort((a, b) => b.score - a.score || b.points - a.points)
                          .map((q, index) => (
                            <TableRow key={q.id}>
                              <TableCell>{index + 1}</TableCell>
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
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          {/* Matches Tab - Day-grouped match list with TV# assignment and BYE styling */}
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
                   * Group matches by roundNumber (Day) for circle-method display.
                   * Falls back to a flat list when roundNumber is not set (legacy data).
                   */
                  const hasRoundNumbers = matches.some((m) => m.roundNumber != null);
                  const matchesByDay = hasRoundNumbers
                    ? matches.reduce<Record<number, BMMatch[]>>((acc, m) => {
                        const day = m.roundNumber ?? 0;
                        if (!acc[day]) acc[day] = [];
                        acc[day].push(m);
                        return acc;
                      }, {})
                    : { 0: matches };
                  const sortedDays = Object.keys(matchesByDay)
                    .map(Number)
                    .sort((a, b) => a - b);

                  return (
                    <div className="space-y-6">
                      {sortedDays.map((day) => (
                        <div key={day}>
                          {/* Day header (only shown when round-robin scheduling is active) */}
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
                                        : "- - -"}
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
                                  {/* TV# assignment: admin can select TV number, others see read-only */}
                                  <TableCell className="text-center">
                                    {isAdmin && !match.isBye ? (
                                      <select
                                        className="w-14 h-8 text-center text-sm border rounded bg-background"
                                        value={match.tvNumber ?? ""}
                                        onChange={(e) => {
                                          const val = e.target.value;
                                          handleTvAssign(match.id, val ? parseInt(val) : null);
                                        }}
                                      >
                                        <option value="">-</option>
                                        <option value="1">1</option>
                                        <option value="2">2</option>
                                      </select>
                                    ) : (
                                      match.tvNumber ? `${match.tvNumber}` : "-"
                                    )}
                                  </TableCell>
                                  <TableCell className="text-right space-x-2">
                                    {/* Share link (not for BYE matches) */}
                                    {!match.isBye && (
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        asChild
                                      >
                                        <Link href={`/tournaments/${tournamentId}/bm/match/${match.id}`}>
                                          {tc('share')}
                                        </Link>
                                      </Button>
                                    )}
                                    {/* Admin-only score entry/edit button (not for BYE matches) */}
                                    {isAdmin && !match.isBye && (
                                      <Button
                                        variant={match.completed ? "outline" : "default"}
                                        size="sm"
                                        onClick={() => openScoreDialog(match)}
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
        <DialogContent>
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
              <div className="text-center">
                <Label>{selectedMatch?.player1.nickname}</Label>
                <Input
                  type="number"
                  min={0}
                  max={4}
                  value={scoreForm.score1}
                  onChange={(e) =>
                    setScoreForm({
                      ...scoreForm,
                      score1: parseInt(e.target.value) || 0,
                    })
                  }
                  className="w-20 text-center text-2xl"
                />
              </div>
              <span className="text-2xl">-</span>
              {/* Player 2 score input */}
              <div className="text-center">
                <Label>{selectedMatch?.player2.nickname}</Label>
                <Input
                  type="number"
                  min={0}
                  max={4}
                  value={scoreForm.score2}
                  onChange={(e) =>
                    setScoreForm({
                      ...scoreForm,
                      score2: parseInt(e.target.value) || 0,
                    })
                  }
                  className="w-20 text-center text-2xl"
                />
              </div>
            </div>
            {/* Validation warning when total rounds != 4 */}
            {scoreForm.score1 + scoreForm.score2 !== 4 && (
              <p className="text-sm text-yellow-600 text-center">
                {tc('totalRoundsShouldEqual4')}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button onClick={handleScoreSubmit}>{tc('saveScore')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
