import type { QualificationScheduleMethod } from '@/lib/round-robin';

/**
 * Resolve the effective schedule for one qualification group.
 *
 * New tournaments are stored as CDM-first, but RR 2025 Start only defines the
 * championship-sized 14-20 player fixtures that this application uses here.
 * Smaller groups retain the flexible legacy circle schedule automatically.
 * Groups above the workbook ceiling also fall back defensively rather than
 * becoming impossible to set up.
 */
export function resolveQualificationScheduleMethodForGroup(
  configuredMethod: QualificationScheduleMethod,
  playerCount: number,
): QualificationScheduleMethod {
  if (configuredMethod !== 'cdm') return 'circle';
  return playerCount >= 14 && playerCount <= 20 ? 'cdm' : 'circle';
}
