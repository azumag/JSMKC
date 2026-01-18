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

interface Player {
  id: string;
  name: string;
  nickname: string;
}

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
  const [qualifications, setQualifications] = useState<MRQualification[]>([]);
  const [matches, setMatches] = useState<MRMatch[]>([]);
  const [allPlayers, setAllPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSetupDialogOpen, setIsSetupDialogOpen] = useState(false);
  const [isMatchDialogOpen, setIsMatchDialogOpen] = useState(false);
  const [selectedMatch, setSelectedMatch] = useState<MRMatch | null>(null);
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
    const players = await playersResponse.json();

    return {
      qualifications: mrData.qualifications || [],
      matches: mrData.matches || [],
      allPlayers: players,
    };
  }, [tournamentId]);

  const { data: pollData, loading: pollLoading, lastUpdated, isPolling, refetch } = usePolling({
    fetchFn: fetchTournamentData,
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

  const handleMatchSubmit = async () => {
    if (!selectedMatch) return;

    const usedCourses = rounds.map(r => r.course).filter(c => c !== "");
    if (usedCourses.length !== 5 || new Set(usedCourses).size !== 5) {
      alert("Please select 5 unique courses");
      return;
    }

    const winnerCount = rounds.filter(r => r.winner === 1).length;
    const loserCount = rounds.filter(r => r.winner === 2).length;

    if (winnerCount < 3 && loserCount < 3) {
      alert("Match must have a winner (3 out of 5)");
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
      const response = await fetch(`/api/tournaments/${tournamentId}/mr/export`);
      if (!response.ok) {
        throw new Error("Failed to export data");
      }

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

  const groups = [...new Set(qualifications.map((q) => q.group))].sort();

  if (loading) {
    return <div className="text-center py-8">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4">
        <div>
          <h1 className="text-3xl font-bold">Match Race</h1>
          <p className="text-muted-foreground">
            5-race course selection and point-based scoring
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
              <Link href={`/tournaments/${tournamentId}/mr/finals`}>
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
                <DialogTitle>Setup Match Race Groups</DialogTitle>
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
                          <TableHead className="text-center">+/-</TableHead>
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
                      <TableHead className="text-center w-24">Score</TableHead>
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
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
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
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">Race</TableHead>
                  <TableHead>Course</TableHead>
                  <TableHead className="text-center">Winner</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rounds.map((round, index) => (
                  <TableRow key={index}>
                    <TableCell className="font-medium">Race {index + 1}</TableCell>
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
                          <SelectValue placeholder="Select course..." />
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
                          {round.winner === 1 ? "✓" : "-"}
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
                          {round.winner === 2 ? "✓" : "-"}
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
            <Button onClick={handleMatchSubmit}>Save Result</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
