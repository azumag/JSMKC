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
 * MR uses a 5-race course-selection format where each race
 * winner is tracked individually. First to 3 wins takes the match.
 *
 * @route /tournaments/[id]/mr
 */
"use client";

import { useState, useCallback, use } from "react";
import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { Button } from "@/components/ui/button";
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
import { COURSE_INFO, type CourseAbbr } from "@/lib/constants";
import { usePolling } from "@/lib/hooks/usePolling";
import { UpdateIndicator } from "@/components/ui/update-indicator";
import { CardSkeleton } from "@/components/ui/loading-skeleton";

/** Player data from the API */
interface Player {
  id: string;
  name: string;
  nickname: string;
}

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
  player: Player;
}

/** MR match record with player details */
interface MRMatch {
  id: string;
  matchNumber: number;
  player1Id: string;
  player2Id: string;
  player1Side: number;
  player2Side: number;
  score1: number;
  score2: number;
  completed: boolean;
  rounds?: { course: string; winner: number }[];
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
  /* Initialize 5 empty rounds for the match result dialog */
  const [rounds, setRounds] = useState<Round[]>([
    { course: "", winner: null },
    { course: "", winner: null },
    { course: "", winner: null },
    { course: "", winner: null },
    { course: "", winner: null },
  ]);
  const [setupPlayers, setSetupPlayers] = useState<
    { playerId: string; group: string }[]
  >([]);
  const [exporting, setExporting] = useState(false);

  /**
   * Fetch MR data and player list concurrently.
   * Called by the polling hook for real-time updates.
   */
  const fetchTournamentData = useCallback(async () => {
    const [mrResponse, playersResponse] = await Promise.all([
      fetch(`/api/tournaments/${tournamentId}/mr`),
      fetch("/api/players"),
    ]);

    if (!mrResponse.ok) {
      throw new Error(`Failed to fetch MR data: ${mrResponse.status}`);
    }

    if (!playersResponse.ok) {
      throw new Error(`Failed to fetch players: ${playersResponse.status}`);
    }

    const mrData = await mrResponse.json();
    const playersJson = await playersResponse.json();

    return {
      qualifications: mrData.qualifications || [],
      matches: mrData.matches || [],
      allPlayers: playersJson.data ?? playersJson,
    };
  }, [tournamentId]);

  /*
   * Poll every 3 seconds for live tournament updates.
   * cacheKey enables instant content display when returning to this tab.
   */
  const { data: pollData, error: pollError, lastUpdated, isPolling, refetch } = usePolling(
    fetchTournamentData, {
    interval: 3000,
    cacheKey: `tournament/${tournamentId}/mr`,
  });

  /*
   * Derive display data directly from polling response.
   * Avoids redundant local state and provides instant display from cache.
   */
  const qualifications: MRQualification[] = pollData?.qualifications ?? [];
  const matches: MRMatch[] = pollData?.matches ?? [];
  const allPlayers: Player[] = pollData?.allPlayers ?? [];

  /**
   * Submit group setup with player assignments.
   * Creates qualification records and round-robin matches.
   */
  const handleSetup = async () => {
    if (setupPlayers.length === 0) {
      alert(tc('addAtLeastOnePlayer'));
      return;
    }

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
      }
    } catch (err) {
      console.error("Failed to setup:", err);
    }
  };

  /**
   * Open the match result entry dialog with existing data or empty rounds.
   */
  const openMatchDialog = (match: MRMatch) => {
    setSelectedMatch(match);
    if (match.rounds && match.rounds.length === 5) {
      setRounds(match.rounds as Round[]);
    } else {
      setRounds([
        { course: "", winner: null },
        { course: "", winner: null },
        { course: "", winner: null },
        { course: "", winner: null },
        { course: "", winner: null },
      ]);
    }
    setIsMatchDialogOpen(true);
  };

  /**
   * Submit match result after validating 5 unique courses and a winner.
   * Score is calculated from the number of race wins per player.
   */
  const handleMatchSubmit = async () => {
    if (!selectedMatch) return;

    /* Validate that exactly 5 unique courses are selected */
    const usedCourses = rounds.map(r => r.course).filter(c => c !== "");
    if (usedCourses.length !== 5 || new Set(usedCourses).size !== 5) {
      alert(tc('select5UniqueCourses'));
      return;
    }

    /* Count wins per player from individual race results */
    const winnerCount = rounds.filter(r => r.winner === 1).length;
    const loserCount = rounds.filter(r => r.winner === 2).length;

    /* Match must have a definitive winner (first to 3) */
    if (winnerCount < 3 && loserCount < 3) {
      alert(tc('matchMustHaveWinner'));
      return;
    }

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
        setRounds([
          { course: "", winner: null },
          { course: "", winner: null },
          { course: "", winner: null },
          { course: "", winner: null },
          { course: "", winner: null },
        ]);
        refetch();
      }
    } catch (err) {
      console.error("Failed to update match:", err);
    }
  };

  /** Add a player to the setup list with default group A */
  const addPlayerToSetup = (playerId: string, group: string) => {
    if (!setupPlayers.find((p) => p.playerId === playerId)) {
      setSetupPlayers([...setupPlayers, { playerId, group }]);
    }
  };

  /** Remove a player from the setup list */
  const removePlayerFromSetup = (playerId: string) => {
    setSetupPlayers(setupPlayers.filter((p) => p.playerId !== playerId));
  };

  /** Export MR data as CSV download */
  const handleExport = async () => {
    setExporting(true);
    try {
      const response = await fetch(`/api/tournaments/${tournamentId}/mr/export`);
      if (!response.ok) {
        throw new Error("Failed to export data");
      }

      /* Trigger file download via blob URL */
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `match-race-${new Date().toISOString().split("T")[0]}.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      console.error("Failed to export:", err);
    } finally {
      setExporting(false);
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
          <div className="mt-2">
            <UpdateIndicator lastUpdated={lastUpdated} isPolling={isPolling} />
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={handleExport}
            disabled={exporting}
          >
            {exporting ? tc('exporting') : tc('exportToExcel')}
          </Button>
          {qualifications.length > 0 && (
            <Button asChild>
              <Link href={`/tournaments/${tournamentId}/mr/finals`}>
                {tc('goToFinals')}
              </Link>
            </Button>
          )}
          {/* Setup/Reset dialog: admin-only */}
          {isAdmin && <Dialog open={isSetupDialogOpen} onOpenChange={setIsSetupDialogOpen}>
            <DialogTrigger asChild>
              <Button variant={qualifications.length > 0 ? "outline" : "default"}>
                {qualifications.length > 0 ? tc('resetSetup') : tc('setupGroups')}
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>{t('setupDialogTitle')}</DialogTitle>
                <DialogDescription>
                  {t('setupDialogDesc')}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="flex gap-4">
                  <div className="flex-1">
                    <Label>{tc('selectPlayer')}</Label>
                    <Select
                      onValueChange={(playerId) => {
                        const player = allPlayers.find((p) => p.id === playerId);
                        if (player) {
                          addPlayerToSetup(playerId, "A");
                        }
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={tc('choosePlayer')} />
                      </SelectTrigger>
                      <SelectContent>
                        {allPlayers
                          .filter(
                            (p) => !setupPlayers.find((sp) => sp.playerId === p.id)
                          )
                          .map((player) => (
                            <SelectItem key={player.id} value={player.id}>
                              {player.nickname} ({player.name})
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Selected players table with group assignment */}
                <div className="border rounded-lg p-4">
                  <h4 className="font-medium mb-2">
                    {tc('selectedPlayers', { count: setupPlayers.length })}
                  </h4>
                  {setupPlayers.length === 0 ? (
                    <p className="text-muted-foreground text-sm">
                      {tc('noPlayersSelected')}
                    </p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{tc('player')}</TableHead>
                          <TableHead>{tc('group')}</TableHead>
                          <TableHead></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {setupPlayers.map((sp) => {
                          const player = allPlayers.find(
                            (p) => p.id === sp.playerId
                          );
                          return (
                            <TableRow key={sp.playerId}>
                              <TableCell>{player?.nickname}</TableCell>
                              <TableCell>
                                <Select
                                  value={sp.group}
                                  onValueChange={(group) => {
                                    setSetupPlayers(
                                      setupPlayers.map((p) =>
                                        p.playerId === sp.playerId
                                          ? { ...p, group }
                                          : p
                                      )
                                    );
                                  }}
                                >
                                  <SelectTrigger className="w-20">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="A">A</SelectItem>
                                    <SelectItem value="B">B</SelectItem>
                                    <SelectItem value="C">C</SelectItem>
                                  </SelectContent>
                                </Select>
                              </TableCell>
                              <TableCell>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() =>
                                    removePlayerFromSetup(sp.playerId)
                                  }
                                >
                                  {tc('remove')}
                                </Button>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  )}
                </div>
              </div>
              <DialogFooter>
                <Button onClick={handleSetup}>{t('createGroupsAndMatches')}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>}
        </div>
      </div>

      {/* Empty state when no groups are set up */}
      {qualifications.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            {t('noGroupsYet')}
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

          {/* Match list tab */}
          <TabsContent value="matches">
            <Card>
              <CardHeader>
                <CardTitle>{tc('matchList')}</CardTitle>
                <CardDescription>
                  {tc('completedOf', { completed: matches.filter((m) => m.completed).length, total: matches.length })}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-16">#</TableHead>
                      <TableHead>{tc('player1')}</TableHead>
                      <TableHead className="text-center w-24">{tc('score')}</TableHead>
                      <TableHead>{tc('player2')}</TableHead>
                      <TableHead className="text-right">{tc('actions')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {matches.map((match) => (
                      <TableRow key={match.id}>
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
                          {match.completed
                            ? `${match.score1} - ${match.score2}`
                            : "- - -"}
                        </TableCell>
                        <TableCell
                          className={
                            match.completed && match.score2 >= 3
                              ? "font-bold"
                              : ""
                          }
                        >
                          {match.player2.nickname}
                        </TableCell>
                        <TableCell className="text-right space-x-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            asChild
                          >
                            <Link href={`/tournaments/${tournamentId}/mr/match/${match.id}`}>
                              {tc('share')}
                            </Link>
                          </Button>
                          {/* Enter/Edit result: admin-only */}
                          {isAdmin && (
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
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}

      {/* Match result entry dialog */}
      <Dialog open={isMatchDialogOpen} onOpenChange={setIsMatchDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
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
                  <TableRow key={index}>
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
                      <div className="flex items-center gap-2">
                        <span className="text-sm w-12">
                          {selectedMatch?.player1.nickname}
                        </span>
                        <Button
                          variant={round.winner === 1 ? "default" : "outline"}
                          size="sm"
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
                          onClick={() => {
                            const newRounds = [...rounds];
                            newRounds[index].winner = round.winner === 2 ? null : 2;
                            setRounds(newRounds);
                          }}
                        >
                          {round.winner === 2 ? "\u2713" : "-"}
                        </Button>
                        <span className="text-sm w-12">
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
