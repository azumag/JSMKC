import type { CourseCycleStatus } from "@/lib/ta/course-cycle-status";

type CourseCycleMessageKey =
  | "courseCycleLabel"
  | "courseCycleValue"
  | "availableCoursesLabel"
  | "availableCoursesValue"
  | "courseCycleHint";

export type CourseCycleStatusPanelTranslator = (
  key: CourseCycleMessageKey,
  values?: Record<string, number>,
) => string;

interface CourseCycleStatusPanelProps {
  t: CourseCycleStatusPanelTranslator;
  status: CourseCycleStatus;
  availableCoursesCount: number;
}

export function CourseCycleStatusPanel({
  t,
  status,
  availableCoursesCount,
}: CourseCycleStatusPanelProps) {
  /*
   * Finals phase 3 and elimination phases 1/2 share the same course-cycle UI.
   * The available count stays as an explicit prop because it is calculated by
   * the server-backed course pool, not by the lightweight cycle-status helper.
   */
  return (
    <div className="border border-foreground/15 bg-muted/30 p-3 text-sm space-y-2">
      <div className="flex justify-between gap-3">
        <span className="text-muted-foreground">{t("courseCycleLabel")}</span>
        <span className="font-mono tabular-nums text-right">
          {t("courseCycleValue", {
            cycle: status.cycleNumber,
            played: status.playedInCycle,
            total: status.totalCourses,
          })}
        </span>
      </div>
      <div className="flex justify-between gap-3">
        <span className="text-muted-foreground">{t("availableCoursesLabel")}</span>
        <span className="font-mono tabular-nums text-right">
          {t("availableCoursesValue", {
            count: availableCoursesCount,
            total: status.totalCourses,
          })}
        </span>
      </div>
      <p className="text-xs text-muted-foreground">
        {t("courseCycleHint", { totalPlayed: status.totalPlayed })}
      </p>
    </div>
  );
}
