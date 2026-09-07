import type { QualificationScheduleMethod } from '@/lib/round-robin';

export type QualificationSchedulePolicyReason =
  | 'configured-circle'
  | 'cdm-small-group-legacy-circle'
  | 'cdm-requested';

export interface QualificationSchedulePolicyDecision {
  configuredMethod: QualificationScheduleMethod;
  playerCount: number;
  effectiveMethod: QualificationScheduleMethod;
  reason: QualificationSchedulePolicyReason;
}

/**
 * Explain the effective schedule decision for one qualification group without
 * changing tournament state.
 *
 * This keeps the current 13 -> 14 boundary explicit and machine-readable so
 * Issue #3054 can change the policy later without relying on duplicated magic
 * numbers in diagnostics, tests, or future UI.
 */
export function getQualificationSchedulePolicyDecision(
  configuredMethod: QualificationScheduleMethod,
  playerCount: number,
): QualificationSchedulePolicyDecision {
  if (configuredMethod !== 'cdm') {
    return {
      configuredMethod,
      playerCount,
      effectiveMethod: 'circle',
      reason: 'configured-circle',
    };
  }

  if (playerCount <= 13) {
    return {
      configuredMethod,
      playerCount,
      effectiveMethod: 'circle',
      reason: 'cdm-small-group-legacy-circle',
    };
  }

  return {
    configuredMethod,
    playerCount,
    effectiveMethod: 'cdm',
    reason: 'cdm-requested',
  };
}

/**
 * Resolve the effective schedule for one qualification group.
 *
 * New tournaments are stored as CDM-first. Groups of 13 or fewer retain the
 * flexible legacy circle schedule automatically. Groups of 14 or more remain
 * CDM requests; the round-robin generator is responsible for rejecting sizes
 * above the largest RR 2025 Start fixture instead of silently changing rules.
 */
export function resolveQualificationScheduleMethodForGroup(
  configuredMethod: QualificationScheduleMethod,
  playerCount: number,
): QualificationScheduleMethod {
  return getQualificationSchedulePolicyDecision(configuredMethod, playerCount).effectiveMethod;
}
