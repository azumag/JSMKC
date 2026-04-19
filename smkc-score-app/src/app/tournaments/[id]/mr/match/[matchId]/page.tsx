/**
 * Match Race Match Detail/Share Page
 *
 * Public-facing page for individual MR match viewing and score reporting.
 * Viewing is public (no auth), but score entry requires authentication
 * as a match participant or admin (enforced by useMatchReportAuth hook
 * on the UI side, and checkScoreReportAuth on the API side).
 *
 * Features:
 * - Authorization-gated score entry (participants and admins only)
 * - Auto-selection of player identity for logged-in participants
 * - Real-time match status display with polling
 * - 4-race winner entry (courses are pre-assigned at qualification setup per §10.5)
 * - Completed match display with race details
 * - Post-submission confirmation view
 *
 * @route /tournaments/[id]/mr/match/[matchId]
 */
"use client";
import { fetchWithRetry } from "@/lib/fetch-with-retry";

import { useState, useEffect, useCallback, use } from "react";
import { useTranslations } from "next-intl";
import { useSession } from "next-auth/react";
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
import { COURSE_INFO, POLLING_INTERVAL, TOTAL_MR_RACES, type CourseAbbr } from "@/lib/constants";
import { usePolling } from "@/lib/hooks/usePolling";
import { UpdateIndicator } from "@/components/ui/update-indicator";
import { CardSkeleton } from "@/components/ui/loading-skeleton";
import { createLogger } from "@/lib/client-logger";
import { useMatchReportAuth } from "@/lib/hooks/useMatchReportAuth";

import type { Player } from "@/lib/types";

const logger = createLogger({ serviceName: 'tournaments-mr-match' });

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
  /** Pre-assigned course abbreviations for this match (§10.5). Set at qualification setup. */
  assignedCourses?: string[];
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

  /**
   * i18n translation hooks for Match Race Match detail page.
   * - 'match': Shared match-level strings (enter result, submit, back, etc.)
   * - 'mr': Match Race mode-specific strings (match title)
   * - 'common': Shared UI strings (race, course, winner, etc.)
   * Hooks must be called at the top of the component before any state/effect hooks.
   */
  const tMatch = useTranslations('match');
  const tMr = useTranslations('mr');
  const tCommon = useTranslations('common');

  const [match, setMatch] = useState<MRMatch | null>(null);
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [loading, setLoading] = useState(true);

  /* Authorization: determines if current user can report scores */
  const { data: session } = useSession();
  const { canReport, isSessionLoading, selectedPlayer, setSelectedPlayer } =
    useMatchReportAuth(match);
  const isAdmin = session?.user?.role === "admin";

  const [submitting, setSubmitting] = useState(false);
  /*
   * Initialize TOTAL_MR_RACES (4) empty rounds for match entry.
   * Courses are pre-assigned at qualification setup (§10.5) and populated
   * via useEffect when the match data arrives from the API.
   */
  const [rounds, setRounds] = useState<Round[]>(
    Array.from({ length: TOTAL_MR_RACES }, () => ({ course: "" as CourseAbbr | "", winner: null }))
  );
  /*
   * Track whether courses have been initialized from assignedCourses.
   * We only populate course values once on initial load to avoid overwriting
   * user-selected winners on subsequent poll updates.
   */
  const [coursesInitialized, setCoursesInitialized] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  /**
   * Fetch match and tournament data concurrently.
   * Called by the polling hook for real-time updates.
   */
  const fetchMatchData = useCallback(async () => {
    const [matchRes, tournamentRes] = await Promise.all([
      fetch(`/api/tournaments/${tournamentId}/mr/match/${matchId}`),
      fetchWithRetry(`/api/tournaments/${tournamentId}?fields=summary`),
    ]);

    if (!matchRes.ok) {
      throw new Error(`Failed to fetch MR match data: ${matchRes.status}`);
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

  /* Poll at the standard interval for live updates */
  const { data: pollData, isLoading: pollLoading, lastUpdated, isPolling, refetch } = usePolling(
    fetchMatchData, {
    interval: POLLING_INTERVAL,
  });

  /* Update local state from polling data */
  useEffect(() => {
    if (pollData) {
      setMatch(pollData.match);
      setTournament(pollData.tournament);
    }
  }, [pollData]);

  /*
   * Populate round courses from pre-assigned course list (§10.5).
   * Runs once when the first match data arrives — courses are determined at
   * qualification setup and should not change between polls.
   * We only set courses on the initial load; subsequent polls must not
   * reset user-entered winner selections.
   */
  useEffect(() => {
    if (!coursesInitialized && pollData?.match?.assignedCourses?.length) {
      const assigned = pollData.match.assignedCourses as string[];
      setRounds(prev =>
        prev.map((r, i) => ({
          ...r,
          course: (assigned[i] as CourseAbbr) ?? r.course,
        }))
      );
      setCoursesInitialized(true);
    }
  }, [pollData, coursesInitialized]);

  useEffect(() => {
    setLoading(pollLoading);
  }, [pollLoading]);

  /**
   * Submit match result after validation.
   *
   * Requires:
   * - Player identity selected
   * - All TOTAL_MR_RACES (4) race winners selected
   * - Courses are pre-assigned (no free course selection needed)
   *
   * A 2-2 draw is a valid result per §6.3 — no majority winner required.
   */
  const handleSubmit = async () => {
    if (selectedPlayer === null) {
      setError("Please select which player you are");
      return;
    }

    /* Validate all 4 race winners are selected */
    const allWinnersSelected = rounds.every(r => r.winner !== null);
    if (!allWinnersSelected) {
      setError(`Please select the winner for all ${TOTAL_MR_RACES} races`);
      return;
    }

    /* Count race wins for each player (2-2 draw is valid) */
    const winnerCount = rounds.filter(r => r.winner === 1).length;
    const loserCount = rounds.filter(r => r.winner === 2).length;

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
      logger.error("Failed to submit result:", { error: err });
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
        {/* i18n: Match not found message */}
        <p>{tMatch('matchNotFound')}</p>
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
          {/* i18n: Match title from 'mr' namespace with match number */}
          <p className="text-muted-foreground">{tMr('matchTitle', { number: match.matchNumber })}</p>
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

        {/* Not authorized message - shown to users who are not match participants.
            Guarded by !isSessionLoading to avoid flash during session fetch. */}
        {!match.completed && !canReport && !isSessionLoading && (
          <Card>
            <CardContent className="py-8 text-center">
              <p className="text-muted-foreground">{tMatch('notAuthorized')}</p>
            </CardContent>
          </Card>
        )}

        {/* Score entry form (shown when match is not completed and user is authorized)
            Admins should not see the score entry form here — they use the /mr/participant page. */}
        {!match.completed && !submitted && canReport && !isAdmin && (
          <Card>
            <CardHeader>
              {/* i18n: Score entry form header */}
              <CardTitle>{tMatch('enterResult')}</CardTitle>
              <CardDescription>
                {tMatch('selectIdentityRace')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Player identity selection */}
              <div className="space-y-2">
                {/* i18n: Player identity selection label */}
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

              {/* Race entry form (shown after player selection) */}
              {selectedPlayer && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      {/* i18n: Current score label */}
                      <p className="text-sm font-medium text-center">{tMatch('currentScore')}</p>
                      <p className="text-sm font-medium text-center">
                        {p1Wins} - {p2Wins}
                      </p>
                    </div>
                  </div>

                  {/*
                   * Race entry rows — one per pre-assigned course (§10.5).
                   * Courses are determined at qualification setup; players only
                   * select who won each race, not the course itself.
                   */}
                  <div className="space-y-3">
                    {rounds.map((round, index) => (
                      <div
                        key={index}
                        className="grid gap-2 rounded-md border p-3 sm:grid-cols-[5rem_minmax(0,1fr)_minmax(7rem,auto)_minmax(7rem,auto)] sm:items-center"
                      >
                        {/* i18n: Race number label */}
                        <span className="text-sm font-medium">{tMatch('raceN', { n: index + 1 })}</span>
                        {/*
                         * Pre-assigned course display: course is fixed at setup time (§10.5),
                         * so we show the course name as a static label instead of a dropdown.
                         */}
                        <span className="min-w-0 truncate rounded-md border bg-muted px-3 py-2 text-sm text-muted-foreground">
                          {round.course ? getCourseName(round.course) : "—"}
                        </span>
                        <Button
                          variant={round.winner === 1 ? "default" : "outline"}
                          size="sm"
                          onClick={() => {
                            const newRounds = [...rounds];
                            newRounds[index].winner = round.winner === 1 ? null : 1;
                            setRounds(newRounds);
                          }}
                          className="w-full min-w-0"
                        >
                          {/* i18n: Winner buttons use 'I Won' or 'Player Won' depending on identity */}
                          <span className="truncate">
                            {selectedPlayer === 1 ? tMatch('iWon') : tMatch('playerWon', { player: match.player1.nickname })}
                          </span>
                        </Button>
                        <Button
                          variant={round.winner === 2 ? "default" : "outline"}
                          size="sm"
                          onClick={() => {
                            const newRounds = [...rounds];
                            newRounds[index].winner = round.winner === 2 ? null : 2;
                            setRounds(newRounds);
                          }}
                          className="w-full min-w-0"
                        >
                          <span className="truncate">
                            {selectedPlayer === 2 ? tMatch('iWon') : tMatch('playerWon', { player: match.player2.nickname })}
                          </span>
                        </Button>
                      </div>
                    ))}
                  </div>

                  {error && (
                    <p className="text-red-500 text-sm text-center">{error}</p>
                  )}

                  <Button
                    className="w-full h-14 text-lg"
                    onClick={handleSubmit}
                    disabled={submitting || !rounds.every(r => r.winner !== null)}
                  >
                    {/* i18n: Submit button with loading state */}
                    {submitting ? tMatch('submitting') : tMatch('submitResult')}
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
              {/* i18n: Post-submission confirmation messages */}
              <h3 className="text-lg font-semibold mb-2">{tMatch('resultSubmitted')}</h3>
              <p className="text-muted-foreground">
                {tMatch('waitingConfirm')}
              </p>
              <p className="text-sm mt-4">
                {tMatch('yourReport', { score1: p1Wins, score2: p2Wins })}
              </p>
            </CardContent>
          </Card>
        )}

        {/* Completed match display with race details */}
        {match.completed && match.rounds && (
          <Card>
            <CardHeader>
              {/* i18n: Completed match header with final score */}
              <CardTitle>{tMatch('matchComplete')}</CardTitle>
              <CardDescription>
                {tMatch('finalScore', { score1: match.score1, score2: match.score2 })}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table className="text-sm">
                <TableHeader>
                  <TableRow>
                    {/* i18n: Completed match table headers */}
                    <TableHead>{tCommon('race')}</TableHead>
                    <TableHead>{tCommon('course')}</TableHead>
                    <TableHead>{tCommon('winner')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {match.rounds.map((round, index) => (
                    <TableRow key={index}>
                      {/* i18n: Race number in completed match table */}
                      <TableCell>{tMatch('raceN', { n: index + 1 })}</TableCell>
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
              {/* i18n: Match winner announcement or draw.
                  A player wins by taking more than half the races (> TOTAL_MR_RACES/2).
                  For 4 races this means 3 or more wins; a 2-2 result is a draw. */}
              <p className="mt-4 text-center">
                {match.score1 > TOTAL_MR_RACES / 2
                  ? tMatch('playerWins', { player: match.player1.nickname })
                  : match.score2 > TOTAL_MR_RACES / 2
                  ? tMatch('playerWins', { player: match.player2.nickname })
                  : tMatch('draw')}
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
            {/* i18n: Back navigation to MR main page */}
            &larr; {tMatch('backToMR')}
          </Link>
        </div>
      </div>
    </div>
  );
}
