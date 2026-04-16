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
import { TieWarningBanner } from "@/components/tournament/tie-warning-banner";
import { computeTieAwareRanks, findUnresolvedTies, filterActiveTiedIds } from "@/lib/ranking-utils";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { COURSE_INFO, CUPS, CUP_SUBSTITUTIONS, GP_POSITION_OPTIONS, POLLING_INTERVAL, TOTAL_GP_RACES, getDriverPoints, type CourseAbbr } from "@/lib/constants";
import { formatGpPosition } from "@/lib/gp-utils";
import { extractArrayData } from "@/lib/api-response";
import { usePolling } from "@/lib/hooks/usePolling";
import { useQualificationActions } from "@/lib/hooks/useQualificationActions";
import { UpdateIndicator } from "@/components/ui/update-indicator";
import { CardSkeleton } from "@/components/ui/loading-skeleton";
import { createLogger } from "@/lib/client-logger";

import type { Player } from "@/lib/types";

const logger = createLogger({ serviceName: 'tournaments-gp' });

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
  player1ReportedPoints1?: number | null;
  player1ReportedPoints2?: number | null;
  player2ReportedPoints1?: number | null;
  player2ReportedPoints2?: number | null;
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
  /* State for match filters */
  const [matchGroupFilter, setMatchGroupFilter] = useState<string>("all");
  const [matchPlayerFilter, setMatchPlayerFilter] = useState<string>("all");
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
  const [manualScoreEnabled, setManualScoreEnabled] = useState(false);
  const [manualPoints1, setManualPoints1] = useState("");
  const [manualPoints2, setManualPoints2] = useState("");

  /** Get courses belonging to a specific cup for the course selection dropdown */
  const getCupCourses = (cup: string): CourseAbbr[] => {
    return COURSE_INFO.filter((c) => c.cup === cup).map((c) => c.abbr);
  };

  // formatGpPosition imported from @/lib/gp-utils; bind locale and gameOver label locally
  const fmtPos = (position: number) => formatGpPosition(position, locale, tc('gameOver'));

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
      qualificationConfirmed: gpData.qualificationConfirmed ?? false,
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
  /* Whether qualification scores are locked by admin confirmation */
  const qualificationConfirmed: boolean = pollData?.qualificationConfirmed ?? false;

  /* Shared handlers for rank override, TV assignment, and CSV export */
  const { handleRankOverrideSave, handleTvAssign, handleExport, exporting } =
    useQualificationActions({ tournamentId, mode: "gp", refetch });

  /**
   * Toggle qualification confirmed state.
   * When confirmed, all score edits (admin and player) are locked.
   */
  const handleToggleQualificationConfirmed = async () => {
    const newValue = !qualificationConfirmed;
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

  const getReportStatus = (match: GPMatch) => {
    if (match.isBye || match.completed) return null;

    const player1Reported =
      match.player1ReportedPoints1 != null && match.player1ReportedPoints2 != null;
    const player2Reported =
      match.player2ReportedPoints1 != null && match.player2ReportedPoints2 != null;

    if (player1Reported && player2Reported) {
      return {
        tone: "warning",
        label: tc('bothReportsMismatch'),
        detail: `${match.player1ReportedPoints1} - ${match.player1ReportedPoints2} / ${match.player2ReportedPoints1} - ${match.player2ReportedPoints2}`,
      };
    }

    if (player1Reported) {
      return {
        tone: "info",
        label: tc('reportedBy', { player: match.player1.nickname }),
        detail: `${match.player1ReportedPoints1} - ${match.player1ReportedPoints2}`,
      };
    }

    if (player2Reported) {
      return {
        tone: "info",
        label: tc('reportedBy', { player: match.player2.nickname }),
        detail: `${match.player2ReportedPoints1} - ${match.player2ReportedPoints2}`,
      };
    }

    return null;
  };

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
      /* Pre-select cup if pre-assigned at setup time (§7.4), otherwise reset.
       * Auto-fill courses from the fixed cup sequence (no manual course selection). */
      const cup = match.cup || "";
      setSelectedCup(cup);
      if (cup) {
        const cupCourses = getCupCourses(cup);
        setRaces(cupCourses.map((course) => ({ course, position1: null, position2: null })));
      } else {
        setRaces(Array.from({ length: TOTAL_GP_RACES }, () => ({ course: "", position1: null, position2: null })));
      }
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

          {/* Admin-only qualification confirmation toggle */}
          {isAdmin && qualifications.length > 0 && (
            <Button
              variant={qualificationConfirmed ? "destructive" : "outline"}
              onClick={handleToggleQualificationConfirmed}
            >
              {qualificationConfirmed ? tc('unconfirmQualification') : tc('confirmQualification')}
            </Button>
          )}

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
                    {(() => {
                      /*
                       * Compute tie-aware 1224 competition ranks for this group.
                       * GP uses points (driver points) as primary sort key, score as secondary.
                       * findUnresolvedTies returns IDs of entries in ties where not all
                       * members have a rankOverride — used for yellow row highlighting and banner.
                       */
                      const groupEntries = qualifications.filter((q) => q.group === group);
                      // GP: driver points primary, match score secondary (opposite of BM/MR)
                      const byEffectiveRank = computeTieAwareRanks(
                        groupEntries,
                        (a, b) => b.points - a.points || b.score - a.score
                      );
                      const tiedIds = findUnresolvedTies(byEffectiveRank);
                      // Suppress trivial 0-0 ties: only flag players who have actually played.
                      const activeTiedIds = filterActiveTiedIds(tiedIds, groupEntries);
                      return (
                        <>
                          <TieWarningBanner hasTies={activeTiedIds.size > 0} isAdmin={!!isAdmin} />
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
                              {byEffectiveRank.map((q) => (
                                <TableRow
                                  key={q.id}
                                  className={activeTiedIds.has(q.id) ? "bg-yellow-50" : undefined}
                                >
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
                  /* Build player→group lookup for match filtering */
                  const playerGroupMap = new Map<string, string>();
                  for (const q of qualifications) {
                    playerGroupMap.set(q.playerId, q.group);
                  }
                  const getMatchGroup = (m: GPMatch): string | undefined =>
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
                  const playersInScope = matchGroupFilter === "all"
                    ? qualifications
                    : qualifications.filter((q) => q.group === matchGroupFilter);
                  const playerOptions = playersInScope
                    .map((q) => ({ id: q.playerId, nickname: q.player.nickname }))
                    .sort((a, b) => a.nickname.localeCompare(b.nickname));

                  const hasRoundNumbers = filteredMatches.some((m) => m.roundNumber != null);
                  const matchesByDay = hasRoundNumbers
                    ? filteredMatches.reduce<Record<number, GPMatch[]>>((acc, m) => {
                        const day = m.roundNumber ?? 0;
                        if (!acc[day]) acc[day] = [];
                        acc[day].push(m);
                        return acc;
                      }, {})
                    : { 0: filteredMatches };
                  const sortedDays = Object.keys(matchesByDay).map(Number).sort((a, b) => a - b);

                  return (
                    <div className="space-y-6">
                      {/* Match filters: group buttons + player dropdown */}
                      <div className="flex flex-col sm:flex-row gap-3">
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
                                {isAdmin && <TableHead className="text-center w-44">{tc('reportStatus')}</TableHead>}
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
                                  {isAdmin && (
                                    <TableCell className="text-center">
                                      {(() => {
                                        const status = getReportStatus(match);
                                        if (!status) {
                                          return <span className="text-sm text-muted-foreground">-</span>;
                                        }
                                        return (
                                          <div className={`inline-flex max-w-40 flex-col items-center rounded-md border px-2 py-1 text-xs ${
                                            status.tone === "warning"
                                              ? "border-yellow-300 bg-yellow-50 text-yellow-800"
                                              : "border-blue-200 bg-blue-50 text-blue-800"
                                          }`}>
                                            <span className="max-w-full truncate">{status.label}</span>
                                            <span className="font-mono">{status.detail}</span>
                                          </div>
                                        );
                                      })()}
                                    </TableCell>
                                  )}
                                  <TableCell className="text-right space-x-2">
                                    {isAdmin && !match.isBye && (
                                      <Button
                                        variant={match.completed ? "outline" : "default"}
                                        size="sm"
                                        onClick={() => openMatchDialog(match)}
                                        disabled={qualificationConfirmed}
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
        <DialogContent className="w-[calc(100vw-2rem)] max-w-[calc(100vw-2rem)] sm:max-w-4xl max-h-[90vh] overflow-y-auto p-4 sm:p-6">
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
                /* Auto-fill courses in fixed order when cup is selected.
                 * SMK cups have a fixed course sequence — no manual selection needed. */
                const cupCourses = getCupCourses(cup);
                setRaces(cupCourses.map((course) => ({ course, position1: null, position2: null })));
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
                    return (
                      <TableRow key={`race-${selectedMatch?.id}-${index}`}>
                        <TableCell className="font-medium">
                          {tc('race')} {index + 1}
                        </TableCell>
                        <TableCell className="text-sm">
                          {/* Course is auto-determined by cup + race order (SMK fixed sequence) */}
                          {COURSE_INFO.find((c) => c.abbr === race.course)?.name || race.course}
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
                                  {fmtPos(position)}
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
                                  {fmtPos(position)}
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
                  <div className="flex flex-col gap-2 sm:flex-row sm:justify-center sm:gap-4">
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
