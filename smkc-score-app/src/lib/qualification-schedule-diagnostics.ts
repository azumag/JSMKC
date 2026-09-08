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

export interface QualificationScheduleDiagnosticsModeBucket {
  mode: QualificationDiagnosticMode;
  groupCount: number;
  playerCount: number;
  cdmReadyGroupCount: number;
  cdmReadyPlayerCount: number;
  cdmExactFitGroupCount: number;
  cdmBreakRequiredGroupCount: number;
  cdmBreakSlotCount: number;
  cdmUnavailableGroupCount: number;
  cdmUnavailablePlayerCount: number;
}

export interface QualificationScheduleDiagnosticsSummary {
  totalGroupCount: number;
  legacyCircleGroupCount: number;
  legacyCirclePlayerCount: number;
  legacyCircleCdmReadyGroupCount: number;
  legacyCircleCdmReadyPlayerCount: number;
  legacyCircleCdmExactFitGroupCount: number;
  legacyCircleCdmBreakRequiredGroupCount: number;
  legacyCircleCdmBreakSlotCount: number;
  legacyCircleCdmUnavailableGroupCount: number;
  legacyCircleCdmUnavailablePlayerCount: number;
  legacyCircleSizeBreakdown: QualificationScheduleDiagnosticsSizeBucket[];
  legacyCircleModeBreakdown: QualificationScheduleDiagnosticsModeBucket[];
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

function sumPlayerCount(groups: QualificationGroupDiagnostic[]) {
  return groups.reduce((total, group) => total + group.playerCount, 0);
}

function sumCdmBreakSlotCount(groups: QualificationGroupDiagnostic[]) {
  return groups.reduce((total, group) => total + (group.cdmBreakSlotCount ?? 0), 0);
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
  const legacyCircleCdmUnavailableGroups = legacyCircleGroups.filter((group) => group.cdmFixtureCapacity === null);
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
  const legacyCircleModeBreakdown = QUALIFICATION_DIAGNOSTIC_MODES.map((mode) => {
    const modeGroups = diagnostics[mode].filter((group) => group.reason === 'cdm-small-group-legacy-circle');
    const cdmReadyGroups = modeGroups.filter((group) => group.cdmFixtureCapacity !== null);
    const cdmUnavailableGroups = modeGroups.filter((group) => group.cdmFixtureCapacity === null);

    return {
      mode,
      groupCount: modeGroups.length,
      playerCount: sumPlayerCount(modeGroups),
      cdmReadyGroupCount: cdmReadyGroups.length,
      cdmReadyPlayerCount: sumPlayerCount(cdmReadyGroups),
      cdmExactFitGroupCount: cdmReadyGroups.filter((group) => group.cdmBreakSlotCount === 0).length,
      cdmBreakRequiredGroupCount: cdmReadyGroups.filter((group) => (group.cdmBreakSlotCount ?? 0) > 0).length,
      cdmBreakSlotCount: sumCdmBreakSlotCount(cdmReadyGroups),
      cdmUnavailableGroupCount: cdmUnavailableGroups.length,
      cdmUnavailablePlayerCount: sumPlayerCount(cdmUnavailableGroups),
    };
  }).filter((bucket) => bucket.groupCount > 0);

  return {
    totalGroupCount: groups.length,
    legacyCircleGroupCount: legacyCircleGroups.length,
    legacyCirclePlayerCount: sumPlayerCount(legacyCircleGroups),
    legacyCircleCdmReadyGroupCount: legacyCircleCdmReadyGroups.length,
    legacyCircleCdmReadyPlayerCount: sumPlayerCount(legacyCircleCdmReadyGroups),
    legacyCircleCdmExactFitGroupCount: legacyCircleCdmReadyGroups.filter((group) => group.cdmBreakSlotCount === 0)
      .length,
    legacyCircleCdmBreakRequiredGroupCount: legacyCircleCdmReadyGroups.filter(
      (group) => (group.cdmBreakSlotCount ?? 0) > 0,
    ).length,
    legacyCircleCdmBreakSlotCount: sumCdmBreakSlotCount(legacyCircleCdmReadyGroups),
    legacyCircleCdmUnavailableGroupCount: legacyCircleCdmUnavailableGroups.length,
    legacyCircleCdmUnavailablePlayerCount: sumPlayerCount(legacyCircleCdmUnavailableGroups),
    legacyCircleSizeBreakdown,
    legacyCircleModeBreakdown,
    cdmFixtureUnavailableGroupCount: groups.filter((group) => group.cdmFixtureCapacity === null).length,
    cdmBreakRequiredGroupCount: groups.filter((group) => (group.cdmBreakSlotCount ?? 0) > 0).length,
    generationBlockedGroupCount: groups.filter((group) => !group.generationSupported).length,
  };
}
