import type { QualificationScheduleMethod } from '@/lib/round-robin';

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
  if (configuredMethod !== 'cdm') return 'circle';
  return playerCount <= 13 ? 'circle' : 'cdm';
}
