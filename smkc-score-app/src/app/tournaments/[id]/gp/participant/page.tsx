/**
 * Grand Prix Participant Score Entry Page
 *
 * Player-facing page for reporting GP match results with driver-point totals.
 * Uses shared useParticipantMatches hook and ParticipantPageLayout.
 */
"use client";

import { useState, use } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Star } from "lucide-react";
import { useParticipantMatches, type BaseMatch } from "@/lib/hooks/useParticipantMatches";
import { ParticipantPageLayout } from "@/components/tournament/participant-page-layout";
import { getMatchReportSuccessMessage } from "@/lib/participant-report-message";

/** GP Match extends BaseMatch with GP-specific fields */
interface GPMatch extends BaseMatch {
  cup?: string;
  points1: number;
  points2: number;
  races?: { course: string; position1: number; position2: number; points1: number; points2: number }[];
  player1ReportedPoints1?: number;
  player1ReportedPoints2?: number;
  player2ReportedPoints1?: number;
  player2ReportedPoints2?: number;
}

interface DriverPointInput {
  points1: string;
  points2: string;
}

const MAX_GP_DRIVER_POINTS = 45;

function isValidDriverPointInput(value: string): boolean {
  if (!/^\d+$/.test(value)) return false;
  const points = Number(value);
  return Number.isInteger(points) && points >= 0 && points <= MAX_GP_DRIVER_POINTS;
}

export default function GrandPrixParticipantPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: tournamentId } = use(params);
  const tPart = useTranslations("participant");
  const tMatch = useTranslations("match");
  const tGp = useTranslations("gp");

  const ctx = useParticipantMatches<GPMatch>({ tournamentId, mode: "gp" });

  const [driverPoints, setDriverPoints] = useState<Record<string, DriverPointInput>>({});

  const getPointsInput = (matchId: string): DriverPointInput =>
    driverPoints[matchId] ?? { points1: "", points2: "" };

  const updatePointsInput = (matchId: string, field: keyof DriverPointInput, value: string) => {
    if (value !== "" && !/^\d+$/.test(value)) return;
    setDriverPoints((prev) => ({
      ...prev,
      [matchId]: { ...getPointsInput(matchId), [field]: value },
    }));
  };

  const canSubmitPoints = ({ points1, points2 }: DriverPointInput) =>
    isValidDriverPointInput(points1) && isValidDriverPointInput(points2);

  const handleSubmitMatch = async (match: GPMatch) => {
    const points = getPointsInput(match.id);
    if (!canSubmitPoints(points)) {
      ctx.setError(tGp("driverPointsValidation"));
      return;
    }
    const reportingPlayer = match.player1.id === ctx.playerId ? 1 : 2;

    const data = await ctx.submitReport(match.id, {
      reportingPlayer,
      points1: Number(points.points1),
      points2: Number(points.points2),
    });

    if (data) {
      setDriverPoints((prev) => ({ ...prev, [match.id]: { points1: "", points2: "" } }));
      alert(getMatchReportSuccessMessage(data, {
        matchReportedSuccess: tPart("matchReportedSuccess"),
        matchConfirmedSuccess: tPart("matchConfirmedSuccess"),
        matchMismatchSubmitted: tPart("matchMismatchSubmitted"),
      }));
    }
  };

  return (
    <ParticipantPageLayout<GPMatch>
      mode="gp"
      sectionIcon={Star}
      maxWidth="max-w-6xl"
      noPendingKey="noPendingGP"
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
      renderCardHeaderExtra={(match) => (
        <>
          {match.cup && ` • ${tGp("cupLabel", { cup: match.cup })}`}
        </>
      )}
      renderMatchForm={(match) => {
        const points = getPointsInput(match.id);
        const points1 = points.points1 === "" ? 0 : Number(points.points1);
        const points2 = points.points2 === "" ? 0 : Number(points.points2);

        return (
          <div className="border-t pt-4">
            <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <h4 className="font-medium">{tGp("driverPointsEntry")}</h4>
              <div className="text-sm font-medium text-muted-foreground">
                {tMatch("totalPoints", { points1, points2 })}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">{match.player1.nickname}</p>
                <Input
                  inputMode="numeric"
                  min={0}
                  max={MAX_GP_DRIVER_POINTS}
                  value={points.points1}
                  onChange={(event) => updatePointsInput(match.id, "points1", event.target.value)}
                  placeholder="0"
                />
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">{match.player2.nickname}</p>
                <Input
                  inputMode="numeric"
                  min={0}
                  max={MAX_GP_DRIVER_POINTS}
                  value={points.points2}
                  onChange={(event) => updatePointsInput(match.id, "points2", event.target.value)}
                  placeholder="0"
                />
              </div>
            </div>
            <div className="mt-4 rounded-lg bg-gray-50 p-3">
              <div className="text-center font-medium">{tMatch("totalPoints", { points1, points2 })}</div>
            </div>

            <Button
              onClick={() => handleSubmitMatch(match)}
              disabled={ctx.submitting === match.id || !canSubmitPoints(points)}
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
                  <span className="font-mono">{match.player1ReportedPoints1} - {match.player1ReportedPoints2} {tPart("points")}</span>
                </div>
              )}
              {match.player2ReportedPoints1 !== undefined && (
                <div className="flex justify-between p-2 bg-gray-50 rounded">
                  <span>{tPart("playerReported", { player: match.player2.nickname })}</span>
                  <span className="font-mono">{match.player2ReportedPoints1} - {match.player2ReportedPoints2} {tPart("points")}</span>
                </div>
              )}
            </div>
          </div>
        ) : null
      }
    />
  );
}
