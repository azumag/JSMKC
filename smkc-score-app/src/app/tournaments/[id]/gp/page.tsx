"use client";

/**
 * Grand Prix (GP) Qualification Page
 *
 * Admin page for managing GP qualification rounds.
 * GP uses cup-based races with driver points (1st=9, 2nd=6).
 * Players compete in round-robin groups, and standings are
 * calculated by match score (wins×2 + ties×1) with driver points as tiebreaker.
 *
 * Features:
 * - Group standings display with sortable columns
 * - Match list with completion tracking
 * - Setup dialog for creating groups and round-robin matches
 * - Match result dialog with cup selection and race position entry
 * - CSV/Excel export
 * - Real-time polling (3s interval)
 * - Navigation to finals bracket
 */

import { useState, useCallback, use } from "react";
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
  player: Player;
}

/** GP match with race details and player information */
interface GPMatch {
  id: string;
  matchNumber: number;
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
  const t = useTranslations('gp');
  const tc = useTranslations('common');
  const [isSetupDialogOpen, setIsSetupDialogOpen] = useState(false);
  const [isMatchDialogOpen, setIsMatchDialogOpen] = useState(false);
  const [selectedMatch, setSelectedMatch] = useState<GPMatch | null>(null);
  const [selectedCup, setSelectedCup] = useState<string>("");
  /* GP matches have exactly 4 races per cup */
  const [races, setRaces] = useState<Race[]>([
    { course: "", position1: null, position2: null },
    { course: "", position1: null, position2: null },
    { course: "", position1: null, position2: null },
    { course: "", position1: null, position2: null },
  ]);
  const [setupPlayers, setSetupPlayers] = useState<
    { playerId: string; group: string }[]
  >([]);
  const [exporting, setExporting] = useState(false);

  /** SMK has 4 cups, each with 5 courses */
  const CUPS = ["Mushroom", "Flower", "Star", "Special"] as const;

  /** Get courses belonging to a specific cup for the course selection dropdown */
  const getCupCourses = (cup: string): CourseAbbr[] => {
    return COURSE_INFO.filter((c) => c.cup === cup).map((c) => c.abbr);
  };

  /**
   * Fetch tournament GP data and player list in parallel.
   * Returns qualification standings, matches, and all registered players.
   */
  const fetchTournamentData = useCallback(async () => {
    const [gpResponse, playersResponse] = await Promise.all([
      fetch(`/api/tournaments/${tournamentId}/gp`),
      fetch("/api/players"),
    ]);

    if (!gpResponse.ok) {
      throw new Error(`Failed to fetch GP data: ${gpResponse.status}`);
    }

    if (!playersResponse.ok) {
      throw new Error(`Failed to fetch players: ${playersResponse.status}`);
    }

    const gpData = await gpResponse.json();
    const playersJson = await playersResponse.json();

    return {
      qualifications: gpData.qualifications || [],
      matches: gpData.matches || [],
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
      }
    } catch (err) {
      const metadata = err instanceof Error ? { message: err.message, stack: err.stack } : { error: err };
      logger.error("Failed to setup:", metadata);
    }
  };

  /**
   * Open the match result dialog pre-populated with existing data.
   * If the match already has results, load them into the form.
   */
  const openMatchDialog = (match: GPMatch) => {
    setSelectedMatch(match);
    if (match.cup && match.races && match.races.length === 4) {
      /* Pre-fill form with existing match data for editing */
      setSelectedCup(match.cup);
      setRaces(match.races as Race[]);
    } else {
      /* Reset form for new result entry */
      setSelectedCup("");
      setRaces([
        { course: "", position1: null, position2: null },
        { course: "", position1: null, position2: null },
        { course: "", position1: null, position2: null },
        { course: "", position1: null, position2: null },
      ]);
    }
    setIsMatchDialogOpen(true);
  };

  /**
   * Submit match result with cup and 4 race positions.
   * Validates all 4 races are complete before submission.
   */
  const handleMatchSubmit = async () => {
    if (!selectedMatch || !selectedCup) {
      alert(tc('pleaseSelectCup'));
      return;
    }

    /* All 4 races must have course and positions filled */
    const completedRaces = races.filter(
      (r) => r.course !== "" && r.position1 !== null && r.position2 !== null
    );

    if (completedRaces.length !== 4) {
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
        setRaces([
          { course: "", position1: null, position2: null },
          { course: "", position1: null, position2: null },
          { course: "", position1: null, position2: null },
          { course: "", position1: null, position2: null },
        ]);
        refetch();
      }
    } catch (err) {
      const metadata = err instanceof Error ? { message: err.message, stack: err.stack } : { error: err };
      logger.error("Failed to update match:", metadata);
    }
  };

  /** Add a player to the setup list (prevents duplicates) */
  const addPlayerToSetup = (playerId: string, group: string) => {
    if (!setupPlayers.find((p) => p.playerId === playerId)) {
      setSetupPlayers([...setupPlayers, { playerId, group }]);
    }
  };

  /** Remove a player from the setup list */
  const removePlayerFromSetup = (playerId: string) => {
    setSetupPlayers(setupPlayers.filter((p) => p.playerId !== playerId));
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
      a.download = `grand-prix-${new Date().toISOString().split("T")[0]}.xlsx`;
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
          <Button
            variant="outline"
            onClick={handleExport}
            disabled={exporting}
          >
            {exporting ? tc('exporting') : tc('exportToExcel')}
          </Button>
          {qualifications.length > 0 && (
            <Button asChild>
              <Link href={`/tournaments/${tournamentId}/gp/finals`}>
                {tc('goToFinals')}
              </Link>
            </Button>
          )}
          {/* Setup/Reset dialog for group configuration */}
          <Dialog open={isSetupDialogOpen} onOpenChange={setIsSetupDialogOpen}>
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
                {/* Player selection dropdown */}
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
          </Dialog>
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
                          <TableHead className="w-12">#</TableHead>
                          <TableHead>{tc('player')}</TableHead>
                          <TableHead className="text-center">{t('mp')}</TableHead>
                          <TableHead className="text-center">{t('w')}</TableHead>
                          <TableHead className="text-center">{t('t')}</TableHead>
                          <TableHead className="text-center">{t('l')}</TableHead>
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
                              <TableCell className="text-center font-bold">
                                {q.points}
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

          {/* Matches tab: all qualification matches */}
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
                      <TableHead className="text-center w-24">{tc('points')}</TableHead>
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
                            match.completed && match.points1 > match.points2
                              ? "font-bold"
                              : ""
                          }
                        >
                          {match.player1.nickname}
                        </TableCell>
                        <TableCell className="text-center font-mono">
                          {match.completed
                            ? `${match.points1} - ${match.points2}`
                            : "- - -"}
                        </TableCell>
                        <TableCell
                          className={
                            match.completed && match.points2 > match.points1
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
                            <Link href={`/tournaments/${tournamentId}/gp/match/${match.id}`}>
                              {tc('share')}
                            </Link>
                          </Button>
                          <Button
                            variant={match.completed ? "outline" : "default"}
                            size="sm"
                            onClick={() => openMatchDialog(match)}
                          >
                            {match.completed ? tc('edit') : tc('enterResult')}
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
            {/* Cup selection - determines which 5 courses are available */}
            <div>
              <Label>{t('selectCup')}</Label>
              <Select value={selectedCup} onValueChange={setSelectedCup}>
                <SelectTrigger>
                  <SelectValue placeholder={t('selectCupPlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  {CUPS.map((cup) => (
                    <SelectItem key={cup} value={cup}>
                      {cup}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Race-by-race entry table (4 races per cup) */}
            {selectedCup && (
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
                      <TableRow key={index}>
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
                                value === "" ? null : parseInt(value);
                              setRaces(newRaces);
                            }}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder={tc('position')} />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="1">{tc('first')}</SelectItem>
                              <SelectItem value="2">{tc('second')}</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <Select
                            value={race.position2?.toString() || ""}
                            onValueChange={(value) => {
                              const newRaces = [...races];
                              newRaces[index].position2 =
                                value === "" ? null : parseInt(value);
                              setRaces(newRaces);
                            }}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder={tc('position')} />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="1">{tc('first')}</SelectItem>
                              <SelectItem value="2">{tc('second')}</SelectItem>
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
                          acc + (r.position1 === 1 ? 9 : r.position1 === 2 ? 6 : 0),
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
                          acc + (r.position2 === 1 ? 9 : r.position2 === 2 ? 6 : 0),
                        0
                      )}
                      pts
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleMatchSubmit}>{tc('saveResult')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
