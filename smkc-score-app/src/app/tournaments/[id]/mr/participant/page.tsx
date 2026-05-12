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

import { use, useCallback, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Flag } from "lucide-react";
import { useParticipantMatches, type BaseMatch } from "@/lib/hooks/useParticipantMatches";
import { useParticipantScoreInput } from "@/lib/hooks/useParticipantScoreInput";
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

interface MrScoreEditorProps {
  match: MRMatch;
  title: string;
  submitLabel: string;
  submitting: boolean;
  submittingLabel: string;
  totalMessage: string;
  requiredTotalScore: number;
  scores: { score1: number; score2: number };
  onAdjustScore: (match: MRMatch, field: "score1" | "score2", delta: number) => void;
  onSubmit: (match: MRMatch) => void;
}

function MrScoreEditor({
  match,
  title,
  submitLabel,
  submitting,
  submittingLabel,
  totalMessage,
  requiredTotalScore,
  scores,
  onAdjustScore,
  onSubmit,
}: MrScoreEditorProps) {
  const totalValid = scores.score1 + scores.score2 === requiredTotalScore;

  return (
    <div className="border-t pt-4">
      <h4 className="font-medium mb-3">{title}</h4>
      <div className="flex items-center justify-center gap-3 mb-4">
        <div className="text-center min-w-0 max-w-[120px]">
          <p className="text-sm mb-2 truncate">{match.player1.nickname}</p>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              className="h-10 w-10 text-lg"
              aria-label={`${match.player1.nickname} -1`}
              onClick={() => onAdjustScore(match, "score1", -1)}
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
              onClick={() => onAdjustScore(match, "score1", 1)}
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
              onClick={() => onAdjustScore(match, "score2", -1)}
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
              onClick={() => onAdjustScore(match, "score2", 1)}
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
        {totalMessage}
      </p>

      <Button
        onClick={() => onSubmit(match)}
        disabled={submitting || !totalValid}
        className="w-full"
      >
        {submitting ? submittingLabel : submitLabel}
      </Button>
    </div>
  );
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

  const [editingCorrections, setEditingCorrections] = useState<Record<string, boolean>>({});

  const handleScoreSubmitSuccess = useCallback(
    (data: Record<string, unknown>, match: MRMatch) => {
      setEditingCorrections((prev) => ({ ...prev, [match.id]: false }));
      alert(getScoreReportSuccessMessage(data, {
        correctionSubmittedSuccess: tPart("correctionSubmittedSuccess"),
        scoresReportedSuccess: tPart("scoresReportedSuccess"),
        scoresConfirmedSuccess: tPart("scoresConfirmedSuccess"),
        scoresMismatchSubmitted: tPart("scoresMismatchSubmitted"),
      }));
    },
    [tPart]
  );

  const {
    reportingScores,
    setReportingScores,
    requiredTotalScore,
    getInitialScores,
    hasOwnReport,
    adjustScore,
    handleSubmitScore,
  } = useParticipantScoreInput<MRMatch>({
    playerId: ctx.playerId,
    getReportedScores: (match, isPlayer1) => ({
      score1: isPlayer1 ? match.player1ReportedPoints1 : match.player2ReportedPoints1,
      score2: isPlayer1 ? match.player1ReportedPoints2 : match.player2ReportedPoints2,
    }),
    submitReport: ctx.submitReport,
    setError: ctx.setError,
    totalMustEqualMessage: tMatch("totalMustEqual4"),
    onSubmitSuccess: handleScoreSubmitSuccess,
  });

  const scoreEditorProps = (match: MRMatch, title: string, submitLabel: string) => {
    const scores = reportingScores[match.id] ?? getInitialScores(match);
    return {
      match,
      title,
      submitLabel,
      scores,
      submitting: ctx.submitting === match.id,
      submittingLabel: tMatch("submitting"),
      totalMessage: tMatch("totalMustEqual4"),
      requiredTotalScore,
      onAdjustScore: adjustScore,
      onSubmit: handleSubmitScore,
    };
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
        return (
          <MrScoreEditor
            {...scoreEditorProps(
              match,
              hasOwnReport(match) ? tPart("editYourReport") : tPart("reportMatchResult"),
              hasOwnReport(match) ? tPart("submitCorrection") : tPart("submitScores")
            )}
          />
        );
      }}
      renderPreviousReports={(match) => {
        const p1reported = match.player1ReportedPoints1 != null;
        const p2reported = match.player2ReportedPoints1 != null;
        if (!p1reported && !p2reported && !match.completed) return null;
        return (
          <div className="border-t pt-4">
            {(p1reported || p2reported) && (
              <>
                <h4 className="font-medium mb-2">{tPart("previousReports")}</h4>
                <div className="space-y-2 text-sm">
                  {p1reported && (
                    <div className="flex justify-between p-2 bg-gray-50 rounded">
                      <span>{tPart("playerReported", { player: match.player1.nickname })}</span>
                      <span className="font-mono">{match.player1ReportedPoints1} - {match.player1ReportedPoints2}</span>
                    </div>
                  )}
                  {p2reported && (
                    <div className="flex justify-between p-2 bg-gray-50 rounded">
                      <span>{tPart("playerReported", { player: match.player2.nickname })}</span>
                      <span className="font-mono">{match.player2ReportedPoints1} - {match.player2ReportedPoints2}</span>
                    </div>
                  )}
                </div>
              </>
            )}
            {match.completed && (
              editingCorrections[match.id] ? (
                <div className="mt-4 space-y-3">
                  <MrScoreEditor
                    {...scoreEditorProps(match, tPart("correctScore"), tPart("submitCorrection"))}
                  />
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
