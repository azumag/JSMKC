/**
 * Match Race Participant Score Entry Page
 *
 * Player-facing page for reporting MR match results with race-by-race entry.
 * Uses shared useParticipantMatches hook and ParticipantPageLayout.
 *
 * MR-specific: fixed assigned courses with per-race winner buttons.
 * Scores are auto-calculated from the selected race winners.
 */
"use client";

import { useState, use } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Flag } from "lucide-react";
import { COURSE_INFO, TOTAL_MR_RACES, type CourseAbbr } from "@/lib/constants";
import { useParticipantMatches, type BaseMatch } from "@/lib/hooks/useParticipantMatches";
import { ParticipantPageLayout } from "@/components/tournament/participant-page-layout";

/** MR Match extends BaseMatch with MR-specific fields */
interface MRMatch extends BaseMatch {
  score1: number;
  score2: number;
  assignedCourses?: string[];
  rounds?: { course: string; winner: number }[];
  player1ReportedPoints1?: number;
  player1ReportedPoints2?: number;
  player2ReportedPoints1?: number;
  player2ReportedPoints2?: number;
}

/** Individual MR race result */
interface RoundResult {
  course: CourseAbbr | "";
  winner: number | null;
}

export default function MatchRaceParticipantPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: tournamentId } = use(params);
  const tPart = useTranslations("participant");
  const tMatch = useTranslations("match");
  const tCommon = useTranslations("common");

  const ctx = useParticipantMatches<MRMatch>({ tournamentId, mode: "mr" });

  /* MR-specific: per-match race winners. Courses are fixed at setup time. */
  const [matchRounds, setMatchRounds] = useState<Record<string, RoundResult[]>>({});

  const getCourseName = (abbr: string) => {
    const course = COURSE_INFO.find((c) => c.abbr === abbr);
    return course ? course.name : abbr;
  };

  const buildInitialRounds = (match: MRMatch): RoundResult[] => {
    if (Array.isArray(match.rounds) && match.rounds.length === TOTAL_MR_RACES) {
      return match.rounds.map((round) => ({
        course: (round.course as CourseAbbr) || "",
        winner: round.winner ?? null,
      }));
    }

    const assignedCourses = Array.isArray(match.assignedCourses)
      ? match.assignedCourses
      : [];

    return Array.from({ length: TOTAL_MR_RACES }, (_, index) => ({
      course: (assignedCourses[index] as CourseAbbr | undefined) ?? "",
      winner: null,
    }));
  };

  const getRounds = (match: MRMatch) => matchRounds[match.id] ?? buildInitialRounds(match);

  const updateWinner = (match: MRMatch, index: number, winner: number) => {
    setMatchRounds((prev) => {
      const rounds = prev[match.id] ?? buildInitialRounds(match);
      const nextRounds = rounds.map((round, i) =>
        i === index
          ? { ...round, winner: round.winner === winner ? null : winner }
          : round
      );

      return { ...prev, [match.id]: nextRounds };
    });
  };

  const calculateScores = (rounds: RoundResult[]) => {
    let score1 = 0;
    let score2 = 0;

    rounds.forEach((round) => {
      if (round.winner === 1) score1++;
      else if (round.winner === 2) score2++;
    });

    return { score1, score2 };
  };

  const handleSubmitMatch = async (match: MRMatch) => {
    const rounds = getRounds(match);
    const reportingPlayer = match.player1.id === ctx.playerId ? 1 : 2;

    if (rounds.some((round) => round.winner === null)) {
      ctx.setError(tCommon("selectWinnerForAllRaces", { count: TOTAL_MR_RACES }));
      return;
    }

    ctx.setError(null);
    const { score1, score2 } = calculateScores(rounds);
    const data = await ctx.submitReport(match.id, {
      reportingPlayer,
      score1,
      score2,
      rounds,
    });

    if (data) {
      setMatchRounds((prev) => ({ ...prev, [match.id]: buildInitialRounds(match) }));
      alert(tPart("matchReportedSuccess"));
    }
  };

  return (
    <ParticipantPageLayout<MRMatch>
      mode="mr"
      sectionIcon={Flag}
      maxWidth="max-w-6xl"
      noPendingKey="noPendingMR"
      sessionStatus={ctx.sessionStatus}
      hasAccess={ctx.hasAccess}
      loading={ctx.loading}
      tournament={ctx.tournament}
      session={ctx.session}
      error={ctx.error}
      myMatches={ctx.myMatches}
      tournamentId={tournamentId}
      playerId={ctx.playerId}
      submitting={ctx.submitting}
      renderMatchForm={(match) => {
        const rounds = getRounds(match);
        const { score1, score2 } = calculateScores(rounds);

        return (
          <div className="border-t pt-4">
            <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <h4 className="font-medium">{tPart("raceResults")}</h4>
              <div className="text-sm font-medium text-muted-foreground">
                {tPart("currentScore", { score1, score2 })}
              </div>
            </div>

            <div className="space-y-3">
              {rounds.map((round, index) => (
                <div
                  key={`${match.id}-${index}`}
                  className="grid gap-2 rounded-md border p-3 sm:grid-cols-[5rem_minmax(0,1fr)_minmax(7rem,auto)_minmax(7rem,auto)] sm:items-center"
                >
                  <span className="text-sm font-medium">
                    {tMatch("raceN", { n: index + 1 })}
                  </span>
                  <span className="min-w-0 truncate rounded-md border bg-muted px-3 py-2 text-sm text-muted-foreground">
                    {round.course ? getCourseName(round.course) : "-"}
                  </span>
                  <Button
                    variant={round.winner === 1 ? "default" : "outline"}
                    size="sm"
                    onClick={() => updateWinner(match, index, 1)}
                    className="w-full min-w-0"
                    aria-label={`${match.player1.nickname} wins race ${index + 1}`}
                  >
                    <span className="truncate">
                      {match.player1.id === ctx.playerId
                        ? tMatch("iWon")
                        : tMatch("playerWon", { player: match.player1.nickname })}
                    </span>
                  </Button>
                  <Button
                    variant={round.winner === 2 ? "default" : "outline"}
                    size="sm"
                    onClick={() => updateWinner(match, index, 2)}
                    className="w-full min-w-0"
                    aria-label={`${match.player2.nickname} wins race ${index + 1}`}
                  >
                    <span className="truncate">
                      {match.player2.id === ctx.playerId
                        ? tMatch("iWon")
                        : tMatch("playerWon", { player: match.player2.nickname })}
                    </span>
                  </Button>
                </div>
              ))}
            </div>

            <Button
              onClick={() => handleSubmitMatch(match)}
              disabled={ctx.submitting === match.id || rounds.some((round) => round.winner === null)}
              className="mt-4 h-12 w-full text-base"
            >
              {ctx.submitting === match.id ? tMatch("submitting") : tPart("submitMatchResult")}
            </Button>
          </div>
        );
      }}
      renderPreviousReports={(match) =>
        match.player1ReportedPoints1 !== undefined || match.player2ReportedPoints1 !== undefined ? (
          <div className="border-t pt-4">
            <h4 className="font-medium mb-2">{tPart("previousReports")}</h4>
            <div className="space-y-2 text-sm">
              {match.player1ReportedPoints1 !== undefined && (
                <div className="flex justify-between p-2 bg-gray-50 rounded">
                  <span>{tPart("playerReported", { player: match.player1.nickname })}</span>
                  <span className="font-mono">{match.player1ReportedPoints1} - {match.player1ReportedPoints2}</span>
                </div>
              )}
              {match.player2ReportedPoints1 !== undefined && (
                <div className="flex justify-between p-2 bg-gray-50 rounded">
                  <span>{tPart("playerReported", { player: match.player2.nickname })}</span>
                  <span className="font-mono">{match.player2ReportedPoints1} - {match.player2ReportedPoints2}</span>
                </div>
              )}
            </div>
          </div>
        ) : null
      }
    />
  );
}
