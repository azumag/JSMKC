"use client";

/**
 * Grand Prix Match Detail / Share Page
 *
 * Public page for viewing and reporting GP match results.
 * Accessible via shareable link without authentication.
 *
 * Features:
 * - Match info with player names and current score
 * - Player identity selection (I am Player 1 / Player 2)
 * - 4-race result entry with course selection and position buttons
 * - Live driver points calculation preview
 * - Completed match display with race-by-race results
 * - Result submission with confirmation flow
 * - Real-time polling (3s interval)
 */

import { useState, useEffect, useCallback, use } from "react";
import { useTranslations } from "next-intl";
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
import { CardSkeleton } from "@/components/ui/loading-skeleton";

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

/** Race entry in the result form: course + positions for both players */
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
  /* i18n translation hooks for match, GP, and common namespaces */
  const tMatch = useTranslations('match');
  const tGp = useTranslations('gp');
  const tCommon = useTranslations('common');
  const [match, setMatch] = useState<GPMatch | null>(null);
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState<1 | 2 | null>(null);
  /* GP cup has 4 races, each with course and position selections */
  const [races, setRaces] = useState<Race[]>([
    { course: "", position1: null, position2: null },
    { course: "", position1: null, position2: null },
    { course: "", position1: null, position2: null },
    { course: "", position1: null, position2: null },
  ]);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  /** Fetch match and tournament data in parallel */
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

  /* Poll for match updates every 3 seconds */
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

  /**
   * Submit the race results for the selected player.
   * Validates that 4 unique courses are selected and all positions are filled.
   */
  const handleSubmit = async () => {
    if (selectedPlayer === null) {
      setError(tMatch('selectPlayer'));
      return;
    }

    /* Validate 4 unique courses are selected */
    const usedCourses = races.map((r) => r.course).filter((c) => c !== "");
    if (usedCourses.length !== 4 || new Set(usedCourses).size !== 4) {
      setError(tMatch('select4UniqueCourses'));
      return;
    }

    /* Validate all positions are filled */
    const incompleteRaces = races.filter(
      (r) => r.position1 === null || r.position2 === null
    );
    if (incompleteRaces.length > 0) {
      setError(tMatch('completeAllPositions'));
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
        setError(data.error || tMatch('submitResult'));
      }
    } catch (err) {
      console.error("Failed to submit:", err);
      setError(tMatch('submitResult'));
    } finally {
      setSubmitting(false);
    }
  };

  /** Convert course abbreviation to full name for display */
  const getCourseName = (abbr: string) => {
    const course = COURSE_INFO.find((c) => c.abbr === abbr);
    return course ? course.name : abbr;
  };

  /** Convert finishing position to driver points (1st=9, 2nd=6) */
  const getPointsFromPosition = (position: number) => {
    if (position === 1) return 9;
    if (position === 2) return 6;
    return 0;
  };

  /* Calculate running totals for the points preview */
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
        <p>{tMatch('matchNotFound')}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-2xl mx-auto space-y-4">
        {/* Match header with tournament name and polling indicator */}
        <div className="text-center">
          <h1 className="text-xl font-bold">{tournament.name}</h1>
          <p className="text-muted-foreground">
            {tGp('matchTitle', { number: match.matchNumber })}
          </p>
          <div className="mt-2">
            <UpdateIndicator lastUpdated={lastUpdated} isPolling={isPolling} />
          </div>
        </div>

        {/* Player matchup card */}
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

        {/* Result entry form (shown when match is not complete and not yet submitted) */}
        {!match.completed && !submitted && (
          <Card>
            <CardHeader>
              <CardTitle>{tMatch('enterResult')}</CardTitle>
              <CardDescription>
                {tMatch('selectIdentityRace')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Player identity selection */}
              <div className="space-y-2">
                <p className="text-sm font-medium">{tMatch('iAm')}</p>
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
                  {/* Live score preview */}
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <p className="text-sm font-medium text-center">
                        {tMatch('currentScore')}
                      </p>
                      <p className="text-sm font-medium text-center">
                        {totalPoints1} - {totalPoints2}
                      </p>
                    </div>
                  </div>

                  {/* 4 race entries with course selection and position buttons */}
                  <div className="space-y-3">
                    {races.map((race, index) => (
                      <div key={index} className="border rounded-lg p-3 space-y-2">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium w-20">
                            {tMatch('raceN', { n: index + 1 })}
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
                              <SelectValue placeholder={tCommon('selectCourse')} />
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
                        {/* Position toggle buttons (1st/2nd for each player) */}
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
                              ? tMatch('iWon1st')
                              : tMatch('playerWon1st', { player: match.player1.nickname })}
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
                              ? tMatch('iWon1st')
                              : tMatch('playerWon1st', { player: match.player2.nickname })}
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
                    {submitting ? tMatch('submitting') : tMatch('submitResult')}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Submission confirmation (shown after successful submit) */}
        {submitted && !match.completed && (
          <Card>
            <CardContent className="py-8 text-center">
              <div className="text-4xl mb-4">✓</div>
              <h3 className="text-lg font-semibold mb-2">
                {tMatch('resultSubmitted')}
              </h3>
              <p className="text-muted-foreground">
                {tMatch('waitingConfirm')}
              </p>
              <p className="text-sm mt-4">
                {tMatch('yourReport', { score1: totalPoints1, score2: totalPoints2 })}
              </p>
            </CardContent>
          </Card>
        )}

        {/* Completed match display with race-by-race breakdown */}
        {match.completed && match.races && (
          <Card>
            <CardHeader>
              <CardTitle>
                {tMatch('cupRaceResults', { cup: match.cup ?? '' })}
              </CardTitle>
              <CardDescription>
                {tMatch('finalScore', { score1: match.points1, score2: match.points2 })}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {match.races.map((race, index) => (
                  <div key={index} className="border rounded-lg p-4">
                    <h3 className="font-medium mb-3">
                      {tMatch('raceN', { n: index + 1 })}:{" "}
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
                          {race.position1 === 1 ? tCommon('first') : tCommon('second')}
                        </p>
                        <p className="text-sm font-bold text-green-600">
                          {tMatch('pts', { points: race.points1 })}
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
                          {race.position2 === 1 ? tCommon('first') : tCommon('second')}
                        </p>
                        <p className="text-sm font-bold text-green-600">
                          {tMatch('pts', { points: race.points2 })}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              {/* Final score summary */}
              <div className="mt-4 pt-4 border-t">
                <div className="flex justify-center gap-8">
                  <div className="text-center">
                    <p className="text-sm text-muted-foreground">
                      {match.player1.nickname}
                    </p>
                    <p className="text-3xl font-bold">{tMatch('pts', { points: match.points1 })}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-sm text-muted-foreground">
                      {match.player2.nickname}
                    </p>
                    <p className="text-3xl font-bold">{tMatch('pts', { points: match.points2 })}</p>
                  </div>
                </div>
              </div>
              <p className="mt-4 text-center">
                {match.points1 > match.points2
                  ? tMatch('playerWins', { player: match.player1.nickname })
                  : match.points2 > match.points1
                  ? tMatch('playerWins', { player: match.player2.nickname })
                  : tMatch('draw')}
              </p>
            </CardContent>
          </Card>
        )}

        {/* Back navigation */}
        <div className="text-center">
          <Link
            href={`/tournaments/${tournamentId}/gp`}
            className="text-sm text-muted-foreground hover:underline"
          >
            {tMatch('backToGP')}
          </Link>
        </div>
      </div>
    </div>
  );
}

/**
 * Validate that all 4 races have unique courses and both positions filled.
 * Used to enable/disable the submit button.
 */
function canSubmit(races: Race[]): boolean {
  const usedCourses = races.map((r) => r.course).filter((c) => c !== "");
  return (
    usedCourses.length === 4 &&
    new Set(usedCourses).size === 4 &&
    races.every((r) => r.position1 !== null && r.position2 !== null)
  );
}
