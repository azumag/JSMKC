import {
  getQualificationSchedulePolicyDecision,
  type QualificationSchedulePolicyDecision,
} from '@/lib/qualification-schedule-policy';
import type { QualificationScheduleMethod } from '@/lib/round-robin';

export const QUALIFICATION_DIAGNOSTIC_MODES = ['bm', 'mr', 'gp'] as const;

export type QualificationDiagnosticMode = (typeof QUALIFICATION_DIAGNOSTIC_MODES)[number];

export interface QualificationGroupDiagnostic extends QualificationSchedulePolicyDecision {
  group: string;
}

export type QualificationScheduleDiagnostics = Record<QualificationDiagnosticMode, QualificationGroupDiagnostic[]>;

export type QualificationRowsByMode = Record<QualificationDiagnosticMode, ReadonlyArray<{ group: string }>>;

/**
 * Build a read-only view of the effective qualification scheduling policy for
 * each populated group. This intentionally reports the current policy without
 * changing tournament state, so operators can inspect the 13 -> 14 boundary
 * while Issue #3054 remains a pending tournament-rules decision.
 */
export function buildQualificationScheduleDiagnostics(
  configuredMethod: QualificationScheduleMethod,
  rowsByMode: QualificationRowsByMode,
): QualificationScheduleDiagnostics {
  return Object.fromEntries(
    QUALIFICATION_DIAGNOSTIC_MODES.map((mode) => {
      const counts = new Map<string, number>();
      for (const row of rowsByMode[mode]) {
        counts.set(row.group, (counts.get(row.group) ?? 0) + 1);
      }

      const groups = [...counts.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([group, playerCount]) => ({
          group,
          ...getQualificationSchedulePolicyDecision(configuredMethod, playerCount),
        }));

      return [mode, groups];
    }),
  ) as QualificationScheduleDiagnostics;
}
