/**
 * Battle Mode Participant Score Entry Page
 *
 * Player-facing page for reporting BM match scores.
 * Uses shared useParticipantMatches hook and ParticipantPageLayout.
 *
 * BM-specific: direct score1/score2 input (0-5 range, no ties allowed).
 */
"use client";

import { useState, use } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

  /* BM-specific: score entry form state */
  const [reportingScores, setReportingScores] = useState<
    Record<string, { score1: string; score2: string }>
  >({});

  /** Initialize form state when myMatches changes */
  const ensureFormState = (matchId: string) => {
    if (!reportingScores[matchId]) {
      setReportingScores((prev) => ({
        ...prev,
        [matchId]: { score1: "", score2: "" },
      }));
    }
  };

  const handleScoreChange = (
    matchId: string,
    field: "score1" | "score2",
    value: string
  ) => {
    setReportingScores((prev) => ({
      ...prev,
      [matchId]: { ...prev[matchId], [field]: value },
    }));
  };

  /** BM validation: both scores required, 0-5 range, no ties */
  const handleSubmitScore = async (match: BMMatch) => {
    const scores = reportingScores[match.id];
    if (!scores?.score1 || !scores?.score2) return;

    const s1 = parseInt(scores.score1, 10);
    const s2 = parseInt(scores.score2, 10);

    if (s1 < 0 || s1 > 5 || s2 < 0 || s2 > 5) {
      ctx.setError(tPart("invalidScoreRange"));
      return;
    }
    if (s1 === s2) {
      ctx.setError(tPart("noTiesAllowed"));
      return;
    }

    const data = await ctx.submitReport(match.id, {
      playerId: ctx.playerId,
      score1: s1,
      score2: s2,
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
        ensureFormState(match.id);
        return (
          <div className="border-t pt-4">
            <h4 className="font-medium mb-3">{tPart("reportMatchResult")}</h4>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <Label className="text-sm">
                  {tPart("playerWins", { player: match.player1.nickname })}
                </Label>
                <Input
                  type="number"
                  min="0"
                  max="5"
                  placeholder="0-5"
                  value={reportingScores[match.id]?.score1 || ""}
                  onChange={(e) =>
                    handleScoreChange(match.id, "score1", e.target.value)
                  }
                />
              </div>
              <div>
                <Label className="text-sm">
                  {tPart("playerWins", { player: match.player2.nickname })}
                </Label>
                <Input
                  type="number"
                  min="0"
                  max="5"
                  placeholder="0-5"
                  value={reportingScores[match.id]?.score2 || ""}
                  onChange={(e) =>
                    handleScoreChange(match.id, "score2", e.target.value)
                  }
                />
              </div>
            </div>
            <Button
              onClick={() => handleSubmitScore(match)}
              disabled={
                ctx.submitting === match.id ||
                !reportingScores[match.id]?.score1 ||
                !reportingScores[match.id]?.score2
              }
              className="w-full"
            >
              {ctx.submitting === match.id
                ? tMatch("submitting")
                : tPart("submitScores")}
            </Button>
          </div>
        );
      }}
      renderPreviousReports={(match) =>
        match.player1ReportedScore1 !== undefined ||
        match.player2ReportedScore1 !== undefined ? (
          <div className="border-t pt-4">
            <h4 className="font-medium mb-2">{tPart("previousReports")}</h4>
            <div className="space-y-2 text-sm">
              {match.player1ReportedScore1 !== undefined && (
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
              {match.player2ReportedScore1 !== undefined && (
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
        ) : null
      }
    />
  );
}
