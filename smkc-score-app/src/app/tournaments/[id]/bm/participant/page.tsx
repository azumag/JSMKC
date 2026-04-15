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
  const [editingCorrections, setEditingCorrections] = useState<Record<string, boolean>>({});

  const getInitialScores = (match: BMMatch) => {
    const isPlayer1 = match.player1.id === ctx.playerId;
    const ownScore1 = isPlayer1 ? match.player1ReportedScore1 : match.player2ReportedScore1;
    const ownScore2 = isPlayer1 ? match.player1ReportedScore2 : match.player2ReportedScore2;

    if (ownScore1 != null && ownScore2 != null) {
      return { score1: ownScore1, score2: ownScore2 };
    }

    if (match.completed) {
      return { score1: match.score1 ?? 0, score2: match.score2 ?? 0 };
    }

    return { score1: 0, score2: 0 };
  };

  const hasOwnReport = (match: BMMatch) => {
    const isPlayer1 = match.player1.id === ctx.playerId;
    return isPlayer1
      ? match.player1ReportedScore1 != null
      : match.player2ReportedScore1 != null;
  };

  /** Increment or decrement a score field, clamped to [0, 4] */
  const adjustScore = (
    match: BMMatch,
    field: "score1" | "score2",
    delta: number
  ) => {
    setReportingScores((prev) => {
      const current = prev[match.id] ?? getInitialScores(match);
      const clamped = Math.max(0, Math.min(4, current[field] + delta));
      return { ...prev, [match.id]: { ...current, [field]: clamped } };
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
      setEditingCorrections((prev) => ({ ...prev, [match.id]: false }));
      alert(data.corrected ? tPart("correctionSubmittedSuccess") : tPart("scoresReportedSuccess"));
    }
  };

  const renderScoreEditor = (match: BMMatch, title: string, submitLabel: string) => {
    const scores = reportingScores[match.id] ?? getInitialScores(match);
    const totalValid = scores.score1 + scores.score2 === 4;

    return (
      <div className="border-t pt-4">
        <h4 className="font-medium mb-3">{title}</h4>
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
          {/* Player 2 score */}
          <div className="text-center">
            <p className="text-sm mb-2">{match.player2.nickname}</p>
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
            : submitLabel}
        </Button>
      </div>
    );
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
        return renderScoreEditor(
          match,
          hasOwnReport(match) ? tPart("editYourReport") : tPart("reportMatchResult"),
          hasOwnReport(match) ? tPart("submitCorrection") : tPart("submitScores")
        );
      }}
      renderPreviousReports={(match) => {
        const p1reported = match.player1ReportedScore1 != null;
        const p2reported = match.player2ReportedScore1 != null;
        if (!p1reported && !p2reported && !match.completed) return null;
        return (
          <div className="border-t pt-4">
            {(p1reported || p2reported) && (
              <>
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
              </>
            )}
            {match.completed && (
              editingCorrections[match.id] ? (
                <div className="mt-4 space-y-3">
                  {renderScoreEditor(match, tPart("correctScore"), tPart("submitCorrection"))}
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={() => {
                      setEditingCorrections((prev) => ({ ...prev, [match.id]: false }));
                      setReportingScores((prev) => {
                        const next = { ...prev };
                        delete next[match.id];
                        return next;
                      });
                    }}
                  >
                    {tPart("cancelCorrection")}
                  </Button>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full mt-4"
                  onClick={() => {
                    setReportingScores((prev) => ({
                      ...prev,
                      [match.id]: getInitialScores(match),
                    }));
                    setEditingCorrections((prev) => ({ ...prev, [match.id]: true }));
                  }}
                >
                  {tPart("correctScore")}
                </Button>
              )
            )}
          </div>
        );
      }}
    />
  );
}
