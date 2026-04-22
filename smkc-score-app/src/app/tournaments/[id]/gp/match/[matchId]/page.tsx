"use client";
import { fetchWithRetry } from "@/lib/fetch-with-retry";

/**
 * Grand Prix Match Detail / Share Page
 *
 * Public page for viewing and reporting GP match results.
 * Viewing is public (no auth), but score entry requires authentication
 * as a match participant or admin (enforced by useMatchReportAuth hook
 * on the UI side, and checkScoreReportAuth on the API side).
 *
 * Features:
 * - Authorization-gated score entry (participants and admins only)
 * - Auto-selection of player identity for logged-in participants
 * - Match info with player names and current score
 * - 5-race result entry with course selection and 1st-8th position selectors
 * - Live driver points calculation preview
 * - Completed match display with race-by-race results
 * - Result submission with confirmation flow
 * - Real-time polling at the standard interval
 */

import { useState, useEffect, useCallback, useRef, use } from "react";
import { useLocale, useTranslations } from "next-intl";
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
import { COURSE_INFO, CUP_SUBSTITUTIONS, GP_POSITION_OPTIONS, POLLING_INTERVAL, TOTAL_GP_RACES, getDriverPoints, type CourseAbbr } from "@/lib/constants";
import { formatGpPosition } from "@/lib/gp-utils";
import { usePolling } from "@/lib/hooks/usePolling";
import { UpdateIndicator } from "@/components/ui/update-indicator";
import { CardSkeleton } from "@/components/ui/loading-skeleton";
import { createLogger } from "@/lib/client-logger";
import { SharedMatchAdminGuidance } from "@/components/tournament/shared-match-admin-guidance";
import { useMatchReportAuth } from "@/lib/hooks/useMatchReportAuth";
import { getSharedMatchAccessState } from "@/lib/shared-match-access-state";

import type { Player } from "@/lib/types";

const logger = createLogger({ serviceName: 'tournaments-gp-match' });

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
  player1ReportedRaces?: {
    course: string;
    position1: number;
    position2: number;
  }[];
  player2ReportedRaces?: {
    course: string;
    position1: number;
    position2: number;
  }[];
}

interface Tournament {
  id: string;
  name: string;
}

/** Race entry in the result form: course + positions for both players */
interface Race {
  course: CourseAbbr | "";
  position1: number | null;
  position2: number | null;
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
  const locale = useLocale();
  const [match, setMatch] = useState<GPMatch | null>(null);
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [loading, setLoading] = useState(true);

  /* Authorization: determines if current user can report scores */
  const { canReport, isAdmin, isSessionLoading, selectedPlayer, setSelectedPlayer } =
    useMatchReportAuth(match);

  const [submitting, setSubmitting] = useState(false);
  /* GP cup has 5 races (§7.2), each with course and position selections */
  const [races, setRaces] = useState<Race[]>(
    Array.from({ length: TOTAL_GP_RACES }, () => ({ course: "", position1: null, position2: null }))
  );
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");
  /**
   * Active cup for course filtering (§7.1 substitution rule).
   * Star→Mushroom, Special→Flower substitutions are allowed.
   * Initialized from match.cup, togglable when a substitute exists.
   */
  const [activeCup, setActiveCup] = useState<string | null>(null);
  const initializedCupRef = useRef<string | null>(null);

  /** Fetch match and tournament data in parallel */
  const fetchMatchData = useCallback(async () => {
    const [matchRes, tournamentRes] = await Promise.all([
      fetch(`/api/tournaments/${tournamentId}/gp/match/${matchId}`),
      fetchWithRetry(`/api/tournaments/${tournamentId}?fields=summary`),
    ]);

    if (!matchRes.ok) {
      throw new Error(`Failed to fetch GP match data: ${matchRes.status}`);
    }

    if (!tournamentRes.ok) {
      throw new Error(`Failed to fetch tournament: ${tournamentRes.status}`);
    }

    const matchJson = await matchRes.json();
    const tournamentJson = await tournamentRes.json();

    return {
      // Unwrap createSuccessResponse wrapper: { success, data: match }
      match: matchJson.data ?? matchJson,
      tournament: tournamentJson.data ?? tournamentJson,
    };
  }, [tournamentId, matchId]);

  /* Poll for match updates at the standard interval */
  const { data: pollData, isLoading: pollLoading, lastUpdated, isPolling, refetch } = usePolling(
    fetchMatchData, {
    interval: POLLING_INTERVAL,
  });

  useEffect(() => {
    if (pollData) {
      setMatch(pollData.match);
      setTournament(pollData.tournament);
      /* Initialize activeCup from match data (only once, to preserve user's toggle) */
      if (pollData.match.cup && activeCup === null) {
        setActiveCup(pollData.match.cup);
      }
    }
  }, [pollData, activeCup]);

  useEffect(() => {
    setLoading(pollLoading);
  }, [pollLoading]);

  useEffect(() => {
    if (!match) return;

    const existingRaces =
      match.races ??
      (selectedPlayer === 1 ? match.player1ReportedRaces : selectedPlayer === 2 ? match.player2ReportedRaces : undefined);

    if (!activeCup) {
      initializedCupRef.current = null;
      if (existingRaces && existingRaces.length === TOTAL_GP_RACES) {
        setRaces(existingRaces.map((race) => ({
          course: race.course as CourseAbbr,
          position1: race.position1,
          position2: race.position2,
        })));
      }
      return;
    }

    setRaces((prev) => {
      const cupCourses = COURSE_INFO.filter((course) => course.cup === activeCup).map((course) => course.abbr);
      if (cupCourses.length !== TOTAL_GP_RACES) return prev;
      const previousCup = initializedCupRef.current;
      const shouldHydrateExistingCup =
        previousCup === null &&
        existingRaces?.length === TOTAL_GP_RACES &&
        existingRaces.every((race, index) => race.course === cupCourses[index]);
      initializedCupRef.current = activeCup;

      return cupCourses.map((course, index) => ({
        course,
        position1: shouldHydrateExistingCup ? existingRaces[index].position1 : previousCup === activeCup ? (prev[index]?.position1 ?? null) : null,
        position2: shouldHydrateExistingCup ? existingRaces[index].position2 : previousCup === activeCup ? (prev[index]?.position2 ?? null) : null,
      }));
    });
  }, [activeCup, match, selectedPlayer]);

  /**
   * Submit the race results for the selected player.
   * Validates that 5 unique courses are selected and all positions are filled.
   */
  const handleSubmit = async () => {
    if (selectedPlayer === null) {
      setError(tMatch('selectPlayer'));
      return;
    }

    /* Validate 5 unique courses are selected (1 full cup = 5 courses) */
    const usedCourses = races.map((r) => r.course).filter((c) => c !== "");
    if (usedCourses.length !== TOTAL_GP_RACES || new Set(usedCourses).size !== TOTAL_GP_RACES) {
      setError(tMatch('selectUniqueCourses'));
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
      logger.error("Failed to submit result:", { error: err });
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

  // formatGpPosition imported from @/lib/gp-utils; bind locale and gameOver label locally
  const fmtPos = (position: number) => formatGpPosition(position, locale, tCommon('gameOver'));

  /* Calculate running totals for the points preview using centralized driver points */
  const totalPoints1 = races.reduce(
    (sum, r) => sum + (r.position1 ? getDriverPoints(r.position1) : 0),
    0
  );
  const totalPoints2 = races.reduce(
    (sum, r) => sum + (r.position2 ? getDriverPoints(r.position2) : 0),
    0
  );
  const accessState = getSharedMatchAccessState({
    canReport,
    isAdmin,
    isSessionLoading,
    isCompleted: match.completed,
    isSubmitted: submitted,
  });

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
            {/* Show active cup with §7.1 substitution toggle when not yet completed */}
            {match.cup && !match.completed && (
              <CardDescription className="text-center space-y-1">
                <Badge variant="outline">{tGp('cupLabel', { cup: activeCup || match.cup })}</Badge>
                {/* §7.1: Star→Mushroom, Special→Flower substitution allowed */}
                {CUP_SUBSTITUTIONS[match.cup] && (
                  <div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs h-6"
                      onClick={() => {
                        const sub = CUP_SUBSTITUTIONS[match.cup!];
                        const next = activeCup === match.cup ? (sub ?? null) : (match.cup ?? null);
                        setActiveCup(next);
                      }}
                    >
                      {activeCup === match.cup
                        ? tGp('switchToSubstitute', { cup: CUP_SUBSTITUTIONS[match.cup] })
                        : tGp('switchBackToAssigned', { cup: match.cup })}
                    </Button>
                  </div>
                )}
              </CardDescription>
            )}
            {match.completed && (
              <CardDescription className="text-center">
                <Badge variant="secondary" className="text-lg px-4 py-1">
                  {match.points1} - {match.points2}
                </Badge>
              </CardDescription>
            )}
          </CardHeader>
        </Card>

        {/* Not authorized message - shown to users who are not match participants.
            Guarded by !isSessionLoading to avoid flash during session fetch. */}
        {accessState === "unauthorized" && (
          <Card>
            <CardContent className="py-8 text-center">
              <p className="text-muted-foreground">{tMatch('notAuthorized')}</p>
            </CardContent>
          </Card>
        )}

        {accessState === "admin-guidance" && (
          <SharedMatchAdminGuidance
            href={`/tournaments/${tournamentId}/gp/participant`}
            description={tMatch('adminSharedPageGuidance')}
            ctaLabel={tMatch('openParticipantScoreEntry')}
          />
        )}

        {/* Result entry form (shown when match is not complete and user is authorized)
            Admins should not see the score entry form here — they use the /gp/participant page. */}
        {accessState === "report-form" && (
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

                  {/* 5 race entries with course selection and 1st-8th position selectors */}
                  <div className="space-y-3">
                    {races.map((race, index) => (
                      <div key={index} className="border rounded-lg p-3 space-y-2">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium w-20">
                            {tMatch('raceN', { n: index + 1 })}
                          </span>
                          {activeCup ? (
                            <span className="flex-1 rounded-md border bg-muted px-3 py-2 text-sm text-muted-foreground">
                              {race.course ? getCourseName(race.course) : "—"}
                            </span>
                          ) : (
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
                          )}
                        </div>
                        <div className="grid gap-2 sm:grid-cols-2">
                          <div className="space-y-1">
                            <p className="text-xs text-muted-foreground">
                              {match.player1.nickname}
                            </p>
                            <Select
                              value={race.position1?.toString() || ""}
                              onValueChange={(value) => {
                                const newRaces = [...races];
                                newRaces[index].position1 =
                                  value === "" ? null : parseInt(value, 10);
                                setRaces(newRaces);
                              }}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder={tCommon('position')} />
                              </SelectTrigger>
                              <SelectContent>
                                {GP_POSITION_OPTIONS.map((position) => (
                                  <SelectItem key={`p1-${index}-${position}`} value={position.toString()}>
                                    {fmtPos(position)}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1">
                            <p className="text-xs text-muted-foreground">
                              {match.player2.nickname}
                            </p>
                            <Select
                              value={race.position2?.toString() || ""}
                              onValueChange={(value) => {
                                const newRaces = [...races];
                                newRaces[index].position2 =
                                  value === "" ? null : parseInt(value, 10);
                                setRaces(newRaces);
                              }}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder={tCommon('position')} />
                              </SelectTrigger>
                              <SelectContent>
                                {GP_POSITION_OPTIONS.map((position) => (
                                  <SelectItem key={`p2-${index}-${position}`} value={position.toString()}>
                                    {fmtPos(position)}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
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
                      {(() => {
                        const player1Ahead = race.position1 < race.position2;
                        const player2Ahead = race.position2 < race.position1;

                        return (
                          <>
                      <div
                        className={`p-3 rounded-lg ${
                          player1Ahead
                            ? "bg-green-500/20 border border-green-500"
                            : "bg-muted"
                        }`}
                      >
                        <p className="text-sm text-muted-foreground">
                          {match.player1.nickname}
                        </p>
                        <p className="text-2xl font-bold">
                          {fmtPos(race.position1)}
                        </p>
                        <p className="text-sm font-bold text-green-600">
                          {tMatch('pts', { points: race.points1 })}
                        </p>
                      </div>
                      <div
                        className={`p-3 rounded-lg ${
                          player2Ahead
                            ? "bg-green-500/20 border border-green-500"
                            : "bg-muted"
                        }`}
                      >
                        <p className="text-sm text-muted-foreground">
                          {match.player2.nickname}
                        </p>
                        <p className="text-2xl font-bold">
                          {fmtPos(race.position2)}
                        </p>
                        <p className="text-sm font-bold text-green-600">
                          {tMatch('pts', { points: race.points2 })}
                        </p>
                      </div>
                          </>
                        );
                      })()}
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
 * Validate that all 5 races have unique courses and both positions filled.
 * Used to enable/disable the submit button.
 */
function canSubmit(races: Race[]): boolean {
  const usedCourses = races.map((r) => r.course).filter((c) => c !== "");
  return (
    usedCourses.length === TOTAL_GP_RACES &&
    new Set(usedCourses).size === TOTAL_GP_RACES &&
    races.every((r) => r.position1 !== null && r.position2 !== null)
  );
}
