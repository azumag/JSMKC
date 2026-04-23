/**
 * Grand Prix Participant Score Entry Page
 *
 * Player-facing page for reporting GP match results with race-by-race entry.
 * Uses shared useParticipantMatches hook and ParticipantPageLayout.
 *
 * GP-specific: race results with cup-filtered courses, auto-calculated driver points,
 * and cup substitution (§7.1: Star→Mushroom, Special→Flower).
 *
 * Driver points: 1st=9, 2nd=6, 3rd=3, 4th=1, 5th-8th=0
 */
"use client";

import { useState, useMemo, useEffect, use } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Star } from "lucide-react";
import { COURSE_INFO, CUP_SUBSTITUTIONS, GP_POSITION_OPTIONS, TOTAL_GP_RACES, getDriverPoints } from "@/lib/constants";
import { formatGpPosition } from "@/lib/gp-utils";
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
  position1: number | null;
  position2: number | null;
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
  const locale = useLocale();
  // Bind locale and gameOver label into the shared formatGpPosition utility
  const fmtPos = (position: number) => formatGpPosition(position, locale, tCommon("gameOver"));

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

  /* Auto-initialize 5 races from cup's fixed course order when matches load.
   * This replaces the previous in-render setState which violated React rules. */
  useEffect(() => {
    if (ctx.myMatches.length === 0) return;
    setRaceResults((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const match of ctx.myMatches) {
        const cup = cupOverrides[match.id] || match.cup;
        if (cup && (!next[match.id] || next[match.id].length === 0)) {
          const cupCourses = COURSE_INFO.filter((c) => c.cup === cup).map((c) => c.abbr);
          next[match.id] = cupCourses.map((course) => ({ course, position1: null, position2: null, points1: 0, points2: 0 }));
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [ctx.myMatches, cupOverrides]);

  const addRaceResult = (matchId: string) => {
    setRaceResults((prev) => ({
      ...prev,
      [matchId]: [...(prev[matchId] || []), { course: "", position1: null, position2: null, points1: 0, points2: 0 }],
    }));
  };

  /** Update race result field — auto-calculates driver points on position change */
  const updateRaceResult = (matchId: string, index: number, field: keyof RaceResult, value: string | number | null) => {
    setRaceResults((prev) => ({
      ...prev,
      [matchId]: (prev[matchId] || []).map((r, i) => {
        if (i !== index) return r;
        const updated = { ...r, [field]: value };
        if (field === "position1" || field === "position2") {
          const pos1 = field === "position1" ? (value as number | null) : r.position1;
          const pos2 = field === "position2" ? (value as number | null) : r.position2;
          updated.points1 = pos1 ? getDriverPoints(pos1) : 0;
          updated.points2 = pos2 ? getDriverPoints(pos2) : 0;
        }
        return updated;
      }),
    }));
  };

  const removeRaceResult = (matchId: string, index: number) => {
    setRaceResults((prev) => ({
      ...prev,
      [matchId]: (prev[matchId] || []).filter((_, i) => i !== index),
    }));
  };

  const calculateTotalPoints = (results: RaceResult[]) => {
    let points1 = 0, points2 = 0;
    results.forEach((r) => { points1 += r.points1; points2 += r.points2; });
    return { points1, points2 };
  };

  /** Check if all races are complete and valid for submission.
   * Same-position is blocked except both at 0 (game over, §7.2). */
  const canSubmitRaces = (races: RaceResult[]) =>
    races.length === TOTAL_GP_RACES &&
    races.every((race) =>
      race.course &&
      race.position1 !== null &&
      race.position2 !== null &&
      (race.position1 !== race.position2 || race.position1 === 0)
    );

  const handleSubmitMatch = async (match: GPMatch) => {
    const races = raceResults[match.id] || [];
    if (races.length === 0) { ctx.setError(tPart("addAtLeastOneRace")); return; }
    const reportingPlayer = match.player1.id === ctx.playerId ? 1 : 2;

    for (const r of races) {
      if (!r.course || r.position1 === null || r.position2 === null) {
        ctx.setError(tPart("completeAllRaceFields")); return;
      }
      /* Two players cannot finish in same position, except both game-over (0) per §7.2 */
      if (r.position1 === r.position2 && r.position1 !== 0) {
        ctx.setError(tPart("racePositionsCannotBeEqual")); return;
      }
    }

    const { points1, points2 } = calculateTotalPoints(races);
    const data = await ctx.submitReport(match.id, {
      reportingPlayer, points1, points2, races,
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
                /* Clear races so useEffect re-initializes with new cup's courses */
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
        /* Races are auto-initialized by useEffect when matches load */
        const races = raceResults[match.id] || [];
        const { points1, points2 } = calculateTotalPoints(races);

        return (
          <div className="border-t pt-4">
            <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <h4 className="font-medium">{tPart("raceResults")}</h4>
              <div className="text-sm font-medium text-muted-foreground">
                {tMatch("totalPoints", { points1, points2 })}
              </div>
            </div>

            {races.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Star className="h-8 w-8 mx-auto mb-2" />
                <p>{tPart("noRacesYet")}</p>
              </div>
            ) : (
              <div className="space-y-3">
                {races.map((result, index) => (
                  <div key={index} className="grid gap-3 rounded-md border p-3 lg:grid-cols-[4rem_minmax(12rem,1fr)_minmax(8rem,0.7fr)_4rem_minmax(8rem,0.7fr)_4rem] lg:items-end">
                    <div className="text-sm font-medium lg:pb-2">
                      {tMatch("raceN", { n: index + 1 })}
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">{tCommon("course")}</p>
                      {/* Course is auto-determined by cup + race order (SMK fixed sequence) */}
                      <p className="text-sm font-medium py-2">
                        {COURSE_INFO.find((c) => c.abbr === result.course)?.name || result.course}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">{match.player1.nickname}</p>
                      <Select
                        value={result.position1?.toString() ?? ""}
                        onValueChange={(v) => updateRaceResult(match.id, index, "position1", v === "" ? null : parseInt(v, 10))}
                      >
                        <SelectTrigger><SelectValue placeholder={tCommon("position")} /></SelectTrigger>
                        <SelectContent>
                          {GP_POSITION_OPTIONS.map((pos) => (
                            <SelectItem key={`p1-${index}-${pos}`} value={pos.toString()}>
                              {fmtPos(pos)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="rounded-md bg-muted px-2 py-2 text-center font-mono text-sm">
                      {tMatch("pts", { points: result.points1 })}
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">{match.player2.nickname}</p>
                      <Select
                        value={result.position2?.toString() ?? ""}
                        onValueChange={(v) => updateRaceResult(match.id, index, "position2", v === "" ? null : parseInt(v, 10))}
                      >
                        <SelectTrigger><SelectValue placeholder={tCommon("position")} /></SelectTrigger>
                        <SelectContent>
                          {GP_POSITION_OPTIONS.map((pos) => (
                            <SelectItem key={`p2-${index}-${pos}`} value={pos.toString()}>
                              {fmtPos(pos)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="rounded-md bg-muted px-2 py-2 text-center font-mono text-sm">
                      {tMatch("pts", { points: result.points2 })}
                    </div>
                    {/* Race removal removed: 5 races are fixed per cup */}
                  </div>
                ))}
                <div className="mt-4 p-3 bg-gray-50 rounded-lg">
                  <div className="font-medium text-center">{tMatch("totalPoints", { points1, points2 })}</div>
                </div>
              </div>
            )}

            <Button
              onClick={() => handleSubmitMatch(match)}
              disabled={ctx.submitting === match.id || !canSubmitRaces(races)}
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
