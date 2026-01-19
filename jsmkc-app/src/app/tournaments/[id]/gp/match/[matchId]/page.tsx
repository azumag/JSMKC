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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { COURSE_INFO, type CourseAbbr } from "@/lib/constants";
import { usePolling } from "@/lib/hooks/usePolling";
import { UpdateIndicator } from "@/components/ui/update-indicator";

interface Player {
  id: string;
  name: string;
  nickname: string;
}

interface GPMatch {
  id: string;
  matchNumber: number;
  player1Id: string;
  player2Id: string;
  points1: number;
  points2: number;
  completed: boolean;
  cup?: string;
  player1: Player;
  player2: Player;
  races?: {
    course: string;
    position1: number;
    position2: number;
    points1: number;
    points2: number;
  }[];
  player1ReportedPoints1?: number;
  player1ReportedPoints2?: number;
  player2ReportedPoints1?: number;
  player2ReportedPoints2?: number;
}

interface Tournament {
  id: string;
  name: string;
}

interface Race {
  course: CourseAbbr | "";
  position1: 1 | 2 | null;
  position2: 1 | 2 | null;
}

export default function GPMatchPage({
  params,
}: {
  params: Promise<{ id: string; matchId: string }>;
}) {
  const { id: tournamentId, matchId } = use(params);
  const [match, setMatch] = useState<GPMatch | null>(null);
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState<1 | 2 | null>(null);
  const [races, setRaces] = useState<Race[]>([
    { course: "", position1: null, position2: null },
    { course: "", position1: null, position2: null },
    { course: "", position1: null, position2: null },
    { course: "", position1: null, position2: null },
  ]);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  const fetchMatchData = useCallback(async () => {
    const [matchRes, tournamentRes] = await Promise.all([
      fetch(`/api/tournaments/${tournamentId}/gp/match/${matchId}`),
      fetch(`/api/tournaments/${tournamentId}`),
    ]);

    if (!matchRes.ok) {
      throw new Error(`Failed to fetch GP match data: ${matchRes.status}`);
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

  const { data: pollData, isLoading: pollLoading, lastUpdated, isPolling, refetch } = usePolling(
    fetchMatchData, {
    interval: 3000,
  });

  useEffect(() => {
    if (pollData) {
      setMatch(pollData.match);
      setTournament(pollData.tournament);
    }
  }, [pollData]);

  useEffect(() => {
    setLoading(pollLoading);
  }, [pollLoading]);

  const handleSubmit = async () => {
    if (selectedPlayer === null) {
      setError("Please select which player you are");
      return;
    }

    const usedCourses = races.map((r) => r.course).filter((c) => c !== "");
    if (usedCourses.length !== 4 || new Set(usedCourses).size !== 4) {
      setError("Please select 4 unique courses");
      return;
    }

    const incompleteRaces = races.filter(
      (r) => r.position1 === null || r.position2 === null
    );
    if (incompleteRaces.length > 0) {
      setError("Please complete all race positions");
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      const response = await fetch(
        `/api/tournaments/${tournamentId}/gp/match/${matchId}/report`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            reportingPlayer: selectedPlayer,
            races,
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

  const getCourseName = (abbr: string) => {
    const course = COURSE_INFO.find((c) => c.abbr === abbr);
    return course ? course.name : abbr;
  };

  const getPointsFromPosition = (position: number) => {
    if (position === 1) return 9;
    if (position === 2) return 6;
    return 0;
  };

  const totalPoints1 = races.reduce(
    (sum, r) => sum + (r.position1 ? getPointsFromPosition(r.position1) : 0),
    0
  );
  const totalPoints2 = races.reduce(
    (sum, r) => sum + (r.position2 ? getPointsFromPosition(r.position2) : 0),
    0
  );

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>Loading...</p>
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

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-2xl mx-auto space-y-4">
        <div className="text-center">
          <h1 className="text-xl font-bold">{tournament.name}</h1>
          <p className="text-muted-foreground">
            Grand Prix - Match #{match.matchNumber}
          </p>
          <div className="mt-2">
            <UpdateIndicator lastUpdated={lastUpdated} isPolling={isPolling} />
          </div>
        </div>

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
                  {match.points1} - {match.points2}
                </Badge>
              </CardDescription>
            )}
          </CardHeader>
        </Card>

        {!match.completed && !submitted && (
          <Card>
            <CardHeader>
              <CardTitle>Enter Result</CardTitle>
              <CardDescription>
                Select who you are and enter the race results
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
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

              {selectedPlayer && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <p className="text-sm font-medium text-center">
                        Current Score
                      </p>
                      <p className="text-sm font-medium text-center">
                        {totalPoints1} - {totalPoints2}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {races.map((race, index) => (
                      <div key={index} className="border rounded-lg p-3 space-y-2">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium w-20">
                            Race {index + 1}
                          </span>
                          <Select
                            value={race.course}
                            onValueChange={(value) => {
                              const newRaces = [...races];
                              newRaces[index].course = value as CourseAbbr;
                              setRaces(newRaces);
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
                        </div>
                        <div className="flex gap-2">
                          <Button
                            variant={
                              race.position1 === 1 ? "default" : "outline"
                            }
                            size="sm"
                            onClick={() => {
                              const newRaces = [...races];
                              newRaces[index].position1 =
                                newRaces[index].position1 === 1 ? null : 1;
                              setRaces(newRaces);
                            }}
                            className="flex-1"
                          >
                            {selectedPlayer === 1
                              ? "I Won (1st)"
                              : `${match.player1.nickname} Won (1st)`}
                          </Button>
                          <Button
                            variant={
                              race.position2 === 1 ? "default" : "outline"
                            }
                            size="sm"
                            onClick={() => {
                              const newRaces = [...races];
                              newRaces[index].position2 =
                                newRaces[index].position2 === 1 ? null : 1;
                              setRaces(newRaces);
                            }}
                            className="flex-1"
                          >
                            {selectedPlayer === 2
                              ? "I Won (1st)"
                              : `${match.player2.nickname} Won (1st)`}
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {error && (
                    <p className="text-red-500 text-sm text-center">{error}</p>
                  )}

                  <Button
                    className="w-full h-14 text-lg"
                    onClick={handleSubmit}
                    disabled={submitting || !canSubmit(races)}
                  >
                    {submitting ? "Submitting..." : "Submit Result"}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {submitted && !match.completed && (
          <Card>
            <CardContent className="py-8 text-center">
              <div className="text-4xl mb-4">✓</div>
              <h3 className="text-lg font-semibold mb-2">
                Result Submitted!
              </h3>
              <p className="text-muted-foreground">
                Waiting for the other player to confirm...
              </p>
              <p className="text-sm mt-4">
                Your report: {totalPoints1} - {totalPoints2}
              </p>
            </CardContent>
          </Card>
        )}

        {match.completed && match.races && (
          <Card>
            <CardHeader>
              <CardTitle>
                {match.cup} Cup - Race Results
              </CardTitle>
              <CardDescription>
                Final Score: {match.points1} - {match.points2}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {match.races.map((race, index) => (
                  <div key={index} className="border rounded-lg p-4">
                    <h3 className="font-medium mb-3">
                      Race {index + 1}:{" "}
                      {getCourseName(race.course as CourseAbbr)}
                    </h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div
                        className={`p-3 rounded-lg ${
                          race.position1 === 1
                            ? "bg-green-500/20 border border-green-500"
                            : "bg-muted"
                        }`}
                      >
                        <p className="text-sm text-muted-foreground">
                          {match.player1.nickname}
                        </p>
                        <p className="text-2xl font-bold">
                          {race.position1 === 1 ? "1st" : "2nd"}
                        </p>
                        <p className="text-sm font-bold text-green-600">
                          {race.points1} pts
                        </p>
                      </div>
                      <div
                        className={`p-3 rounded-lg ${
                          race.position2 === 1
                            ? "bg-green-500/20 border border-green-500"
                            : "bg-muted"
                        }`}
                      >
                        <p className="text-sm text-muted-foreground">
                          {match.player2.nickname}
                        </p>
                        <p className="text-2xl font-bold">
                          {race.position2 === 1 ? "1st" : "2nd"}
                        </p>
                        <p className="text-sm font-bold text-green-600">
                          {race.points2} pts
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-4 pt-4 border-t">
                <div className="flex justify-center gap-8">
                  <div className="text-center">
                    <p className="text-sm text-muted-foreground">
                      {match.player1.nickname}
                    </p>
                    <p className="text-3xl font-bold">{match.points1} pts</p>
                  </div>
                  <div className="text-center">
                    <p className="text-sm text-muted-foreground">
                      {match.player2.nickname}
                    </p>
                    <p className="text-3xl font-bold">{match.points2} pts</p>
                  </div>
                </div>
              </div>
              <p className="mt-4 text-center">
                {match.points1 > match.points2
                  ? `${match.player1.nickname} wins!`
                  : match.points2 > match.points1
                  ? `${match.player2.nickname} wins!`
                  : "Draw"}
              </p>
            </CardContent>
          </Card>
        )}

        <div className="text-center">
          <Link
            href={`/tournaments/${tournamentId}/gp`}
            className="text-sm text-muted-foreground hover:underline"
          >
            ← Back to Grand Prix
          </Link>
        </div>
      </div>
    </div>
  );
}

function canSubmit(races: Race[]): boolean {
  const usedCourses = races.map((r) => r.course).filter((c) => c !== "");
  return (
    usedCourses.length === 4 &&
    new Set(usedCourses).size === 4 &&
    races.every((r) => r.position1 !== null && r.position2 !== null)
  );
}
