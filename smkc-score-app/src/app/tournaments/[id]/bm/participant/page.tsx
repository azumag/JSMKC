/**
 * Battle Mode Participant Score Entry Page
 *
 * Player-facing page for reporting BM match scores.
 * Uses shared useParticipantMatches hook and ParticipantPageLayout.
 *
 * BM-specific: increment/decrement (+/-) buttons for score1/score2 input.
 * Score range 0-4, total must equal 4. A 2-2 tie is valid (§4.1).
 */
"use client";

import { useState, use } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Trophy } from "lucide-react";
import { useParticipantMatches, type BaseMatch } from "@/lib/hooks/useParticipantMatches";
import { ParticipantPageLayout } from "@/components/tournament/participant-page-layout";

/** BM Match extends BaseMatch with BM-specific score/report fields */
interface BMMatch extends BaseMatch {
  score1: number;
  score2: number;
  rounds?: { arena: string; winner: number }[];
  player1ReportedScore1?: number;
  player1ReportedScore2?: number;
  player2ReportedScore1?: number;
  player2ReportedScore2?: number;
}

export default function BattleModeParticipantPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: tournamentId } = use(params);
  const tPart = useTranslations("participant");
  const tMatch = useTranslations("match");

  /* Shared hook for session, data fetching, polling, match filtering */
  const ctx = useParticipantMatches<BMMatch>({ tournamentId, mode: "bm" });

  /* BM-specific: score entry form state (number-based for +/- button UI) */
  const [reportingScores, setReportingScores] = useState<
    Record<string, { score1: number; score2: number }>
  >({});

  /** Increment or decrement a score field, clamped to [0, 4] */
  const adjustScore = (
    matchId: string,
    field: "score1" | "score2",
    delta: number
  ) => {
    setReportingScores((prev) => {
      const current = prev[matchId] ?? { score1: 0, score2: 0 };
      const clamped = Math.max(0, Math.min(4, current[field] + delta));
      return { ...prev, [matchId]: { ...current, [field]: clamped } };
    });
  };

  /** BM validation: total must equal 4 (ties allowed per §4.1) */
  const handleSubmitScore = async (match: BMMatch) => {
    const scores = reportingScores[match.id] ?? { score1: 0, score2: 0 };
    const reportingPlayer = match.player1.id === ctx.playerId ? 1 : 2;

    if (scores.score1 + scores.score2 !== 4) {
      ctx.setError(tMatch("totalMustEqual4"));
      return;
    }

    const data = await ctx.submitReport(match.id, {
      reportingPlayer,
      score1: scores.score1,
      score2: scores.score2,
    });

    if (data) {
      /* Clear form for this match on success */
      setReportingScores((prev) => {
        const next = { ...prev };
        delete next[match.id];
        return next;
      });
      alert(tPart("scoresReportedSuccess"));
    }
  };

  return (
    <ParticipantPageLayout<BMMatch>
      mode="bm"
      sectionIcon={Trophy}
      maxWidth="max-w-4xl"
      noPendingKey="noPendingBM"
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
        const scores = reportingScores[match.id] ?? { score1: 0, score2: 0 };
        const totalValid = scores.score1 + scores.score2 === 4;
        return (
          <div className="border-t pt-4">
            <h4 className="font-medium mb-3">{tPart("reportMatchResult")}</h4>
            {/* +/- button score input: [Player1 [-][score][+]] - [Player2 [-][score][+]] */}
            <div className="flex items-center justify-center gap-3 mb-4">
              {/* Player 1 score */}
              <div className="text-center">
                <p className="text-sm mb-2">{match.player1.nickname}</p>
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-10 w-10 text-lg"
                    aria-label={`${match.player1.nickname} -1`}
                    onClick={() => adjustScore(match.id, "score1", -1)}
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
                    onClick={() => adjustScore(match.id, "score1", 1)}
                  >
                    +
                  </Button>
                </div>
              </div>
              <span className="text-xl mt-6">-</span>
              {/* Player 2 score */}
              <div className="text-center">
                <p className="text-sm mb-2">{match.player2.nickname}</p>
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-10 w-10 text-lg"
                    aria-label={`${match.player2.nickname} -1`}
                    onClick={() => adjustScore(match.id, "score2", -1)}
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
                    onClick={() => adjustScore(match.id, "score2", 1)}
                  >
                    +
                  </Button>
                </div>
              </div>
            </div>

            {/* Validation: total rounds must equal 4 */}
            {!totalValid && (scores.score1 > 0 || scores.score2 > 0) && (
              <p className="text-yellow-600 text-sm text-center mb-3">
                {tMatch("totalMustEqual4")}
              </p>
            )}

            <Button
              onClick={() => handleSubmitScore(match)}
              disabled={ctx.submitting === match.id || !totalValid}
              className="w-full"
            >
              {ctx.submitting === match.id
                ? tMatch("submitting")
                : tPart("submitScores")}
            </Button>
          </div>
        );
      }}
      renderPreviousReports={(match) => {
        const p1reported = match.player1ReportedScore1 != null;
        const p2reported = match.player2ReportedScore1 != null;
        if (!p1reported && !p2reported) return null;
        return (
          <div className="border-t pt-4">
            <h4 className="font-medium mb-2">{tPart("previousReports")}</h4>
            <div className="space-y-2 text-sm">
              {p1reported && (
                <div className="flex justify-between p-2 bg-gray-50 rounded">
                  <span>
                    {tPart("playerReported", {
                      player: match.player1.nickname,
                    })}
                  </span>
                  <span className="font-mono">
                    {match.player1ReportedScore1} -{" "}
                    {match.player1ReportedScore2}
                  </span>
                </div>
              )}
              {p2reported && (
                <div className="flex justify-between p-2 bg-gray-50 rounded">
                  <span>
                    {tPart("playerReported", {
                      player: match.player2.nickname,
                    })}
                  </span>
                  <span className="font-mono">
                    {match.player2ReportedScore1} -{" "}
                    {match.player2ReportedScore2}
                  </span>
                </div>
              )}
            </div>
          </div>
        );
      }}
    />
  );
}
