"use client";

import {
  useMemo,
  useState,
  type Dispatch,
  type InputHTMLAttributes,
  type SetStateAction,
} from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { COURSE_INFO } from "@/lib/constants";
import { autoFormatTime, timeToMs } from "@/lib/ta/time-utils";
import {
  TA_FINALS_TIME_INPUT_CLASS,
  TA_TIME_INPUT_HELP_CLASS,
} from "@/lib/ta/time-entry-layout";

export interface TASuddenDeathEntry {
  id: string;
  playerId: string;
  player: { nickname: string };
}

export interface TASuddenDeathRound {
  id: string;
  roundNumber: number;
  suddenDeathRounds?: TASuddenDeathRoundRecord[];
}

export interface TASuddenDeathRoundRecord {
  id: string;
  sequence: number;
  course: string;
  targetPlayerIds: string[];
  resolved: boolean;
}

export type PendingSuddenDeath = TASuddenDeathRoundRecord & {
  round: TASuddenDeathRound;
};

interface UseTASuddenDeathParams<Entry extends TASuddenDeathEntry, Round extends TASuddenDeathRound> {
  tournamentId: string;
  phase: string;
  entries: Entry[];
  rounds: Round[];
  fetchData: () => void | Promise<void>;
  setSaveError: Dispatch<SetStateAction<string | null>>;
  invalidTimeMessage: (name: string) => string;
}

export function useTaSuddenDeath<Entry extends TASuddenDeathEntry, Round extends TASuddenDeathRound>({
  tournamentId,
  phase,
  entries,
  rounds,
  fetchData,
  setSaveError,
  invalidTimeMessage,
}: UseTASuddenDeathParams<Entry, Round>) {
  const [times, setTimes] = useState<Record<string, string>>({});
  const [changingCourse, setChangingCourse] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  /*
   * Phase 1/2 elimination and Phase 3 finals use the same sudden-death API contract.
   * Keeping the pending-round lookup, target-player filtering, course mutation, and submit
   * payload in one hook prevents future bug fixes from landing on only one TA surface.
   */
  const pendingSuddenDeath = useMemo(
    () =>
      rounds
        .flatMap((round) => (round.suddenDeathRounds || []).map((sd) => ({ ...sd, round })))
        .find((sd) => !sd.resolved),
    [rounds],
  );

  const pendingSuddenDeathEntries = useMemo(
    () =>
      pendingSuddenDeath
        ? entries.filter((entry) => pendingSuddenDeath.targetPlayerIds.includes(entry.playerId))
        : [],
    [entries, pendingSuddenDeath],
  );

  const setTime = (playerId: string, value: string) => {
    setTimes((prev) => ({ ...prev, [playerId]: value }));
  };

  const handleTimeBlur = (playerId: string) => {
    const raw = times[playerId];
    if (!raw || raw.trim() === "") return;
    const formatted = autoFormatTime(raw);
    if (formatted !== null && formatted !== raw) {
      setTime(playerId, formatted);
    }
  };

  const handleCourseChange = async (course: string) => {
    if (!pendingSuddenDeath) return;
    setChangingCourse(true);
    setSaveError(null);
    try {
      const response = await fetch(`/api/tournaments/${tournamentId}/ta/phases`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "change_sudden_death_course",
          phase,
          suddenDeathRoundId: pendingSuddenDeath.id,
          course,
        }),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to change sudden-death course");
      }
      fetchData();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to change sudden-death course");
    } finally {
      setChangingCourse(false);
    }
  };

  const handleSubmit = async () => {
    if (!pendingSuddenDeath) return;
    setSubmitting(true);
    setSaveError(null);
    try {
      const results = pendingSuddenDeathEntries.map((entry) => {
        const timeMs = timeToMs(times[entry.playerId] || "");
        if (timeMs === null) {
          throw new Error(invalidTimeMessage(entry.player.nickname));
        }
        return { playerId: entry.playerId, timeMs };
      });
      const response = await fetch(`/api/tournaments/${tournamentId}/ta/phases`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "submit_sudden_death",
          phase,
          suddenDeathRoundId: pendingSuddenDeath.id,
          results,
        }),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to submit sudden-death results");
      }
      setTimes({});
      fetchData();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to submit sudden-death results");
    } finally {
      setSubmitting(false);
    }
  };

  return {
    pendingSuddenDeath,
    pendingSuddenDeathEntries,
    suddenDeathTimes: times,
    changingSuddenDeathCourse: changingCourse,
    submittingSuddenDeath: submitting,
    setSuddenDeathTime: setTime,
    handleSuddenDeathTimeBlur: handleTimeBlur,
    handleSuddenDeathCourseChange: handleCourseChange,
    handleSubmitSuddenDeath: handleSubmit,
  };
}

interface TASuddenDeathPanelProps<Entry extends TASuddenDeathEntry> {
  pendingSuddenDeath: PendingSuddenDeath;
  pendingSuddenDeathEntries: Entry[];
  availableCourses: string[];
  saveError: string | null;
  suddenDeathTimes: Record<string, string>;
  changingSuddenDeathCourse: boolean;
  submittingSuddenDeath: boolean;
  timeInputProps: InputHTMLAttributes<HTMLInputElement>;
  timeInputHelp: string;
  timePlaceholder: string;
  submittingLabel: string;
  onCourseChange: (course: string) => void;
  onTimeChange: (playerId: string, value: string) => void;
  onTimeBlur: (playerId: string) => void;
  onSubmit: () => void;
}

export interface TASuddenDeathSectionProps<Entry extends TASuddenDeathEntry> {
  isAdmin: boolean;
  isComplete: boolean;
  pendingSuddenDeath: PendingSuddenDeath | null | undefined;
  pendingSuddenDeathEntries: Entry[];
  availableCourses: string[];
  saveError: string | null;
  suddenDeathTimes: Record<string, string>;
  changingSuddenDeathCourse: boolean;
  submittingSuddenDeath: boolean;
  timeInputProps: InputHTMLAttributes<HTMLInputElement>;
  timeInputHelp: string;
  timePlaceholder: string;
  submittingLabel: string;
  onCourseChange: (course: string) => void;
  onTimeChange: (playerId: string, value: string) => void;
  onTimeBlur: (playerId: string) => void;
  onSubmit: () => void;
}

export function TASuddenDeathPanel<Entry extends TASuddenDeathEntry>({
  pendingSuddenDeath,
  pendingSuddenDeathEntries,
  availableCourses,
  saveError,
  suddenDeathTimes,
  changingSuddenDeathCourse,
  submittingSuddenDeath,
  timeInputProps,
  timeInputHelp,
  timePlaceholder,
  submittingLabel,
  onCourseChange,
  onTimeChange,
  onTimeBlur,
  onSubmit,
}: TASuddenDeathPanelProps<Entry>) {
  const tTaSuddenDeath = useTranslations("taSuddenDeath");

  return (
    <Card className="border-amber-500">
      <CardHeader>
        <CardTitle>{tTaSuddenDeath("suddenDeathTiebreak")}</CardTitle>
        <CardDescription>
          {tTaSuddenDeath("suddenDeathRoundDesc", {
            round: pendingSuddenDeath.round.roundNumber,
            sequence: pendingSuddenDeath.sequence,
          })}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {saveError && (
          <div className="mb-4 p-3 bg-destructive/10 border border-destructive rounded-md">
            <p className="text-destructive text-sm">{saveError}</p>
          </div>
        )}
        <div className="mb-4 space-y-1">
          <Label className="text-sm text-muted-foreground">{tTaSuddenDeath("suddenDeathCourse")}</Label>
          <Select
            value={pendingSuddenDeath.course}
            onValueChange={onCourseChange}
            disabled={changingSuddenDeathCourse || submittingSuddenDeath}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[...new Set([pendingSuddenDeath.course, ...availableCourses])].map((abbr) => {
                const info = COURSE_INFO.find((course) => course.abbr === abbr);
                return (
                  <SelectItem key={abbr} value={abbr}>
                    {info?.name || abbr}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-3">
          <p className={TA_TIME_INPUT_HELP_CLASS}>{timeInputHelp}</p>
          {pendingSuddenDeathEntries.map((entry) => (
            <div key={entry.id} className="flex items-center gap-2">
              <Label className="flex-1 truncate">{entry.player.nickname}</Label>
              <Input
                type="text"
                {...timeInputProps}
                placeholder={timePlaceholder}
                value={suddenDeathTimes[entry.playerId] || ""}
                onChange={(event) => onTimeChange(entry.playerId, event.target.value)}
                onBlur={() => onTimeBlur(entry.playerId)}
                className={TA_FINALS_TIME_INPUT_CLASS}
              />
            </div>
          ))}
        </div>
        <div className="mt-6 flex justify-end">
          <Button onClick={onSubmit} disabled={submittingSuddenDeath}>
            {submittingSuddenDeath ? submittingLabel : tTaSuddenDeath("submitSuddenDeath")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function TASuddenDeathSection<Entry extends TASuddenDeathEntry>({
  isAdmin,
  isComplete,
  pendingSuddenDeath,
  pendingSuddenDeathEntries,
  availableCourses,
  saveError,
  suddenDeathTimes,
  changingSuddenDeathCourse,
  submittingSuddenDeath,
  timeInputProps,
  timeInputHelp,
  timePlaceholder,
  submittingLabel,
  onCourseChange,
  onTimeChange,
  onTimeBlur,
  onSubmit,
}: TASuddenDeathSectionProps<Entry>) {
  if (!isAdmin || isComplete || !pendingSuddenDeath) return null;

  return (
    <TASuddenDeathPanel<Entry>
      pendingSuddenDeath={pendingSuddenDeath}
      pendingSuddenDeathEntries={pendingSuddenDeathEntries}
      availableCourses={availableCourses}
      saveError={saveError}
      suddenDeathTimes={suddenDeathTimes}
      changingSuddenDeathCourse={changingSuddenDeathCourse}
      submittingSuddenDeath={submittingSuddenDeath}
      timeInputProps={timeInputProps}
      timeInputHelp={timeInputHelp}
      timePlaceholder={timePlaceholder}
      submittingLabel={submittingLabel}
      onCourseChange={onCourseChange}
      onTimeChange={onTimeChange}
      onTimeBlur={onTimeBlur}
      onSubmit={onSubmit}
    />
  );
}
