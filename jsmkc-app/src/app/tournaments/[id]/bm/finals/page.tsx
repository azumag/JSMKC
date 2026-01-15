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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { DoubleEliminationBracket } from "@/components/tournament/double-elimination-bracket";

interface Player {
  id: string;
  name: string;
  nickname: string;
}

interface BMMatch {
  id: string;
  matchNumber: number;
  round: string | null;
  player1Id: string;
  player2Id: string;
  score1: number;
  score2: number;
  completed: boolean;
  player1: Player;
  player2: Player;
}

interface BracketMatch {
  matchNumber: number;
  round: string;
  bracket: "winners" | "losers" | "grand_final";
  player1Seed?: number;
  player2Seed?: number;
}

interface SeededPlayer {
  seed: number;
  playerId: string;
  player: Player;
}

export default function BattleModeFinals({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: tournamentId } = use(params);
  const [matches, setMatches] = useState<BMMatch[]>([]);
  const [bracketStructure, setBracketStructure] = useState<BracketMatch[]>([]);
  const [seededPlayers, setSeededPlayers] = useState<SeededPlayer[]>([]);
  const [roundNames, setRoundNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [isScoreDialogOpen, setIsScoreDialogOpen] = useState(false);
  const [selectedMatch, setSelectedMatch] = useState<BMMatch | null>(null);
  const [scoreForm, setScoreForm] = useState({ score1: 0, score2: 0 });
  const [champion, setChampion] = useState<Player | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const response = await fetch(`/api/tournaments/${tournamentId}/bm/finals`);
      if (response.ok) {
        const data = await response.json();
        setMatches(data.matches || []);
        setBracketStructure(data.bracketStructure || []);
        setRoundNames(data.roundNames || {});
      }
    } catch (err) {
      console.error("Failed to fetch finals data:", err);
    } finally {
      setLoading(false);
    }
  }, [tournamentId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleCreateBracket = async () => {
    setCreating(true);
    try {
      const response = await fetch(`/api/tournaments/${tournamentId}/bm/finals`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topN: 8 }),
      });

      if (response.ok) {
        const data = await response.json();
        setMatches(data.matches || []);
        setBracketStructure(data.bracketStructure || []);
        setSeededPlayers(data.seededPlayers || []);
        fetchData();
      } else {
        const error = await response.json();
        alert(error.error || "Failed to create bracket");
      }
    } catch (err) {
      console.error("Failed to create bracket:", err);
      alert("Failed to create bracket");
    } finally {
      setCreating(false);
    }
  };

  const openScoreDialog = (match: BMMatch) => {
    setSelectedMatch(match);
    setScoreForm({ score1: match.score1, score2: match.score2 });
    setIsScoreDialogOpen(true);
  };

  const handleScoreSubmit = async () => {
    if (!selectedMatch) return;

    try {
      const response = await fetch(`/api/tournaments/${tournamentId}/bm/finals`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          matchId: selectedMatch.id,
          score1: scoreForm.score1,
          score2: scoreForm.score2,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setIsScoreDialogOpen(false);
        setSelectedMatch(null);
        setScoreForm({ score1: 0, score2: 0 });
        fetchData();

        if (data.isComplete && data.champion) {
          // Find champion player
          const winnerMatch = matches.find(
            (m) =>
              m.player1Id === data.champion || m.player2Id === data.champion
          );
          if (winnerMatch) {
            const champPlayer =
              winnerMatch.player1Id === data.champion
                ? winnerMatch.player1
                : winnerMatch.player2;
            setChampion(champPlayer);
          }
        }
      } else {
        const error = await response.json();
        alert(error.error || "Failed to update score");
      }
    } catch (err) {
      console.error("Failed to update score:", err);
      alert("Failed to update score");
    }
  };

  // Calculate progress
  const completedMatches = matches.filter((m) => m.completed).length;
  const totalMatches = matches.length;

  if (loading) {
    return <div className="text-center py-8">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Battle Mode Finals</h1>
          <p className="text-muted-foreground">
            Double Elimination Tournament
          </p>
        </div>
        <div className="flex gap-2">
          {matches.length === 0 ? (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button disabled={creating}>
                  {creating ? "Creating..." : "Generate Bracket"}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Generate Finals Bracket?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will create a double elimination bracket using the top
                    8 players from the qualification round. Make sure all
                    qualification matches are completed.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleCreateBracket}>
                    Generate
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          ) : (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" disabled={creating}>
                  Reset Bracket
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Reset Finals Bracket?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will delete all existing finals matches and create a
                    new bracket. This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleCreateBracket}>
                    Reset
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
          <Button variant="outline" asChild>
            <Link href={`/tournaments/${tournamentId}/bm`}>
              Back to Qualification
            </Link>
          </Button>
        </div>
      </div>

      {/* Champion Banner */}
      {champion && (
        <Card className="border-yellow-500 bg-yellow-500/10">
          <CardContent className="py-6 text-center">
            <div className="text-4xl mb-2">🏆</div>
            <h2 className="text-2xl font-bold">Champion</h2>
            <p className="text-3xl font-bold text-yellow-500 mt-2">
              {champion.nickname}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Progress */}
      {matches.length > 0 && (
        <div className="flex items-center gap-4">
          <Badge variant="outline" className="text-sm">
            Progress: {completedMatches} / {totalMatches} matches
          </Badge>
          {completedMatches === totalMatches && totalMatches > 0 && (
            <Badge className="bg-green-500">Tournament Complete</Badge>
          )}
        </div>
      )}

      {/* Bracket or Empty State */}
      {matches.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No Finals Bracket Yet</CardTitle>
            <CardDescription>
              Generate a bracket to start the finals tournament.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              The finals bracket will be generated using the top 8 players from
              the qualification standings. The bracket uses a double elimination
              format:
            </p>
            <ul className="list-disc list-inside mt-4 space-y-2 text-sm text-muted-foreground">
              <li>
                <strong>Winners Bracket:</strong> Players who haven&apos;t lost
                yet
              </li>
              <li>
                <strong>Losers Bracket:</strong> Players with one loss get a
                second chance
              </li>
              <li>
                <strong>Grand Final:</strong> Winners champion vs Losers
                champion
              </li>
              <li>
                <strong>Reset Match:</strong> If the Losers champion wins the
                Grand Final, a reset match determines the true champion
              </li>
            </ul>
          </CardContent>
        </Card>
      ) : (
        <DoubleEliminationBracket
          matches={matches}
          bracketStructure={bracketStructure}
          roundNames={roundNames}
          seededPlayers={seededPlayers}
          onMatchClick={openScoreDialog}
        />
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
                  {selectedMatch.round && (
                    <span className="block text-xs mt-1">
                      {roundNames[selectedMatch.round] || selectedMatch.round}
                    </span>
                  )}
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
            {scoreForm.score1 + scoreForm.score2 > 0 &&
              scoreForm.score1 < 3 &&
              scoreForm.score2 < 3 && (
                <p className="text-sm text-yellow-600 text-center">
                  Match needs a winner (first to 3)
                </p>
              )}
          </div>
          <DialogFooter>
            <Button
              onClick={handleScoreSubmit}
              disabled={scoreForm.score1 < 3 && scoreForm.score2 < 3}
            >
              Save Score
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
