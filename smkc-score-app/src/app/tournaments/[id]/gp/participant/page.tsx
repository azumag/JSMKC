/**
 * Grand Prix Participant Score Entry Page
 *
 * Player-facing page for reporting GP match results with race-by-race entry.
 * Uses shared useParticipantMatches hook and ParticipantPageLayout.
 *
 * GP-specific: race results with cup-filtered courses, auto-calculated driver points,
 * and cup substitution (§7.1: Star→Mushroom, Special→Flower).
 *
 * Driver points: 1st=9, 2nd=6, 3rd=3, 4th=1
 */
"use client";

import { useState, useMemo, use } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Star } from "lucide-react";
import { COURSE_INFO, CUP_SUBSTITUTIONS, TOTAL_GP_RACES, getDriverPoints } from "@/lib/constants";
import { useParticipantMatches, type BaseMatch } from "@/lib/hooks/useParticipantMatches";
import { ParticipantPageLayout } from "@/components/tournament/participant-page-layout";

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

/** Individual race result with auto-calculated driver points */
interface RaceResult {
  course: string;
  position1: number;
  position2: number;
  points1: number;
  points2: number;
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
  const tCommon = useTranslations("common");

  const ctx = useParticipantMatches<GPMatch>({ tournamentId, mode: "gp" });

  /* GP-specific state */
  const [raceResults, setRaceResults] = useState<Record<string, RaceResult[]>>({});
  /** §7.1 cup substitution: derive default cups from match data, allow user overrides */
  const matchCups = useMemo(() => {
    const cups: Record<string, string> = {};
    ctx.myMatches.forEach((match) => {
      if (match.cup) cups[match.id] = match.cup;
    });
    return cups;
  }, [ctx.myMatches]);
  const [cupOverrides, setCupOverrides] = useState<Record<string, string>>({});
  /* Merge: user overrides take precedence over match-derived defaults */
  const activeCups = useMemo(() => ({ ...matchCups, ...cupOverrides }), [matchCups, cupOverrides]);

  const addRaceResult = (matchId: string) => {
    setRaceResults((prev) => ({
      ...prev,
      [matchId]: [...(prev[matchId] || []), { course: "", position1: 0, position2: 0, points1: 0, points2: 0 }],
    }));
  };

  /** Update race result field — auto-calculates driver points on position change */
  const updateRaceResult = (matchId: string, index: number, field: keyof RaceResult, value: string | number) => {
    setRaceResults((prev) => ({
      ...prev,
      [matchId]: prev[matchId].map((r, i) => {
        if (i !== index) return r;
        const updated = { ...r, [field]: value };
        if (field === "position1" || field === "position2") {
          const pos1 = field === "position1" ? (value as number) : r.position1;
          const pos2 = field === "position2" ? (value as number) : r.position2;
          updated.points1 = getDriverPoints(pos1);
          updated.points2 = getDriverPoints(pos2);
        }
        return updated;
      }),
    }));
  };

  const removeRaceResult = (matchId: string, index: number) => {
    setRaceResults((prev) => ({
      ...prev,
      [matchId]: prev[matchId].filter((_, i) => i !== index),
    }));
  };

  const calculateTotalPoints = (results: RaceResult[]) => {
    let points1 = 0, points2 = 0;
    results.forEach((r) => { points1 += r.points1; points2 += r.points2; });
    return { points1, points2 };
  };

  const handleSubmitMatch = async (match: GPMatch) => {
    const races = raceResults[match.id] || [];
    if (races.length === 0) { ctx.setError(tPart("addAtLeastOneRace")); return; }

    for (const r of races) {
      /* Course is required; positions can be 0 (game over per §7.2) but not undefined */
      if (!r.course || r.position1 == null || r.position2 == null) {
        ctx.setError(tPart("completeAllRaceFields")); return;
      }
      /* Both 0 (both game over) is invalid; same non-zero position is also invalid */
      if (r.position1 === r.position2 && r.position1 !== 0) {
        ctx.setError(tPart("racePositionsCannotBeEqual")); return;
      }
    }

    const { points1, points2 } = calculateTotalPoints(races);
    const data = await ctx.submitReport(match.id, {
      playerId: ctx.playerId, points1, points2, races,
    });

    if (data) {
      setRaceResults((prev) => ({ ...prev, [match.id]: [] }));
      alert(tPart("matchReportedSuccess"));
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
      loading={ctx.loading}
      tournament={ctx.tournament}
      session={ctx.session}
      error={ctx.error}
      myMatches={ctx.myMatches}
      tournamentId={tournamentId}
      playerId={ctx.playerId}
      submitting={ctx.submitting}
      renderCardHeaderExtra={(match) => (
        <>
          {match.cup && ` • ${tGp("cupLabel", { cup: activeCups[match.id] || match.cup })}`}
          {match.cup && CUP_SUBSTITUTIONS[match.cup] && (
            <Button
              variant="ghost"
              size="sm"
              className="text-xs h-5 ml-1 px-1"
              onClick={() => {
                if (!match.cup) return;
                const current = activeCups[match.id] || match.cup;
                const next = current === match.cup ? CUP_SUBSTITUTIONS[match.cup] : match.cup;
                setCupOverrides((prev) => ({ ...prev, [match.id]: next }));
                setRaceResults((prev) => ({ ...prev, [match.id]: [] }));
              }}
            >
              {(activeCups[match.id] || match.cup) === match.cup
                ? tGp("switchToSubstitute", { cup: CUP_SUBSTITUTIONS[match.cup] })
                : tGp("switchBackToAssigned", { cup: match.cup })}
            </Button>
          )}
        </>
      )}
      renderMatchForm={(match) => {
        const races = raceResults[match.id] || [];
        const { points1, points2 } = calculateTotalPoints(races);

        return (
          <div className="border-t pt-4">
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-medium">{tPart("raceResults")}</h4>
              <Button size="sm" variant="outline" onClick={() => addRaceResult(match.id)} disabled={races.length >= TOTAL_GP_RACES}>
                {tPart("addRace")}
              </Button>
            </div>

            {races.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Star className="h-8 w-8 mx-auto mb-2" />
                <p>{tPart("noRacesYet")}</p>
              </div>
            ) : (
              <div className="space-y-3">
                {races.map((result, index) => (
                  <div key={index} className="grid grid-cols-12 gap-2 items-center">
                    <div className="col-span-3">
                      <Select value={result.course} onValueChange={(v) => updateRaceResult(match.id, index, "course", v)}>
                        <SelectTrigger><SelectValue placeholder={tCommon("course")} /></SelectTrigger>
                        <SelectContent>
                          {(activeCups[match.id]
                            ? COURSE_INFO.filter((c) => c.cup === activeCups[match.id])
                            : COURSE_INFO
                          ).map((c) => (
                            <SelectItem key={c.abbr} value={c.abbr}>{c.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="col-span-2">
                      <Input type="number" min="0" max="4" placeholder="1st" value={result.position1 || ""} onChange={(e) => updateRaceResult(match.id, index, "position1", parseInt(e.target.value) || 0)} />
                    </div>
                    <div className="col-span-2">
                      <div className="text-center font-mono text-sm">{tMatch("pts", { points: result.points1 })}</div>
                    </div>
                    <div className="col-span-2">
                      <Input type="number" min="0" max="4" placeholder="2nd" value={result.position2 || ""} onChange={(e) => updateRaceResult(match.id, index, "position2", parseInt(e.target.value) || 0)} />
                    </div>
                    <div className="col-span-2">
                      <div className="text-center font-mono text-sm">{tMatch("pts", { points: result.points2 })}</div>
                    </div>
                    <div className="col-span-1">
                      <Button size="sm" variant="ghost" onClick={() => removeRaceResult(match.id, index)}>×</Button>
                    </div>
                  </div>
                ))}
                <div className="mt-4 p-3 bg-gray-50 rounded-lg">
                  <div className="font-medium text-center">{tMatch("totalPoints", { points1, points2 })}</div>
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
