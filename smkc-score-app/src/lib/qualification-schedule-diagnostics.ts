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

export interface QualificationScheduleDiagnosticsSizeBucket {
  playerCount: number;
  groupCount: number;
  cdmFixtureCapacity: number | null;
  cdmBreakSlotCount: number | null;
}

export interface QualificationScheduleDiagnosticsSummary {
  totalGroupCount: number;
  legacyCircleGroupCount: number;
  legacyCircleCdmReadyGroupCount: number;
  legacyCircleCdmExactFitGroupCount: number;
  legacyCircleCdmBreakRequiredGroupCount: number;
  legacyCircleCdmUnavailableGroupCount: number;
  legacyCircleSizeBreakdown: QualificationScheduleDiagnosticsSizeBucket[];
  cdmFixtureUnavailableGroupCount: number;
  cdmBreakRequiredGroupCount: number;
  generationBlockedGroupCount: number;
}

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

/**
 * Summarize the read-only diagnostics into counts that help operators scope
 * the unresolved Issue #3054 decisions without changing tournament state.
 */
export function summarizeQualificationScheduleDiagnostics(
  diagnostics: QualificationScheduleDiagnostics,
): QualificationScheduleDiagnosticsSummary {
  const groups = QUALIFICATION_DIAGNOSTIC_MODES.flatMap((mode) => diagnostics[mode]);
  const legacyCircleGroups = groups.filter((group) => group.reason === 'cdm-small-group-legacy-circle');
  const legacyCircleCdmReadyGroups = legacyCircleGroups.filter((group) => group.cdmFixtureCapacity !== null);
  const legacyCircleSizeBreakdown = [
    ...legacyCircleGroups
      .reduce((buckets, group) => {
        const existing = buckets.get(group.playerCount);
        if (existing) {
          existing.groupCount += 1;
        } else {
          buckets.set(group.playerCount, {
            playerCount: group.playerCount,
            groupCount: 1,
            cdmFixtureCapacity: group.cdmFixtureCapacity,
            cdmBreakSlotCount: group.cdmBreakSlotCount,
          });
        }
        return buckets;
      }, new Map<number, QualificationScheduleDiagnosticsSizeBucket>())
      .values(),
  ].sort((left, right) => left.playerCount - right.playerCount);

  return {
    totalGroupCount: groups.length,
    legacyCircleGroupCount: legacyCircleGroups.length,
    legacyCircleCdmReadyGroupCount: legacyCircleCdmReadyGroups.length,
    legacyCircleCdmExactFitGroupCount: legacyCircleCdmReadyGroups.filter((group) => group.cdmBreakSlotCount === 0)
      .length,
    legacyCircleCdmBreakRequiredGroupCount: legacyCircleCdmReadyGroups.filter(
      (group) => (group.cdmBreakSlotCount ?? 0) > 0,
    ).length,
    legacyCircleCdmUnavailableGroupCount: legacyCircleGroups.filter((group) => group.cdmFixtureCapacity === null)
      .length,
    legacyCircleSizeBreakdown,
    cdmFixtureUnavailableGroupCount: groups.filter((group) => group.cdmFixtureCapacity === null).length,
    cdmBreakRequiredGroupCount: groups.filter((group) => (group.cdmBreakSlotCount ?? 0) > 0).length,
    generationBlockedGroupCount: groups.filter((group) => !group.generationSupported).length,
  };
}
