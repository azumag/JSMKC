/**
 * Match Race Match Detail/Share Page
 *
 * Public-facing page for individual MR match viewing and score reporting.
 * Can be shared via link for players to enter their results.
 *
 * Features:
 * - Real-time match status display with polling
 * - Player identity selection (I am Player 1/2)
 * - 5-race course and winner entry
 * - Completed match display with race details
 * - Post-submission confirmation view
 *
 * @route /tournaments/[id]/mr/match/[matchId]
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

/** MR match with full details */
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
  player1ReportedScore1?: number;
  player1ReportedScore2?: number;
  player2ReportedScore1?: number;
  player2ReportedScore2?: number;
}

/** Tournament metadata */
interface Tournament {
  id: string;
  name: string;
}

/** Individual race round entry */
interface Round {
  course: CourseAbbr | "";
  winner: number | null;
}

export default function MatchDetailPage({
  params,
}: {
  params: Promise<{ id: string; matchId: string }>;
}) {
  const { id: tournamentId, matchId } = use(params);
  const [match, setMatch] = useState<MRMatch | null>(null);
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState<1 | 2 | null>(null);
  /* Initialize 5 empty rounds for match entry */
  const [rounds, setRounds] = useState<Round[]>([
    { course: "", winner: null },
    { course: "", winner: null },
    { course: "", winner: null },
    { course: "", winner: null },
    { course: "", winner: null },
  ]);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  /**
   * Fetch match and tournament data concurrently.
   * Called by the polling hook for real-time updates.
   */
  const fetchMatchData = useCallback(async () => {
    const [matchRes, tournamentRes] = await Promise.all([
      fetch(`/api/tournaments/${tournamentId}/mr/match/${matchId}`),
      fetch(`/api/tournaments/${tournamentId}`),
    ]);

    if (!matchRes.ok) {
      throw new Error(`Failed to fetch MR match data: ${matchRes.status}`);
    }

    if (!tournamentRes.ok) {
      throw new Error(`Failed to fetch tournament: ${tournamentRes.status}`);
    }

    const matchData = await matchRes.json();
    const tournamentData = await tournamentRes.json();

    return {
      match: matchData,
      tournament: tournamentData,
    };
  }, [tournamentId, matchId]);

  /* Poll every 3 seconds for live updates */
  const { data: pollData, isLoading: pollLoading, lastUpdated, isPolling, refetch } = usePolling(
    fetchMatchData, {
    interval: 3000,
  });

  /* Update local state from polling data */
  useEffect(() => {
    if (pollData) {
      setMatch(pollData.match);
      setTournament(pollData.tournament);
    }
  }, [pollData]);

  useEffect(() => {
    setLoading(pollLoading);
  }, [pollLoading]);

  /**
   * Submit match result after validation.
   * Requires player selection, 5 unique courses, and a winner.
   */
  const handleSubmit = async () => {
    if (selectedPlayer === null) {
      setError("Please select which player you are");
      return;
    }

    /* Validate 5 unique courses */
    const usedCourses = rounds.map(r => r.course).filter(c => c !== "");
    if (usedCourses.length !== 5 || new Set(usedCourses).size !== 5) {
      setError("Please select 5 unique courses");
      return;
    }

    /* Count wins and validate a winner exists */
    const winnerCount = rounds.filter(r => r.winner === 1).length;
    const loserCount = rounds.filter(r => r.winner === 2).length;

    if (winnerCount < 3 && loserCount < 3) {
      setError("Match must have a winner (3 out of 5)");
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      const response = await fetch(
        `/api/tournaments/${tournamentId}/mr/match/${matchId}/report`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            reportingPlayer: selectedPlayer,
            score1: winnerCount,
            score2: loserCount,
            rounds,
          }),
        }
      );

      if (response.ok) {
        setSubmitted(true);
        refetch();
      } else {
        const data = await response.json();
        setError(data.error || "Failed to submit result");
      }
    } catch (err) {
      console.error("Failed to submit:", err);
      setError("Failed to submit result");
    } finally {
      setSubmitting(false);
    }
  };

  /** Look up course display name from abbreviation */
  const getCourseName = (abbr: string) => {
    const course = COURSE_INFO.find(c => c.abbr === abbr);
    return course ? course.name : abbr;
  };

  /* Loading skeleton */
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="space-y-6 w-full max-w-2xl px-4">
          <div className="space-y-3">
            <div className="h-9 w-32 bg-muted animate-pulse rounded" />
            <div className="h-5 w-48 bg-muted animate-pulse rounded" />
          </div>
          <CardSkeleton />
        </div>
      </div>
    );
  }

  if (!match || !tournament) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>Match not found</p>
      </div>
    );
  }

  /* Calculate current score from rounds for display */
  const p1Wins = rounds.filter(r => r.winner === 1).length;
  const p2Wins = rounds.filter(r => r.winner === 2).length;

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-2xl mx-auto space-y-4">
        {/* Tournament and match header */}
        <div className="text-center">
          <h1 className="text-xl font-bold">{tournament.name}</h1>
          <p className="text-muted-foreground">Match Race - Match #{match.matchNumber}</p>
          <div className="mt-2">
            <UpdateIndicator lastUpdated={lastUpdated} isPolling={isPolling} />
          </div>
        </div>

        {/* Match info card */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex justify-between items-center">
              <span>{match.player1.nickname}</span>
              <span className="text-2xl font-mono">vs</span>
              <span>{match.player2.nickname}</span>
            </CardTitle>
            {match.completed && (
              <CardDescription className="text-center">
                <Badge variant="secondary" className="text-lg px-4 py-1">
                  {match.score1} - {match.score2}
                </Badge>
              </CardDescription>
            )}
          </CardHeader>
        </Card>

        {/* Score entry form (shown when match is not completed and not submitted) */}
        {!match.completed && !submitted && (
          <Card>
            <CardHeader>
              <CardTitle>Enter Result</CardTitle>
              <CardDescription>
                Select who you are and enter the race results
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Player identity selection */}
              <div className="space-y-2">
                <p className="text-sm font-medium">I am:</p>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant={selectedPlayer === 1 ? "default" : "outline"}
                    className="h-16 text-lg"
                    onClick={() => setSelectedPlayer(1)}
                  >
                    {match.player1.nickname}
                  </Button>
                  <Button
                    variant={selectedPlayer === 2 ? "default" : "outline"}
                    className="h-16 text-lg"
                    onClick={() => setSelectedPlayer(2)}
                  >
                    {match.player2.nickname}
                  </Button>
                </div>
              </div>

              {/* Race entry form (shown after player selection) */}
              {selectedPlayer && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <p className="text-sm font-medium text-center">Current Score</p>
                      <p className="text-sm font-medium text-center">
                        {p1Wins} - {p2Wins}
                      </p>
                    </div>
                  </div>

                  {/* 5-race entry rows */}
                  <div className="space-y-3">
                    {rounds.map((round, index) => (
                      <div key={index} className="flex items-center gap-2">
                        <span className="text-sm font-medium w-20">Race {index + 1}</span>
                        <Select
                          value={round.course}
                          onValueChange={(value) => {
                            const newRounds = [...rounds];
                            newRounds[index].course = value as CourseAbbr;
                            setRounds(newRounds);
                          }}
                        >
                          <SelectTrigger className="flex-1">
                            <SelectValue placeholder="Course..." />
                          </SelectTrigger>
                          <SelectContent>
                            {COURSE_INFO.map((course) => (
                              <SelectItem key={course.abbr} value={course.abbr}>
                                {course.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button
                          variant={round.winner === 1 ? "default" : "outline"}
                          size="sm"
                          onClick={() => {
                            const newRounds = [...rounds];
                            newRounds[index].winner = round.winner === 1 ? null : 1;
                            setRounds(newRounds);
                          }}
                          className="w-24"
                        >
                          {selectedPlayer === 1 ? "I Won" : `${match.player1.nickname} Won`}
                        </Button>
                        <Button
                          variant={round.winner === 2 ? "default" : "outline"}
                          size="sm"
                          onClick={() => {
                            const newRounds = [...rounds];
                            newRounds[index].winner = round.winner === 2 ? null : 2;
                            setRounds(newRounds);
                          }}
                          className="w-24"
                        >
                          {selectedPlayer === 2 ? "I Won" : `${match.player2.nickname} Won`}
                        </Button>
                      </div>
                    ))}
                  </div>

                  {usedCoursesWarning()}
                  {winnerWarning()}

                  {error && (
                    <p className="text-red-500 text-sm text-center">{error}</p>
                  )}

                  <Button
                    className="w-full h-14 text-lg"
                    onClick={handleSubmit}
                    disabled={submitting || !canSubmit()}
                  >
                    {submitting ? "Submitting..." : "Submit Result"}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Post-submission confirmation */}
        {submitted && !match.completed && (
          <Card>
            <CardContent className="py-8 text-center">
              <div className="text-4xl mb-4">&#10003;</div>
              <h3 className="text-lg font-semibold mb-2">Result Submitted!</h3>
              <p className="text-muted-foreground">
                Waiting for the other player to confirm...
              </p>
              <p className="text-sm mt-4">
                Your report: {p1Wins} - {p2Wins}
              </p>
            </CardContent>
          </Card>
        )}

        {/* Completed match display with race details */}
        {match.completed && match.rounds && (
          <Card>
            <CardHeader>
              <CardTitle>Match Complete</CardTitle>
              <CardDescription>
                Final Score: {match.score1} - {match.score2}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table className="text-sm">
                <TableHeader>
                  <TableRow>
                    <TableHead>Race</TableHead>
                    <TableHead>Course</TableHead>
                    <TableHead>Winner</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {match.rounds.map((round, index) => (
                    <TableRow key={index}>
                      <TableCell>Race {index + 1}</TableCell>
                      <TableCell>{getCourseName(round.course)}</TableCell>
                      <TableCell className="font-medium">
                        {round.winner === 1
                          ? match.player1.nickname
                          : round.winner === 2
                          ? match.player2.nickname
                          : "-"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <p className="mt-4 text-center">
                {match.score1 >= 3
                  ? `${match.player1.nickname} wins!`
                  : match.score2 >= 3
                  ? `${match.player2.nickname} wins!`
                  : "Draw"}
              </p>
            </CardContent>
          </Card>
        )}

        {/* Navigation link back to MR main page */}
        <div className="text-center">
          <Link
            href={`/tournaments/${tournamentId}/mr`}
            className="text-sm text-muted-foreground hover:underline"
          >
            &larr; Back to Match Race
          </Link>
        </div>
      </div>
    </div>
  );
}

/** Placeholder for course uniqueness warning (reserved for future enhancement) */
function usedCoursesWarning() {
  return null;
}

/** Placeholder for winner validation warning (reserved for future enhancement) */
function winnerWarning() {
  return null;
}

/** Placeholder for submit readiness check (reserved for future enhancement) */
function canSubmit() {
  return true;
}
