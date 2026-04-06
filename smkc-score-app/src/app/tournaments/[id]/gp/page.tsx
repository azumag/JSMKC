"use client";
import { fetchWithRetry } from "@/lib/fetch-with-retry";

/**
 * Grand Prix (GP) Qualification Page
 *
 * Admin page for managing GP qualification rounds.
 * GP uses cup-based races with driver points (1st=9, 2nd=6, 3rd=3, 4th=1).
 * Players compete in round-robin groups, and standings are
 * calculated by driver points (primary) with match score (wins×2 + ties×1) as tiebreaker.
 *
 * Features:
 * - Group standings display with sortable columns
 * - Match list with completion tracking
 * - Setup dialog for creating groups and round-robin matches
 * - Match result dialog with cup selection and race position entry
 * - CSV/Excel export
 * - Real-time polling at the standard interval
 * - Navigation to finals bracket
 */

import { useState, useCallback, use } from "react";
import { useSession } from "next-auth/react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { GroupSetupDialog } from "@/components/tournament/group-setup-dialog";
import { RankCell } from "@/components/tournament/rank-cell";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { COURSE_INFO, CUPS, CUP_SUBSTITUTIONS, GP_POSITION_OPTIONS, POLLING_INTERVAL, TOTAL_GP_RACES, getDriverPoints, type CourseAbbr } from "@/lib/constants";
import { extractArrayData } from "@/lib/api-response";
import { usePolling } from "@/lib/hooks/usePolling";
import { UpdateIndicator } from "@/components/ui/update-indicator";
import { CardSkeleton } from "@/components/ui/loading-skeleton";
import { createLogger } from "@/lib/client-logger";

const logger = createLogger({ serviceName: 'tournaments-gp' })

/** Player data from the API */
interface Player {
  id: string;
  name: string;
  nickname: string;
}

/** GP qualification standing entry with group assignment and stats */
interface GPQualification {
  id: string;
  playerId: string;
  group: string;
  seeding: number | null;
  mp: number;
  wins: number;
  ties: number;
  losses: number;
  points: number;
  score: number;
  rankOverride: number | null; // 管理者手動順位 (null = 自動計算)
  player: Player;
}

/** GP match with race details and player information */
interface GPMatch {
  id: string;
  version: number;
  matchNumber: number;
  roundNumber?: number;  // サークル方式のDay番号
  isBye?: boolean;       // BREAK不戦勝マッチ
  tvNumber?: number;     // 配信台番号
  player1Id: string;
  player2Id: string;
  player1Side: number;
  player2Side: number;
  points1: number;
  points2: number;
  completed: boolean;
  cup?: string;
  races?: {
    course: string;
    position1: number;
    position2: number;
    points1: number;
    points2: number;
  }[];
  player1: Player;
  player2: Player;
}

/** Individual race entry in the match result form */
interface Race {
  course: CourseAbbr | "";
  position1: number | null;
  position2: number | null;
}

export default function GrandPrixPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: tournamentId } = use(params);
  const { data: session } = useSession();
  const t = useTranslations('gp');
  const tc = useTranslations('common');
  const locale = useLocale();

  /** Admin role check: only admins can setup groups, enter results, and reset */
  const isAdmin = session?.user && session.user.role === 'admin';
  const [isSetupDialogOpen, setIsSetupDialogOpen] = useState(false);
  const [isMatchDialogOpen, setIsMatchDialogOpen] = useState(false);
  const [selectedMatch, setSelectedMatch] = useState<GPMatch | null>(null);
  const [selectedCup, setSelectedCup] = useState<string>("");
  /* GP matches have exactly 5 races per cup (§7.2) */
  const [races, setRaces] = useState<Race[]>(
    Array.from({ length: TOTAL_GP_RACES }, () => ({ course: "", position1: null, position2: null }))
  );
  const [setupPlayers, setSetupPlayers] = useState<
    { playerId: string; group: string; seeding?: number }[]
  >([]);
  const [groupCount, setGroupCount] = useState(3);
  const [setupSaving, setSetupSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [manualScoreEnabled, setManualScoreEnabled] = useState(false);
  const [manualPoints1, setManualPoints1] = useState("");
  const [manualPoints2, setManualPoints2] = useState("");

  /** Get courses belonging to a specific cup for the course selection dropdown */
  const getCupCourses = (cup: string): CourseAbbr[] => {
    return COURSE_INFO.filter((c) => c.cup === cup).map((c) => c.abbr);
  };

  const formatGpPosition = (position: number) => {
    if (position === 0) return tc('gameOver');
    if (locale === 'ja') return `${position}位`;

    const mod10 = position % 10;
    const mod100 = position % 100;
    if (mod10 === 1 && mod100 !== 11) return `${position}st`;
    if (mod10 === 2 && mod100 !== 12) return `${position}nd`;
    if (mod10 === 3 && mod100 !== 13) return `${position}rd`;
    return `${position}th`;
  };

  /**
   * Fetch tournament GP data and player list in parallel.
   * Returns qualification standings, matches, and all registered players.
   */
  const fetchTournamentData = useCallback(async () => {
    const [gpResponse, playersResponse] = await Promise.all([
      fetchWithRetry(`/api/tournaments/${tournamentId}/gp`),
      fetchWithRetry("/api/players"),
    ]);

    if (!gpResponse.ok) {
      throw new Error(`Failed to fetch GP data: ${gpResponse.status}`);
    }

    if (!playersResponse.ok) {
      throw new Error(`Failed to fetch players: ${playersResponse.status}`);
    }

    const gpJson = await gpResponse.json();
    const gpData = gpJson.data ?? gpJson;
    const playersJson = await playersResponse.json();

    return {
      qualifications: gpData.qualifications || [],
      matches: gpData.matches || [],
      allPlayers: extractArrayData<Player>(playersJson),
    };
  }, [tournamentId]);

  /*
   * Poll at the standard interval for live tournament updates.
   * cacheKey enables instant content display when returning to this tab.
   */
  const { data: pollData, error: pollError, lastUpdated, isPolling, refetch } = usePolling(
    fetchTournamentData, {
    interval: POLLING_INTERVAL,
    cacheKey: `tournament/${tournamentId}/gp`,
  });

  /*
   * Derive display data directly from polling response.
   * Avoids redundant local state and provides instant display from cache.
   */
  const qualifications: GPQualification[] = pollData?.qualifications ?? [];
  const matches: GPMatch[] = pollData?.matches ?? [];
  const allPlayers: Player[] = pollData?.allPlayers ?? [];

  /**
   * Submit group setup to create qualification round-robin matches.
   * Sends player list with group assignments to the POST endpoint.
   */
  const handleSetup = async () => {
    if (setupPlayers.length === 0) {
      alert(tc('addAtLeastOnePlayer'));
      return;
    }

    setSetupSaving(true);
    try {
      const response = await fetch(`/api/tournaments/${tournamentId}/gp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ players: setupPlayers }),
      });

      if (response.ok) {
        setIsSetupDialogOpen(false);
        setSetupPlayers([]);
        refetch();
      } else {
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
   * Save rank override for a qualification entry.
   * Passing null clears any existing override and restores automatic ranking.
   */
  const handleRankOverrideSave = async (qualificationId: string, rankOverride: number | null) => {
    try {
      const response = await fetch(`/api/tournaments/${tournamentId}/gp`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ qualificationId, rankOverride }),
      });
      if (response.ok) {
        setEditingRankId(null);
        refetch();
      } else {
        const err = await response.json().catch(() => ({}));
        alert(err.error || 'Failed to update rank');
      }
    } catch (err) {
      logger.error("Failed to update rank:", { error: err, tournamentId });
    }
  };

  /**
   * Open the match result dialog pre-populated with existing data.
   * If the match already has results, load them into the form.
   */
  /**
   * Handle TV number assignment for a match.
   * Calls the PATCH endpoint to update the match's broadcast TV assignment.
   */
  const handleTvAssign = async (matchId: string, tvNumber: number | null) => {
    try {
      await fetch(`/api/tournaments/${tournamentId}/gp`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matchId, tvNumber }),
      });
      refetch();
    } catch (err) {
      logger.error("Failed to assign TV:", { error: err, tournamentId, matchId });
    }
  };

  const openMatchDialog = (match: GPMatch) => {
    setSelectedMatch(match);
    setManualScoreEnabled(false);
    setManualPoints1(match.points1.toString());
    setManualPoints2(match.points2.toString());
    if (match.cup && match.races && match.races.length === TOTAL_GP_RACES) {
      /* Pre-fill form with existing match data for editing */
      setSelectedCup(match.cup);
      setRaces(match.races as Race[]);
    } else {
      /* Pre-select cup if pre-assigned at setup time (§7.4), otherwise reset */
      setSelectedCup(match.cup || "");
      setRaces(
        Array.from({ length: TOTAL_GP_RACES }, () => ({ course: "", position1: null, position2: null }))
      );
    }
    setIsMatchDialogOpen(true);
  };

  /**
   * Submit match result with cup and race positions.
   * Validates all 5 races (1 cup) are complete before submission.
   */
  const handleMatchSubmit = async () => {
    if (!selectedMatch) {
      return;
    }

    if (manualScoreEnabled) {
      const points1 = Number.parseInt(manualPoints1, 10);
      const points2 = Number.parseInt(manualPoints2, 10);

      if (!Number.isInteger(points1) || !Number.isInteger(points2) || points1 < 0 || points2 < 0) {
        alert(t('manualScoreValidation'));
        return;
      }

      try {
        const response = await fetch(`/api/tournaments/${tournamentId}/gp/match/${selectedMatch.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            points1,
            points2,
            completed: true,
            version: selectedMatch.version,
          }),
        });

        if (response.ok) {
          setIsMatchDialogOpen(false);
          setSelectedMatch(null);
          setSelectedCup("");
          setRaces(
            Array.from({ length: TOTAL_GP_RACES }, () => ({ course: "", position1: null, position2: null }))
          );
          setManualScoreEnabled(false);
          refetch();
        } else {
          const errorData = await response.json().catch(() => ({}));
          alert(errorData.error || t('manualScoreSaveFailed'));
        }
      } catch (err) {
        const metadata = err instanceof Error ? { message: err.message, stack: err.stack } : { error: err };
        logger.error("Failed to manually update GP score:", metadata);
      }
      return;
    }

    if (!selectedCup) {
      alert(tc('pleaseSelectCup'));
      return;
    }

    /* All races must have course and positions filled */
    const completedRaces = races.filter(
      (r) => r.course !== "" && r.position1 !== null && r.position2 !== null
    );

    if (completedRaces.length !== TOTAL_GP_RACES) {
      alert(tc('pleaseCompleteAllRaces'));
      return;
    }

    try {
      const response = await fetch(`/api/tournaments/${tournamentId}/gp`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          matchId: selectedMatch.id,
          cup: selectedCup,
          races,
        }),
      });

      if (response.ok) {
        setIsMatchDialogOpen(false);
        setSelectedMatch(null);
        setSelectedCup("");
        setRaces(
          Array.from({ length: TOTAL_GP_RACES }, () => ({ course: "", position1: null, position2: null }))
        );
        refetch();
      }
    } catch (err) {
      const metadata = err instanceof Error ? { message: err.message, stack: err.stack } : { error: err };
      logger.error("Failed to update match:", metadata);
    }
  };

  /** Export GP data as CSV/Excel file */
  const handleExport = async () => {
    setExporting(true);
    try {
      const response = await fetch(`/api/tournaments/${tournamentId}/gp/export`);
      if (!response.ok) {
        throw new Error("Failed to export data");
      }

      /* Create download link from response blob */
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `grand-prix-${new Date().toISOString().split("T")[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      const metadata = err instanceof Error ? { message: err.message, stack: err.stack } : { error: err };
      logger.error("Failed to export:", metadata);
    } finally {
      setExporting(false);
    }
  };

  /* Extract unique groups from qualifications for tab display */
  const groups = [...new Set(qualifications.map((q) => q.group))].sort();

  /* Show error state if the first fetch fails and there's no cached data */
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
      {/* Page header with action buttons */}
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
            <Link href={`/tournaments/${tournamentId}/gp/participant`}>
              {tc('enterScore')}
            </Link>
          </Button>

          <Button
            variant="outline"
            onClick={handleExport}
            disabled={exporting}
          >
            {exporting ? tc('exporting') : tc('exportToExcel')}
          </Button>
          {/* Link to finals page (only shown when ALL qualification matches are completed) */}
          {qualifications.length > 0 &&
           matches.length > 0 &&
           matches.every((m) => m.completed) && (
            <Button asChild>
              <Link href={`/tournaments/${tournamentId}/gp/finals`}>
                {tc('goToFinals')}
              </Link>
            </Button>
          )}
          {/* Admin-only group setup/edit dialog (shared component) */}
          {isAdmin && <GroupSetupDialog
            mode="gp"
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
          />}
        </div>
      </div>

      {/* Empty state when no groups are set up */}
      {qualifications.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            {isAdmin ? t('noGroupsYet') : t('noGroupsYetViewer')}
          </CardContent>
        </Card>
      ) : (
        /* Tabs for standings and match list views */
        <Tabs defaultValue="standings" className="space-y-4">
          <TabsList>
            <TabsTrigger value="standings">{tc('standings')}</TabsTrigger>
            <TabsTrigger value="matches">{tc('matches')}</TabsTrigger>
          </TabsList>

          {/* Standings tab: group-by-group qualification tables */}
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
                          <TableHead className="w-16">#</TableHead>
                          <TableHead>{tc('player')}</TableHead>
                          <TableHead className="text-center">{t('mp')}</TableHead>
                          <TableHead className="text-center">{t('w')}</TableHead>
                          <TableHead className="text-center">{t('t')}</TableHead>
                          <TableHead className="text-center">{t('l')}</TableHead>
                          <TableHead className="text-center">{t('pts')}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(() => {
                          /* GP uses points (driver points) as primary sort key, score as secondary */
                          const sorted = qualifications
                            .filter((q) => q.group === group)
                            .sort((a, b) => b.points - a.points || b.score - a.score);
                          const withAutoRank = sorted.map((q, i) => ({ ...q, _autoRank: i + 1 }));
                          const byEffectiveRank = [...withAutoRank].sort(
                            (a, b) => (a.rankOverride ?? a._autoRank) - (b.rankOverride ?? b._autoRank)
                          );
                          return byEffectiveRank.map((q) => (
                            <TableRow key={q.id}>
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
                              <TableCell className="text-center font-bold">
                                {q.points}
                              </TableCell>
                            </TableRow>
                          ));
                        })()}
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
                  const hasRoundNumbers = matches.some((m) => m.roundNumber != null);
                  const matchesByDay = hasRoundNumbers
                    ? matches.reduce<Record<number, GPMatch[]>>((acc, m) => {
                        const day = m.roundNumber ?? 0;
                        if (!acc[day]) acc[day] = [];
                        acc[day].push(m);
                        return acc;
                      }, {})
                    : { 0: matches };
                  const sortedDays = Object.keys(matchesByDay).map(Number).sort((a, b) => a - b);

                  return (
                    <div className="space-y-6">
                      {sortedDays.map((day) => (
                        <div key={day}>
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
                                <TableHead className="text-center w-24">{tc('points')}</TableHead>
                                <TableHead>{tc('player2')}</TableHead>
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
                                  <TableCell>
                                    {match.matchNumber}
                                    {/* Show pre-assigned cup name next to match number (§7.4) */}
                                    {match.cup && !match.isBye && (
                                      <span className="ml-1 text-xs text-muted-foreground">
                                        ({t('cupLabel', { cup: match.cup })})
                                      </span>
                                    )}
                                  </TableCell>
                                  <TableCell
                                    className={
                                      match.completed && match.points1 > match.points2
                                        ? "font-bold"
                                        : ""
                                    }
                                  >
                                    {match.player1.nickname}
                                  </TableCell>
                                  <TableCell className="text-center font-mono">
                                    {match.isBye || match.completed
                                      ? `${match.points1} - ${match.points2}`
                                      : "- - -"}
                                  </TableCell>
                                  <TableCell
                                    className={
                                      !match.isBye && match.completed && match.points2 > match.points1
                                        ? "font-bold"
                                        : ""
                                    }
                                  >
                                    {match.isBye ? tc('bye') : match.player2.nickname}
                                  </TableCell>
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
                                    {!match.isBye && (
                                      <Button variant="ghost" size="sm" asChild>
                                        <Link href={`/tournaments/${tournamentId}/gp/match/${match.id}`}>
                                          {tc('share')}
                                        </Link>
                                      </Button>
                                    )}
                                    {isAdmin && !match.isBye && (
                                      <Button
                                        variant={match.completed ? "outline" : "default"}
                                        size="sm"
                                        onClick={() => openMatchDialog(match)}
                                      >
                                        {match.completed ? tc('edit') : tc('enterResult')}
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

      {/* Match result entry dialog */}
      <Dialog open={isMatchDialogOpen} onOpenChange={setIsMatchDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('enterMatchResult')}</DialogTitle>
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
            {/* Cup selection - determines which 5 courses are available.
                §7.1: When a cup is pre-assigned, only allow that cup or its substitute. */}
            <div>
              <Label>{t('selectCup')}</Label>
              <Select value={selectedCup} onValueChange={(cup) => {
                setSelectedCup(cup);
                /* Clear course selections when switching cups — different cups have different courses */
                setRaces(Array.from({ length: TOTAL_GP_RACES }, () => ({ course: "", position1: null, position2: null })));
              }}>
                <SelectTrigger>
                  <SelectValue placeholder={t('selectCupPlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  {(selectedMatch?.cup
                    ? /* Pre-assigned: show assigned cup + substitute if available */
                      [selectedMatch.cup, CUP_SUBSTITUTIONS[selectedMatch.cup]].filter(Boolean)
                    : /* No pre-assignment: show all cups */
                      [...CUPS]
                  ).map((cup) => (
                    <SelectItem key={cup} value={cup!}>
                      {cup}
                      {cup === CUP_SUBSTITUTIONS[selectedMatch?.cup ?? ''] && ` (${t('substitute')})`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-3 rounded-lg border p-4">
              <div className="flex items-start gap-3">
                <Checkbox
                  id="gp-manual-score"
                  checked={manualScoreEnabled}
                  onCheckedChange={(checked) => setManualScoreEnabled(checked === true)}
                />
                <div className="space-y-1">
                  <Label htmlFor="gp-manual-score">{t('manualTotalScore')}</Label>
                  <p className="text-sm text-muted-foreground">
                    {t('manualTotalScoreDesc')}
                  </p>
                </div>
              </div>

              {manualScoreEnabled && selectedMatch && (
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="manual-points1">{selectedMatch.player1.nickname}</Label>
                    <Input
                      id="manual-points1"
                      type="number"
                      min="0"
                      step="1"
                      inputMode="numeric"
                      value={manualPoints1}
                      onChange={(e) => setManualPoints1(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="manual-points2">{selectedMatch.player2.nickname}</Label>
                    <Input
                      id="manual-points2"
                      type="number"
                      min="0"
                      step="1"
                      inputMode="numeric"
                      value={manualPoints2}
                      onChange={(e) => setManualPoints2(e.target.value)}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Race-by-race entry table (5 races per cup) */}
            {selectedCup && !manualScoreEnabled && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-16">{tc('race')}</TableHead>
                    <TableHead>{tc('course')}</TableHead>
                    <TableHead className="text-center">{t('p1Position')}</TableHead>
                    <TableHead className="text-center">{t('p2Position')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {races.map((race, index) => {
                    const cupCourses = getCupCourses(selectedCup);
                    return (
                      <TableRow key={`race-${selectedMatch?.id}-${index}`}>
                        <TableCell className="font-medium">
                          {tc('race')} {index + 1}
                        </TableCell>
                        <TableCell>
                          <Select
                            value={race.course}
                            onValueChange={(value) => {
                              const newRaces = [...races];
                              newRaces[index].course = value as CourseAbbr;
                              setRaces(newRaces);
                            }}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder={tc('selectCourse')} />
                            </SelectTrigger>
                            <SelectContent>
                              {cupCourses.map((course) => (
                                <SelectItem key={course} value={course}>
                                  {
                                    COURSE_INFO.find((c) => c.abbr === course)
                                      ?.name
                                  }
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <Select
                            value={race.position1?.toString() || ""}
                            onValueChange={(value) => {
                              const newRaces = [...races];
                              newRaces[index].position1 =
                                value === "" ? null : parseInt(value, 10);
                              setRaces(newRaces);
                            }}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder={tc('position')} />
                            </SelectTrigger>
                            <SelectContent>
                              {GP_POSITION_OPTIONS.map((position) => (
                                <SelectItem key={`admin-p1-${index}-${position}`} value={position.toString()}>
                                  {formatGpPosition(position)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <Select
                            value={race.position2?.toString() || ""}
                            onValueChange={(value) => {
                              const newRaces = [...races];
                              newRaces[index].position2 =
                                value === "" ? null : parseInt(value, 10);
                              setRaces(newRaces);
                            }}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder={tc('position')} />
                            </SelectTrigger>
                            <SelectContent>
                              {GP_POSITION_OPTIONS.map((position) => (
                                <SelectItem key={`admin-p2-${index}-${position}`} value={position.toString()}>
                                  {formatGpPosition(position)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}

            {/* Live driver points calculation preview */}
            {!manualScoreEnabled && (
              <div className="bg-muted p-4 rounded-lg">
                <p className="text-sm font-medium mb-2">
                  {t('driverPoints')}
                </p>
                {selectedMatch && (
                  <div className="flex gap-4 justify-center">
                    <div>
                      <span className="text-sm">{selectedMatch.player1.nickname}:</span>
                      <span className="ml-2 font-bold">
                        {races.reduce(
                          (acc, r) =>
                            acc + (r.position1 ? getDriverPoints(r.position1) : 0),
                          0
                        )}
                        pts
                      </span>
                    </div>
                    <div>
                      <span className="text-sm">{selectedMatch.player2.nickname}:</span>
                      <span className="ml-2 font-bold">
                        {races.reduce(
                          (acc, r) =>
                            acc + (r.position2 ? getDriverPoints(r.position2) : 0),
                          0
                        )}
                        pts
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button onClick={handleMatchSubmit}>
              {manualScoreEnabled ? tc('saveScore') : tc('saveResult')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
