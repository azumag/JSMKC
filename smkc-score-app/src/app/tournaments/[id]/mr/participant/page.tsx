/**
 * Match Race Participant Score Entry Page
 *
 * Player-facing page for reporting MR match results.
 * Uses shared useParticipantMatches hook and ParticipantPageLayout.
 *
 * MR-specific: fixed 4-race total score input, matching the BM participant UI.
 * Score range 0-4, total must equal 4. A 2-2 tie is valid.
 */
"use client";

import { useState, use } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Flag } from "lucide-react";
import { useParticipantMatches, type BaseMatch } from "@/lib/hooks/useParticipantMatches";
import { ParticipantPageLayout } from "@/components/tournament/participant-page-layout";
import { getScoreReportSuccessMessage } from "@/lib/participant-report-message";

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

export default function MatchRaceParticipantPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: tournamentId } = use(params);
  const tPart = useTranslations("participant");
  const tMatch = useTranslations("match");

  const ctx = useParticipantMatches<MRMatch>({ tournamentId, mode: "mr" });

  const [reportingScores, setReportingScores] = useState<
    Record<string, { score1: number; score2: number }>
  >({});

  const getInitialScores = (match: MRMatch) => {
    const isPlayer1 = match.player1.id === ctx.playerId;
    const ownScore1 = isPlayer1 ? match.player1ReportedPoints1 : match.player2ReportedPoints1;
    const ownScore2 = isPlayer1 ? match.player1ReportedPoints2 : match.player2ReportedPoints2;

    if (ownScore1 != null && ownScore2 != null) {
      return { score1: ownScore1, score2: ownScore2 };
    }

    if (match.completed) {
      return { score1: match.score1 ?? 0, score2: match.score2 ?? 0 };
    }

    return { score1: 0, score2: 0 };
  };

  const hasOwnReport = (match: MRMatch) => {
    const isPlayer1 = match.player1.id === ctx.playerId;
    return isPlayer1
      ? match.player1ReportedPoints1 != null
      : match.player2ReportedPoints1 != null;
  };

  const adjustScore = (
    match: MRMatch,
    field: "score1" | "score2",
    delta: number
  ) => {
    setReportingScores((prev) => {
      const current = prev[match.id] ?? getInitialScores(match);
      const clamped = Math.max(0, Math.min(4, current[field] + delta));
      return { ...prev, [match.id]: { ...current, [field]: clamped } };
    });
  };

  const handleSubmitScore = async (match: MRMatch) => {
    const scores = reportingScores[match.id] ?? getInitialScores(match);
    const reportingPlayer = match.player1.id === ctx.playerId ? 1 : 2;

    if (scores.score1 + scores.score2 !== 4) {
      ctx.setError(tMatch("totalMustEqual4"));
      return;
    }

    ctx.setError(null);
    const data = await ctx.submitReport(match.id, {
      reportingPlayer,
      score1: scores.score1,
      score2: scores.score2,
    });

    if (data) {
      setReportingScores((prev) => {
        const next = { ...prev };
        delete next[match.id];
        return next;
      });
      alert(getScoreReportSuccessMessage(data, {
        correctionSubmittedSuccess: tPart("correctionSubmittedSuccess"),
        scoresReportedSuccess: tPart("scoresReportedSuccess"),
        scoresConfirmedSuccess: tPart("scoresConfirmedSuccess"),
        scoresMismatchSubmitted: tPart("scoresMismatchSubmitted"),
      }));
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
      isAdminBlocked={ctx.isAdminBlocked}
      loading={ctx.loading}
      tournament={ctx.tournament}
      session={ctx.session}
      error={ctx.error}
      myMatches={ctx.myMatches}
      tournamentId={tournamentId}
      playerId={ctx.playerId}
      submitting={ctx.submitting}
      qualificationConfirmed={ctx.qualificationConfirmed}
      renderMatchForm={(match) => {
        const scores = reportingScores[match.id] ?? getInitialScores(match);
        const totalValid = scores.score1 + scores.score2 === 4;

        return (
          <div className="border-t pt-4">
            <h4 className="font-medium mb-3">
              {hasOwnReport(match) ? tPart("editYourReport") : tPart("reportMatchResult")}
            </h4>
            <div className="flex items-center justify-center gap-3 mb-4">
              <div className="text-center min-w-0 max-w-[120px]">
                <p className="text-sm mb-2 truncate">{match.player1.nickname}</p>
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-10 w-10 text-lg"
                    aria-label={`${match.player1.nickname} -1`}
                    onClick={() => adjustScore(match, "score1", -1)}
                  >
                    -
                  </Button>
                  <span className="text-3xl font-bold w-10 text-center">
                    {scores.score1}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-10 w-10 text-lg"
                    aria-label={`${match.player1.nickname} +1`}
                    onClick={() => adjustScore(match, "score1", 1)}
                  >
                    +
                  </Button>
                </div>
              </div>
              <span className="text-xl mt-6">-</span>
              <div className="text-center min-w-0 max-w-[120px]">
                <p className="text-sm mb-2 truncate">{match.player2.nickname}</p>
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-10 w-10 text-lg"
                    aria-label={`${match.player2.nickname} -1`}
                    onClick={() => adjustScore(match, "score2", -1)}
                  >
                    -
                  </Button>
                  <span className="text-3xl font-bold w-10 text-center">
                    {scores.score2}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-10 w-10 text-lg"
                    aria-label={`${match.player2.nickname} +1`}
                    onClick={() => adjustScore(match, "score2", 1)}
                  >
                    +
                  </Button>
                </div>
              </div>
            </div>

            <p className={`text-sm text-center mb-3 ${
              !totalValid && (scores.score1 > 0 || scores.score2 > 0)
                ? 'text-yellow-600' : 'invisible'
            }`}>
              {tMatch("totalMustEqual4")}
            </p>

            <Button
              onClick={() => handleSubmitScore(match)}
              disabled={ctx.submitting === match.id || !totalValid}
              className="w-full"
            >
              {ctx.submitting === match.id
                ? tMatch("submitting")
                : hasOwnReport(match) ? tPart("submitCorrection") : tPart("submitScores")}
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
