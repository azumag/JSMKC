"use client";

import { useState, useEffect, useCallback, use } from "react";
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

interface Player {
  id: string;
  name: string;
  nickname: string;
}

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
  const [qualifications, setQualifications] = useState<GPQualification[]>([]);
  const [matches, setMatches] = useState<GPMatch[]>([]);
  const [allPlayers, setAllPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSetupDialogOpen, setIsSetupDialogOpen] = useState(false);
  const [isMatchDialogOpen, setIsMatchDialogOpen] = useState(false);
  const [selectedMatch, setSelectedMatch] = useState<GPMatch | null>(null);
  const [selectedCup, setSelectedCup] = useState<string>("");
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

  const CUPS = ["Mushroom", "Flower", "Star", "Special"] as const;

  const getCupCourses = (cup: string): CourseAbbr[] => {
    return COURSE_INFO.filter((c) => c.cup === cup).map((c) => c.abbr);
  };

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
    const players = await playersResponse.json();

    return {
      qualifications: gpData.qualifications || [],
      matches: gpData.matches || [],
      allPlayers: players,
    };
  }, [tournamentId]);

  const { data: pollData, isLoading: pollLoading, lastUpdated, isPolling, refetch } = usePolling(
    fetchTournamentData, {
    interval: 3000,
  });

  useEffect(() => {
    if (pollData) {
      setQualifications(pollData.qualifications);
      setMatches(pollData.matches);
      setAllPlayers(pollData.allPlayers);
    }
  }, [pollData]);

  useEffect(() => {
    setLoading(pollLoading);
  }, [pollLoading]);

  const handleSetup = async () => {
    if (setupPlayers.length === 0) {
      alert("Please add at least one player");
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
      console.error("Failed to setup:", err);
    }
  };

  const openMatchDialog = (match: GPMatch) => {
    setSelectedMatch(match);
    if (match.cup && match.races && match.races.length === 4) {
      setSelectedCup(match.cup);
      setRaces(match.races as Race[]);
    } else {
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

  const handleMatchSubmit = async () => {
    if (!selectedMatch || !selectedCup) {
      alert("Please select a cup");
      return;
    }

    const completedRaces = races.filter(
      (r) => r.course !== "" && r.position1 !== null && r.position2 !== null
    );

    if (completedRaces.length !== 4) {
      alert("Please complete all 4 races");
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
      console.error("Failed to update match:", err);
    }
  };

  const addPlayerToSetup = (playerId: string, group: string) => {
    if (!setupPlayers.find((p) => p.playerId === playerId)) {
      setSetupPlayers([...setupPlayers, { playerId, group }]);
    }
  };

  const removePlayerFromSetup = (playerId: string) => {
    setSetupPlayers(setupPlayers.filter((p) => p.playerId !== playerId));
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const response = await fetch(`/api/tournaments/${tournamentId}/gp/export`);
      if (!response.ok) {
        throw new Error("Failed to export data");
      }

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
      console.error("Failed to export:", err);
    } finally {
      setExporting(false);
    }
  };

  const groups = [...new Set(qualifications.map((q) => q.group))].sort();

  if (loading) {
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
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4">
        <div>
          <h1 className="text-3xl font-bold">Grand Prix</h1>
          <p className="text-muted-foreground">
            Cup-based races with driver points
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
            {exporting ? "Exporting..." : "Export to Excel"}
          </Button>
          {qualifications.length > 0 && (
            <Button asChild>
              <Link href={`/tournaments/${tournamentId}/gp/finals`}>
                Go to Finals
              </Link>
            </Button>
          )}
          <Dialog open={isSetupDialogOpen} onOpenChange={setIsSetupDialogOpen}>
            <DialogTrigger asChild>
              <Button variant={qualifications.length > 0 ? "outline" : "default"}>
                {qualifications.length > 0 ? "Reset Setup" : "Setup Groups"}
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Setup Grand Prix Groups</DialogTitle>
                <DialogDescription>
                  Assign players to groups for the qualification round.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="flex gap-4">
                  <div className="flex-1">
                    <Label>Select Player</Label>
                    <Select
                      onValueChange={(playerId) => {
                        const player = allPlayers.find((p) => p.id === playerId);
                        if (player) {
                          addPlayerToSetup(playerId, "A");
                        }
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Choose player..." />
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

                <div className="border rounded-lg p-4">
                  <h4 className="font-medium mb-2">
                    Selected Players ({setupPlayers.length})
                  </h4>
                  {setupPlayers.length === 0 ? (
                    <p className="text-muted-foreground text-sm">
                      No players selected yet
                    </p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Player</TableHead>
                          <TableHead>Group</TableHead>
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
                                  Remove
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
                <Button onClick={handleSetup}>Create Groups & Matches</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <Button variant="outline" asChild>
            <Link href={`/tournaments/${tournamentId}`}>Back</Link>
          </Button>
        </div>
      </div>

      {qualifications.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            No groups set up yet. Click &quot;Setup Groups&quot; to begin.
          </CardContent>
        </Card>
      ) : (
        <Tabs defaultValue="standings" className="space-y-4">
          <TabsList>
            <TabsTrigger value="standings">Standings</TabsTrigger>
            <TabsTrigger value="matches">Matches</TabsTrigger>
          </TabsList>

          <TabsContent value="standings">
            <div className="grid gap-6">
              {groups.map((group) => (
                <Card key={group}>
                  <CardHeader>
                    <CardTitle>Group {group}</CardTitle>
                    <CardDescription>
                      {qualifications.filter((q) => q.group === group).length} players
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-12">#</TableHead>
                          <TableHead>Player</TableHead>
                          <TableHead className="text-center">MP</TableHead>
                          <TableHead className="text-center">W</TableHead>
                          <TableHead className="text-center">T</TableHead>
                          <TableHead className="text-center">L</TableHead>
                          <TableHead className="text-center">Pts</TableHead>
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

          <TabsContent value="matches">
            <Card>
              <CardHeader>
                <CardTitle>Match List</CardTitle>
                <CardDescription>
                  {matches.filter((m) => m.completed).length} / {matches.length} completed
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-16">#</TableHead>
                      <TableHead>Player 1</TableHead>
                      <TableHead className="text-center w-24">Points</TableHead>
                      <TableHead>Player 2</TableHead>
                      <TableHead className="text-right">Action</TableHead>
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
                              Share
                            </Link>
                          </Button>
                          <Button
                            variant={match.completed ? "outline" : "default"}
                            size="sm"
                            onClick={() => openMatchDialog(match)}
                          >
                            {match.completed ? "Edit" : "Enter Result"}
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

      <Dialog open={isMatchDialogOpen} onOpenChange={setIsMatchDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Enter Match Result</DialogTitle>
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
            <div>
              <Label>Select Cup</Label>
              <Select value={selectedCup} onValueChange={setSelectedCup}>
                <SelectTrigger>
                  <SelectValue placeholder="Select cup..." />
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

            {selectedCup && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-16">Race</TableHead>
                    <TableHead>Course</TableHead>
                    <TableHead className="text-center">P1 Position</TableHead>
                    <TableHead className="text-center">P2 Position</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {races.map((race, index) => {
                    const cupCourses = getCupCourses(selectedCup);
                    return (
                      <TableRow key={index}>
                        <TableCell className="font-medium">
                          Race {index + 1}
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
                              <SelectValue placeholder="Select course..." />
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
                              <SelectValue placeholder="Position..." />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="1">1st</SelectItem>
                              <SelectItem value="2">2nd</SelectItem>
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
                              <SelectValue placeholder="Position..." />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="1">1st</SelectItem>
                              <SelectItem value="2">2nd</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}

            <div className="bg-muted p-4 rounded-lg">
              <p className="text-sm font-medium mb-2">
                Driver Points: 1st = 9pts, 2nd = 6pts
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
            <Button onClick={handleMatchSubmit}>Save Result</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
