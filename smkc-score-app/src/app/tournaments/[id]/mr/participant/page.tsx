/**
 * Match Race Participant Score Entry Page
 *
 * Player-facing page for reporting MR match results with race-by-race entry.
 * Uses shared useParticipantMatches hook and ParticipantPageLayout.
 *
 * MR-specific: race results with course selection + position inputs.
 * Scores are auto-calculated from race results (position1 < position2 = P1 win).
 */
"use client";

import { useState, use } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Flag } from "lucide-react";
import { COURSE_INFO } from "@/lib/constants";
import { useParticipantMatches, type BaseMatch } from "@/lib/hooks/useParticipantMatches";
import { ParticipantPageLayout } from "@/components/tournament/participant-page-layout";

/** MR Match extends BaseMatch with MR-specific fields */
interface MRMatch extends BaseMatch {
  score1: number;
  score2: number;
  rounds?: { course: string; winner: number }[];
  player1ReportedPoints1?: number;
  player1ReportedPoints2?: number;
  player2ReportedPoints1?: number;
  player2ReportedPoints2?: number;
}

/** Individual race result */
interface RaceResult {
  course: string;
  position1: number;
  position2: number;
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

  /* MR-specific: race results per match */
  const [raceResults, setRaceResults] = useState<Record<string, RaceResult[]>>({});

  const addRaceResult = (matchId: string) => {
    setRaceResults((prev) => ({
      ...prev,
      [matchId]: [...(prev[matchId] || []), { course: "", position1: 0, position2: 0 }],
    }));
  };

  const updateRaceResult = (matchId: string, index: number, field: keyof RaceResult, value: string | number) => {
    setRaceResults((prev) => ({
      ...prev,
      [matchId]: prev[matchId].map((r, i) => (i === index ? { ...r, [field]: value } : r)),
    }));
  };

  const removeRaceResult = (matchId: string, index: number) => {
    setRaceResults((prev) => ({
      ...prev,
      [matchId]: prev[matchId].filter((_, i) => i !== index),
    }));
  };

  /** Auto-calculate scores from race positions */
  const calculateScores = (results: RaceResult[]) => {
    let score1 = 0, score2 = 0;
    results.forEach((r) => {
      if (r.position1 < r.position2) score1++;
      else if (r.position2 < r.position1) score2++;
    });
    return { score1, score2 };
  };

  const handleSubmitMatch = async (match: MRMatch) => {
    const races = raceResults[match.id] || [];
    if (races.length === 0) { ctx.setError("Please add at least one race result."); return; }
    const reportingPlayer = match.player1.id === ctx.playerId ? 1 : 2;

    for (const r of races) {
      if (!r.course || r.position1 === 0 || r.position2 === 0) {
        ctx.setError("Please complete all race fields."); return;
      }
      if (r.position1 === r.position2) {
        ctx.setError("Race positions cannot be equal."); return;
      }
    }

    const { score1, score2 } = calculateScores(races);
    const data = await ctx.submitReport(match.id, {
      reportingPlayer, score1, score2, races,
    });

    if (data) {
      setRaceResults((prev) => ({ ...prev, [match.id]: [] }));
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
        const races = raceResults[match.id] || [];
        const { score1, score2 } = calculateScores(races);

        return (
          <div className="border-t pt-4">
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-medium">{tPart("raceResults")}</h4>
              <Button size="sm" variant="outline" onClick={() => addRaceResult(match.id)} disabled={races.length >= 5}>
                {tPart("addRace")}
              </Button>
            </div>

            {races.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Flag className="h-8 w-8 mx-auto mb-2" />
                <p>{tPart("noRacesYet")}</p>
              </div>
            ) : (
              <div className="space-y-3">
                {races.map((result, index) => (
                  <div key={index} className="grid grid-cols-12 gap-2 items-center">
                    <div className="col-span-4">
                      <Select value={result.course} onValueChange={(v) => updateRaceResult(match.id, index, "course", v)}>
                        <SelectTrigger><SelectValue placeholder={tCommon("selectCourse")} /></SelectTrigger>
                        <SelectContent>
                          {COURSE_INFO.map((c) => (
                            <SelectItem key={c.abbr} value={c.abbr}>{c.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="col-span-3">
                      <Input type="number" min="1" max="2" placeholder={tCommon("first")} value={result.position1 || ""} onChange={(e) => updateRaceResult(match.id, index, "position1", parseInt(e.target.value) || 0)} />
                    </div>
                    <div className="col-span-3">
                      <Input type="number" min="1" max="2" placeholder={tCommon("second")} value={result.position2 || ""} onChange={(e) => updateRaceResult(match.id, index, "position2", parseInt(e.target.value) || 0)} />
                    </div>
                    <div className="col-span-2">
                      <Button size="sm" variant="ghost" onClick={() => removeRaceResult(match.id, index)}>{tCommon("remove")}</Button>
                    </div>
                  </div>
                ))}
                <div className="mt-4 p-3 bg-gray-50 rounded-lg">
                  <div className="font-medium text-center">{tPart("currentScore", { score1, score2 })}</div>
                </div>
              </div>
            )}

            <Button onClick={() => handleSubmitMatch(match)} disabled={ctx.submitting === match.id || races.length === 0} className="w-full mt-4">
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
