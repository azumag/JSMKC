/**
 * Match Race Finals Page
 *
 * Double elimination tournament bracket page for MR finals.
 * Features:
 * - Visual bracket display using DoubleEliminationBracket component
 * - Bracket generation from top 8 qualifiers
 * - Match result entry via dialog
 * - Champion announcement
 * - Real-time polling for live tournament updates
 * - Bracket reset with confirmation dialog
 *
 * MR finals use best-of-5 races with course selection.
 * The bracket follows standard double elimination with
 * winners bracket, losers bracket, grand final, and reset.
 *
 * @route /tournaments/[id]/mr/finals
 */
"use client";

import { useState, useEffect, useCallback, use } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DoubleEliminationBracket } from "@/components/tournament/double-elimination-bracket";
import { COURSE_INFO, type CourseAbbr } from "@/lib/constants";
import { usePolling } from "@/lib/hooks/usePolling";
import { UpdateIndicator } from "@/components/ui/update-indicator";
import { CardSkeleton } from "@/components/ui/loading-skeleton";
import { createLogger } from "@/lib/client-logger";

/** Client-side logger for error tracking */
const logger = createLogger({ serviceName: 'tournaments-mr-finals' });

/** Player data from the API */
interface Player {
  id: string;
  name: string;
  nickname: string;
}

/** MR finals match record */
interface MRMatch {
  id: string;
  matchNumber: number;
  round: string | null;
  player1Id: string;
  player2Id: string;
  score1: number;
  score2: number;
  completed: boolean;
  rounds?: { course: string; winner: number }[];
  player1: Player;
  player2: Player;
}

/** Abstract bracket match structure */
interface BracketMatch {
  matchNumber: number;
  round: string;
  bracket: "winners" | "losers" | "grand_final";
  player1Seed?: number;
  player2Seed?: number;
}

/** Player with seed number from qualification */
interface SeededPlayer {
  seed: number;
  playerId: string;
  player: Player;
}

/** Individual race round entry */
interface Round {
  course: CourseAbbr | "";
  winner: number | null;
}

export default function MatchRaceFinals({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: tournamentId } = use(params);
  const [matches, setMatches] = useState<MRMatch[]>([]);
  const [bracketStructure, setBracketStructure] = useState<BracketMatch[]>([]);
  const [seededPlayers, setSeededPlayers] = useState<SeededPlayer[]>([]);
  const [roundNames, setRoundNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [isMatchDialogOpen, setIsMatchDialogOpen] = useState(false);
  const [selectedMatch, setSelectedMatch] = useState<MRMatch | null>(null);
  /* Initialize 5 empty rounds for match result dialog */
  const [rounds, setRounds] = useState<Round[]>([
    { course: "", winner: null },
    { course: "", winner: null },
    { course: "", winner: null },
    { course: "", winner: null },
    { course: "", winner: null },
  ]);
  const [champion, setChampion] = useState<Player | null>(null);

  /**
   * Fetch finals bracket data including matches,
   * bracket structure, and round display names.
   */
  const fetchFinalsData = useCallback(async () => {
    const response = await fetch(`/api/tournaments/${tournamentId}/mr/finals`);

    if (!response.ok) {
      throw new Error(`Failed to fetch MR finals data: ${response.status}`);
    }

    const data = await response.json();

    return {
      matches: data.matches || [],
      bracketStructure: data.bracketStructure || [],
      roundNames: data.roundNames || {},
    };
  }, [tournamentId]);

  /* Poll every 3 seconds for live tournament updates */
  const { data: pollData, isLoading: pollLoading, lastUpdated, isPolling, refetch } = usePolling(
    fetchFinalsData, {
    interval: 3000,
  });

  /* Update local state from polling data */
  useEffect(() => {
    if (pollData) {
      setMatches(pollData.matches);
      setBracketStructure(pollData.bracketStructure);
      setRoundNames(pollData.roundNames);
    }
  }, [pollData]);

  useEffect(() => {
    setLoading(pollLoading);
  }, [pollLoading]);

  /**
   * Generate the finals bracket from top 8 qualification results.
   * Shows confirmation dialog before creation.
   */
  const handleCreateBracket = async () => {
    setCreating(true);
    try {
      const response = await fetch(`/api/tournaments/${tournamentId}/mr/finals`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topN: 8 }),
      });

      if (response.ok) {
        const data = await response.json();
        setMatches(data.matches || []);
        setBracketStructure(data.bracketStructure || []);
        setSeededPlayers(data.seededPlayers || []);
        refetch();
      } else {
        const error = await response.json();
        alert(error.error || "Failed to create bracket");
      }
    } catch (err) {
      const metadata = err instanceof Error ? { message: err.message, stack: err.stack } : { error: err };
      logger.error("Failed to create bracket:", metadata as any);
      alert("Failed to create bracket");
    } finally {
      setCreating(false);
    }
  };

  /**
   * Open match result dialog, pre-filling existing round data if available.
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
   * Submit match result for a finals match.
   * Validates courses and winner, then updates via API.
   * Checks response for tournament completion.
   */
  const handleMatchSubmit = async () => {
    if (!selectedMatch) return;

    /* Validate 5 unique courses */
    const usedCourses = rounds.map(r => r.course).filter(c => c !== "");
    if (usedCourses.length !== 5 || new Set(usedCourses).size !== 5) {
      alert("Please select 5 unique courses");
      return;
    }

    /* Count wins and validate a winner */
    const winnerCount = rounds.filter(r => r.winner === 1).length;
    const loserCount = rounds.filter(r => r.winner === 2).length;

    if (winnerCount < 3 && loserCount < 3) {
      alert("Match must have a winner (3 out of 5)");
      return;
    }

    try {
      const response = await fetch(`/api/tournaments/${tournamentId}/mr/finals`, {
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
        const data = await response.json();
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

        /* Check if tournament is complete and announce champion */
        if (data.isComplete && data.champion) {
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
        alert(error.error || "Failed to update match");
      }
    } catch (err) {
      const metadata = err instanceof Error ? { message: err.message, stack: err.stack } : { error: err };
      logger.error("Failed to update match:", metadata as any);
      alert("Failed to update match");
    }
  };

  /* Track tournament progress */
  const completedMatches = matches.filter((m) => m.completed).length;
  const totalMatches = matches.length;

  /* Loading skeleton */
  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4">
          <div className="space-y-3">
            <div className="h-9 w-40 bg-muted animate-pulse rounded" />
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
          <h1 className="text-3xl font-bold">Match Race Finals</h1>
          <p className="text-muted-foreground">
            Double Elimination Tournament
          </p>
          <div className="mt-2">
            <UpdateIndicator lastUpdated={lastUpdated} isPolling={isPolling} />
          </div>
        </div>
        <div className="flex gap-2">
          {/* Generate or Reset bracket with confirmation */}
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
                    This will create a double elimination bracket using top
                    8 players from qualification round. Make sure all
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
            <Link href={`/tournaments/${tournamentId}/mr`}>
              Back to Qualification
            </Link>
          </Button>
        </div>
      </div>

      {/* Champion announcement banner */}
      {champion && (
        <Card className="border-yellow-500 bg-yellow-500/10">
          <CardContent className="py-6 text-center">
            <div className="text-4xl mb-2">&#127942;</div>
            <h2 className="text-2xl font-bold">Champion</h2>
            <p className="text-3xl font-bold text-yellow-500 mt-2">
              {champion.nickname}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Progress indicator */}
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

      {/* Empty state or bracket display */}
      {matches.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No Finals Bracket Yet</CardTitle>
            <CardDescription>
              Generate a bracket to start finals tournament.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              The finals bracket will be generated using the top 8 players from
              qualification standings. The bracket uses a double elimination
              format with 5-race matches:
            </p>
            <ul className="list-disc list-inside mt-4 space-y-2 text-sm text-muted-foreground">
              <li>
                <strong>5 Races:</strong> Each match consists of 5 unique courses
              </li>
              <li>
                <strong>First to 3:</strong> First player to win 3 races wins the match
              </li>
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
                <strong>Reset Match:</strong> If Losers champion wins
                Grand Final, a reset match determines the true champion
              </li>
            </ul>
          </CardContent>
        </Card>
      ) : (
        /* Visual bracket display component */
        <DoubleEliminationBracket
          matches={matches}
          bracketStructure={bracketStructure}
          roundNames={roundNames}
          seededPlayers={seededPlayers}
          onMatchClick={openMatchDialog}
        />
      )}

      {/* Match result entry dialog */}
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
            <Button
              onClick={handleMatchSubmit}
              disabled={
                rounds.filter(r => r.winner === 1).length < 3 &&
                rounds.filter(r => r.winner === 2).length < 3
              }
            >
              Save Result
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
