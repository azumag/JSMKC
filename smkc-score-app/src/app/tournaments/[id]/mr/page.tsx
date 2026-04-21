/**
 * Match Race Qualification Page
 *
 * Main admin page for managing MR qualification rounds.
 * Features:
 * - Group standings with Win/Tie/Loss/Points columns
 * - Match list with score entry dialogs
 * - Group setup dialog for assigning players
 * - CSV export functionality
 * - Real-time polling for live tournament updates
 *
 * MR qualification uses a fixed 4-race format with pre-assigned courses.
 * All 4 races are recorded individually, and a 2-2 result is a valid draw.
 *
 * @route /tournaments/[id]/mr
 */
"use client";
import { fetchWithRetry } from "@/lib/fetch-with-retry";

import { useState, useCallback, useEffect, use } from "react";
import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { GroupSetupDialog } from "@/components/tournament/group-setup-dialog";
import { RankCell } from "@/components/tournament/rank-cell";
import { TieWarningBanner } from "@/components/tournament/tie-warning-banner";
import { computeTieAwareRanks, findUnresolvedTies, filterActiveTiedIds } from "@/lib/ranking-utils";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { COURSE_INFO, POLLING_INTERVAL, TOTAL_MR_RACES, type CourseAbbr } from "@/lib/constants";
import { extractArrayData } from "@/lib/api-response";
import { usePolling } from "@/lib/hooks/usePolling";
import { useQualificationActions } from "@/lib/hooks/useQualificationActions";
import { UpdateIndicator } from "@/components/ui/update-indicator";
import { CardSkeleton } from "@/components/ui/loading-skeleton";
import { createLogger } from "@/lib/client-logger";
import type { Player } from "@/lib/types";

/** Client-side logger for error tracking */
const logger = createLogger({ serviceName: 'tournaments-mr' });

/** MR qualification standing record */
interface MRQualification {
  id: string;
  playerId: string;
  group: string;
  seeding: number | null;
  mp: number;
  wins: number;
  ties: number;
  losses: number;
  winRounds: number;
  lossRounds: number;
  points: number;
  score: number;
  rankOverride: number | null; // 管理者手動順位 (null = 自動計算)
  player: Player;
}

/** MR match record with player details */
interface MRMatch {
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
  assignedCourses?: string[];
  rounds?: { course: string; winner: number }[];
  player1ReportedPoints1?: number | null;
  player1ReportedPoints2?: number | null;
  player2ReportedPoints1?: number | null;
  player2ReportedPoints2?: number | null;
  player1: Player;
  player2: Player;
}

/** Individual race result in a match */
interface Round {
  course: CourseAbbr | "";
  winner: number | null;
}

export default function MatchRacePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: tournamentId } = use(params);
  const { data: session } = useSession();
  const t = useTranslations('mr');
  const tc = useTranslations('common');

  /** Admin role check: only admins can setup groups, enter results, and reset */
  const isAdmin = session?.user && session.user.role === 'admin';
  const [isSetupDialogOpen, setIsSetupDialogOpen] = useState(false);
  const [isMatchDialogOpen, setIsMatchDialogOpen] = useState(false);
  const [selectedMatch, setSelectedMatch] = useState<MRMatch | null>(null);
  /* State for match filters */
  const [matchGroupFilter, setMatchGroupFilter] = useState<string>("all");
  const [matchPlayerFilter, setMatchPlayerFilter] = useState<string>("all");
  /* Initialize 4 empty rounds for the match result dialog */
  const [rounds, setRounds] = useState<Round[]>(
    Array.from({ length: TOTAL_MR_RACES }, () => ({ course: "", winner: null }))
  );
  const [setupPlayers, setSetupPlayers] = useState<
    { playerId: string; group: string; seeding?: number }[]
  >([]);
  /* Product default: 2 groups (§10.2). */
  const [groupCount, setGroupCount] = useState(2);
  const [setupSaving, setSetupSaving] = useState(false);
  const [generatingBracket, setGeneratingBracket] = useState(false);
  const [resettingBracket, setResettingBracket] = useState(false);
  const [finalsExists, setFinalsExists] = useState<boolean | undefined>(undefined);

  /**
   * Fetch MR data and player list concurrently.
   * Called by the polling hook for real-time updates.
   */
  const fetchTournamentData = useCallback(async () => {
    const [mrResponse, playersResponse] = await Promise.all([
      fetchWithRetry(`/api/tournaments/${tournamentId}/mr`),
      /* limit=100 (API cap) avoids truncating the Setup dialog player list — see ta/page.tsx for rationale. */
      fetchWithRetry("/api/players?limit=100"),
    ]);

    if (!mrResponse.ok) {
      throw new Error(`Failed to fetch MR data: ${mrResponse.status}`);
    }

    if (!playersResponse.ok) {
      throw new Error(`Failed to fetch players: ${playersResponse.status}`);
    }

    const mrJson = await mrResponse.json();
    const mrData = mrJson.data ?? mrJson;
    const playersJson = await playersResponse.json();

    return {
      qualifications: mrData.qualifications || [],
      matches: mrData.matches || [],
      allPlayers: extractArrayData<Player>(playersJson),
      qualificationConfirmed: mrData.qualificationConfirmed ?? false,
    };
  }, [tournamentId]);

  /*
   * Poll at the standard interval for live tournament updates.
   * cacheKey enables instant content display when returning to this tab.
   */
  const { data: pollData, error: pollError, lastUpdated, isPolling, refetch } = usePolling(
    fetchTournamentData, {
    interval: POLLING_INTERVAL,
    cacheKey: `tournament/${tournamentId}/mr`,
  });

  /*
   * Derive display data directly from polling response.
   * Avoids redundant local state and provides instant display from cache.
   */
  const qualifications: MRQualification[] = pollData?.qualifications ?? [];
  const matches: MRMatch[] = pollData?.matches ?? [];
  const allPlayers: Player[] = pollData?.allPlayers ?? [];
  /* Whether qualification scores are locked by admin confirmation */
  const qualificationConfirmed: boolean = pollData?.qualificationConfirmed ?? false;

  /**
   * On mount, check whether a finals or playoff bracket already exists
   * so the qualification page can show "View Tournament" instead of
   * "Generate Bracket" when the admin returns after creation.
   */
  useEffect(() => {
    let cancelled = false;
    async function checkFinals() {
      try {
        const res = await fetch(`/api/tournaments/${tournamentId}/mr/finals`);
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

  /* Shared handlers for rank override and TV assignment */
  const { handleRankOverrideSave, handleTvAssign } =
    useQualificationActions({ tournamentId, mode: "mr", refetch });

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

  const getReportStatus = (match: MRMatch) => {
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
   * Submit group setup with player assignments.
   * Creates qualification records and round-robin matches.
   */
  const handleSetup = async () => {
    if (setupPlayers.length === 0) {
      setIsSetupDialogOpen(false);
      return;
    }

    setSetupSaving(true);
    try {
      const response = await fetch(`/api/tournaments/${tournamentId}/mr`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ players: setupPlayers }),
      });

      if (response.ok) {
        setIsSetupDialogOpen(false);
        setSetupPlayers([]);
        refetch();
      } else {
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

  const openMatchDialog = (match: MRMatch) => {
    setSelectedMatch(match);
    if (match.rounds && match.rounds.length === TOTAL_MR_RACES) {
      setRounds(match.rounds as Round[]);
    } else {
      const assignedCourses = Array.isArray(match.assignedCourses)
        ? match.assignedCourses
        : [];
      setRounds(
        Array.from({ length: TOTAL_MR_RACES }, (_, index) => ({
          course: (assignedCourses[index] as CourseAbbr | undefined) ?? "",
          winner: null,
        }))
      );
    }
    setIsMatchDialogOpen(true);
  };

  /**
   * Submit match result after validating 4 configured races.
   * Score is calculated from the number of race wins per player, and 2-2 draws are valid.
   */
  const handleMatchSubmit = async () => {
    if (!selectedMatch) return;

    /* Validate that exactly 4 unique courses are configured */
    const usedCourses = rounds.map(r => r.course).filter(c => c !== "");
    if (usedCourses.length !== TOTAL_MR_RACES || new Set(usedCourses).size !== TOTAL_MR_RACES) {
      alert(tc('select4UniqueCourses'));
      return;
    }

    /* Validate that each race has a recorded winner; a 2-2 draw is still a complete match */
    if (rounds.some(r => r.winner === null)) {
      alert(tc('selectWinnerForAllRaces', { count: TOTAL_MR_RACES }));
      return;
    }

    /* Count wins per player from individual race results */
    const winnerCount = rounds.filter(r => r.winner === 1).length;
    const loserCount = rounds.filter(r => r.winner === 2).length;

    try {
      const response = await fetch(`/api/tournaments/${tournamentId}/mr`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          matchId: selectedMatch.id,
          score1: winnerCount,
          score2: loserCount,
          rounds,
        }),
      });

      if (response.ok) {
        setIsMatchDialogOpen(false);
        setSelectedMatch(null);
        setRounds(Array.from({ length: TOTAL_MR_RACES }, () => ({ course: "", winner: null })));
        refetch();
      }
    } catch (err) {
      logger.error("Failed to update match:", { error: err, tournamentId });
    }
  };

  /* Extract unique groups for tab display */
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
            <Link href={`/tournaments/${tournamentId}/mr/participant`}>
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
                  const res = await fetch(`/api/tournaments/${tournamentId}/mr/finals`, {
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
          {qualifications.length > 0 &&
           matches.length > 0 &&
           matches.every((m) => m.completed) && (
             finalsExists === true ? (
               <Button variant="outline" asChild>
                 <Link href={`/tournaments/${tournamentId}/mr/finals`}>
                   {tc('viewTournament')}
                 </Link>
               </Button>
             ) : (
               <Button
                 disabled={generatingBracket || finalsExists === undefined}
                 onClick={async () => {
                   setGeneratingBracket(true);
                   try {
                     const needsPlayoff = qualifications.length > 16;
                     const topN = needsPlayoff ? 24 : 16;
                     const res = await fetch(`/api/tournaments/${tournamentId}/mr/finals`, {
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
             )
           )}
          {/* Admin-only group setup/edit dialog (shared component) */}
          {isAdmin && <GroupSetupDialog
            mode="mr"
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
        /* Standings and Matches tabs */
        <Tabs defaultValue="standings" className="space-y-4">
          <TabsList>
            <TabsTrigger value="standings">{tc('standings')}</TabsTrigger>
            <TabsTrigger value="matches">{tc('matches')}</TabsTrigger>
          </TabsList>

          {/* Group standings tab */}
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
                  /* Build player→group lookup for match filtering */
                  const playerGroupMap = new Map<string, string>();
                  for (const q of qualifications) {
                    playerGroupMap.set(q.playerId, q.group);
                  }
                  const getMatchGroup = (m: MRMatch): string | undefined =>
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
                    ? filteredMatches.reduce<Record<number, MRMatch[]>>((acc, m) => {
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
                                <TableHead className="text-center w-24">{tc('score')}</TableHead>
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
                                  <TableCell>{match.matchNumber}</TableCell>
                                  <TableCell
                                    className={
                                      match.completed && match.score1 >= 3 ? "font-bold" : ""
                                    }
                                  >
                                    {match.player1.nickname}
                                  </TableCell>
                                  <TableCell className="text-center font-mono">
                                    {match.isBye || match.completed
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
        <DialogContent className="w-[calc(100vw-2rem)] max-w-[calc(100vw-2rem)] sm:max-w-3xl max-h-[90vh] overflow-y-auto p-4 sm:p-6">
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
            {selectedMatch && (
              <div className="rounded-md border bg-muted/30 px-4 py-3 text-sm">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                  <span className="font-medium">{tc('scorePreview')}</span>
                  <span className="min-w-0 break-words font-mono text-base">
                    {selectedMatch.player1.nickname} [{rounds.filter((round) => round.winner === 1).length}]
                    {" - "}
                    [{rounds.filter((round) => round.winner === 2).length}] {selectedMatch.player2.nickname}
                  </span>
                </div>
                <p className="mt-1 text-muted-foreground">
                  {tc('mrFourRaceDrawNote')}
                </p>
              </div>
            )}
            {/* §5.3 Character selection priority guidance */}
            {selectedMatch && (() => {
              const p1 = selectedMatch.player1Id;
              const p2 = selectedMatch.player2Id;
              const prevMatch = matches
                .filter(m => m.completed && m.id !== selectedMatch.id &&
                  ((m.player1Id === p1 && m.player2Id === p2) || (m.player1Id === p2 && m.player2Id === p1)))
                .sort((a, b) => b.matchNumber - a.matchNumber)[0];
              if (!prevMatch) {
                return <p className="text-sm text-muted-foreground text-center mb-2">{tc('characterPriorityFirst')}</p>;
              }
              const p1Score = prevMatch.player1Id === p1 ? prevMatch.score1 : prevMatch.score2;
              const p2Score = prevMatch.player1Id === p1 ? prevMatch.score2 : prevMatch.score1;
              const loserNickname = p1Score < p2Score ? selectedMatch.player1.nickname : selectedMatch.player2.nickname;
              return <p className="text-sm text-blue-600 text-center mb-2">{tc('characterPriority', { player: loserNickname })}</p>;
            })()}
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">{tc('race')}</TableHead>
                  <TableHead>{tc('course')}</TableHead>
                  <TableHead className="text-center">{tc('winner')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rounds.map((round, index) => (
                  <TableRow key={`round-${selectedMatch?.id}-${index}`}>
                    <TableCell className="font-medium">{tc('race')} {index + 1}</TableCell>
                    <TableCell>
                      <Select
                        value={round.course}
                        onValueChange={(value) => {
                          const newRounds = [...rounds];
                          newRounds[index].course = value as CourseAbbr;
                          setRounds(newRounds);
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={tc('selectCourse')} />
                        </SelectTrigger>
                        <SelectContent>
                          {COURSE_INFO.map((course) => (
                            <SelectItem key={course.abbr} value={course.abbr}>
                              {course.name} ({course.cup})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="min-w-0 max-w-28 truncate text-sm" title={selectedMatch?.player1.nickname}>
                          {selectedMatch?.player1.nickname}
                        </span>
                        <Button
                          variant={round.winner === 1 ? "default" : "outline"}
                          size="sm"
                          className="w-10 px-0"
                          aria-label={`${selectedMatch?.player1.nickname} wins race ${index + 1}`}
                          onClick={() => {
                            const newRounds = [...rounds];
                            newRounds[index].winner = round.winner === 1 ? null : 1;
                            setRounds(newRounds);
                          }}
                        >
                          {round.winner === 1 ? "\u2713" : "-"}
                        </Button>
                        <Button
                          variant={round.winner === 2 ? "default" : "outline"}
                          size="sm"
                          className="w-10 px-0"
                          aria-label={`${selectedMatch?.player2.nickname} wins race ${index + 1}`}
                          onClick={() => {
                            const newRounds = [...rounds];
                            newRounds[index].winner = round.winner === 2 ? null : 2;
                            setRounds(newRounds);
                          }}
                        >
                          {round.winner === 2 ? "\u2713" : "-"}
                        </Button>
                        <span className="min-w-0 max-w-28 truncate text-sm" title={selectedMatch?.player2.nickname}>
                          {selectedMatch?.player2.nickname}
                        </span>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <DialogFooter>
            <Button onClick={handleMatchSubmit}>{tc('saveResult')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
