"use client";

import { useState, useEffect, useCallback, use } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface Player {
  id: string;
  name: string;
  nickname: string;
}

interface BMQualification {
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

interface BMMatch {
  id: string;
  matchNumber: number;
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

export default function BattleModePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: tournamentId } = use(params);
  const [qualifications, setQualifications] = useState<BMQualification[]>([]);
  const [matches, setMatches] = useState<BMMatch[]>([]);
  const [allPlayers, setAllPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSetupDialogOpen, setIsSetupDialogOpen] = useState(false);
  const [isScoreDialogOpen, setIsScoreDialogOpen] = useState(false);
  const [selectedMatch, setSelectedMatch] = useState<BMMatch | null>(null);
  const [scoreForm, setScoreForm] = useState({ score1: 0, score2: 0 });
  const [setupPlayers, setSetupPlayers] = useState<
    { playerId: string; group: string }[]
  >([]);

  const fetchData = useCallback(async () => {
    try {
      const [bmResponse, playersResponse] = await Promise.all([
        fetch(`/api/tournaments/${tournamentId}/bm`),
        fetch("/api/players"),
      ]);

      if (bmResponse.ok) {
        const data = await bmResponse.json();
        setQualifications(data.qualifications || []);
        setMatches(data.matches || []);
      }

      if (playersResponse.ok) {
        const players = await playersResponse.json();
        setAllPlayers(players);
      }
    } catch (err) {
      console.error("Failed to fetch data:", err);
    } finally {
      setLoading(false);
    }
  }, [tournamentId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSetup = async () => {
    if (setupPlayers.length === 0) {
      alert("Please add at least one player");
      return;
    }

    try {
      const response = await fetch(`/api/tournaments/${tournamentId}/bm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ players: setupPlayers }),
      });

      if (response.ok) {
        setIsSetupDialogOpen(false);
        setSetupPlayers([]);
        fetchData();
      }
    } catch (err) {
      console.error("Failed to setup:", err);
    }
  };

  const handleScoreSubmit = async () => {
    if (!selectedMatch) return;

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
        fetchData();
      }
    } catch (err) {
      console.error("Failed to update score:", err);
    }
  };

  const openScoreDialog = (match: BMMatch) => {
    setSelectedMatch(match);
    setScoreForm({ score1: match.score1, score2: match.score2 });
    setIsScoreDialogOpen(true);
  };

  const addPlayerToSetup = (playerId: string, group: string) => {
    if (!setupPlayers.find((p) => p.playerId === playerId)) {
      setSetupPlayers([...setupPlayers, { playerId, group }]);
    }
  };

  const removePlayerFromSetup = (playerId: string) => {
    setSetupPlayers(setupPlayers.filter((p) => p.playerId !== playerId));
  };

  const groups = [...new Set(qualifications.map((q) => q.group))].sort();

  if (loading) {
    return <div className="text-center py-8">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Battle Mode</h1>
          <p className="text-muted-foreground">
            Qualification round-robin and finals
          </p>
        </div>
        <div className="flex gap-2">
          {qualifications.length > 0 && (
            <Button asChild>
              <Link href={`/tournaments/${tournamentId}/bm/finals`}>
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
                <DialogTitle>Setup Battle Mode Groups</DialogTitle>
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
                            <Link href={`/tournaments/${tournamentId}/bm/match/${match.id}`}>
                              Share
                            </Link>
                          </Button>
                          <Button
                            variant={match.completed ? "outline" : "default"}
                            size="sm"
                            onClick={() => openScoreDialog(match)}
                          >
                            {match.completed ? "Edit" : "Enter Score"}
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

      {/* Score Entry Dialog */}
      <Dialog open={isScoreDialogOpen} onOpenChange={setIsScoreDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enter Match Score</DialogTitle>
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
            <div className="flex items-center justify-center gap-4">
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
            {scoreForm.score1 + scoreForm.score2 !== 4 && (
              <p className="text-sm text-yellow-600 text-center">
                Total rounds should equal 4
              </p>
            )}
          </div>
          <DialogFooter>
            <Button onClick={handleScoreSubmit}>Save Score</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
