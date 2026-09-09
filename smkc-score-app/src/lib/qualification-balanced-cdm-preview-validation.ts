import { buildBalancedCdmSidePreviewSchedule } from '@/lib/qualification-schedule-comparison';
import {
  generateRoundRobinSchedule,
  type RoundRobinMatch,
  type RoundRobinSchedule,
} from '@/lib/round-robin';

export type BalancedCdmSidePreviewInvariant =
  | 'cdm-total-days'
  | 'cdm-pair-set'
  | 'cdm-day-placement'
  | 'cdm-break-placement'
  | 'circle-side-orientation';

export interface BalancedCdmSidePreviewValidationChecks {
  preservesCdmTotalDays: boolean;
  preservesCdmPairSet: boolean;
  preservesCdmDayPlacement: boolean;
  preservesCdmBreakPlacement: boolean;
  preservesCircleSideOrientation: boolean;
}

export interface BalancedCdmSidePreviewValidation {
  playerCount: number;
  valid: boolean;
  failedInvariants: BalancedCdmSidePreviewInvariant[];
  checks: BalancedCdmSidePreviewValidationChecks;
}

function pairKey(match: RoundRobinMatch) {
  return [match.player1Id, match.player2Id].sort().join('\u0000');
}

function buildRealMatchMap(schedule: RoundRobinSchedule) {
  return new Map(
    schedule.matches.filter((match) => !match.isBye).map((match) => [pairKey(match), match] as const),
  );
}

function buildBreakSignatures(schedule: RoundRobinSchedule) {
  return schedule.matches
    .filter((match) => match.isBye)
    .map((match) => `${match.day}\u0000${match.player1Id}\u0000${match.player2Id}`)
    .sort();
}

function sameStringArray(left: readonly string[], right: readonly string[]) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

/**
 * Validate the read-only balanced-side CDM preview against the two schedules it
 * intentionally combines: CDM owns Day/BREAK placement while circle owns the
 * 1P/2P orientation for every real pair.
 *
 * This is a guardrail for the pending #3054 decision. It does not persist or
 * select a qualification schedule. null means no compatible preview can be
 * built for the supplied player count/pair set.
 */
export function validateBalancedCdmSidePreviewSchedule(
  playerIds: string[],
): BalancedCdmSidePreviewValidation | null {
  const preview = buildBalancedCdmSidePreviewSchedule(playerIds);
  if (!preview) return null;

  const circle = generateRoundRobinSchedule(playerIds, { method: 'circle' });
  const cdm = generateRoundRobinSchedule(playerIds, { method: 'cdm' });
  const previewMatches = buildRealMatchMap(preview);
  const circleMatches = buildRealMatchMap(circle);
  const cdmMatches = buildRealMatchMap(cdm);

  const preservesCdmTotalDays = preview.totalDays === cdm.totalDays;
  const preservesCdmPairSet =
    previewMatches.size === cdmMatches.size && Array.from(cdmMatches.keys()).every((key) => previewMatches.has(key));
  const preservesCdmDayPlacement =
    preservesCdmPairSet &&
    Array.from(cdmMatches.entries()).every(([key, cdmMatch]) => previewMatches.get(key)?.day === cdmMatch.day);
  const preservesCdmBreakPlacement = sameStringArray(buildBreakSignatures(preview), buildBreakSignatures(cdm));
  const preservesCircleSideOrientation =
    previewMatches.size === circleMatches.size &&
    Array.from(circleMatches.entries()).every(([key, circleMatch]) => {
      const previewMatch = previewMatches.get(key);
      return (
        previewMatch?.player1Id === circleMatch.player1Id && previewMatch?.player2Id === circleMatch.player2Id
      );
    });

  const checks: BalancedCdmSidePreviewValidationChecks = {
    preservesCdmTotalDays,
    preservesCdmPairSet,
    preservesCdmDayPlacement,
    preservesCdmBreakPlacement,
    preservesCircleSideOrientation,
  };

  const failedInvariants: BalancedCdmSidePreviewInvariant[] = [];
  if (!preservesCdmTotalDays) failedInvariants.push('cdm-total-days');
  if (!preservesCdmPairSet) failedInvariants.push('cdm-pair-set');
  if (!preservesCdmDayPlacement) failedInvariants.push('cdm-day-placement');
  if (!preservesCdmBreakPlacement) failedInvariants.push('cdm-break-placement');
  if (!preservesCircleSideOrientation) failedInvariants.push('circle-side-orientation');

  return {
    playerCount: playerIds.length,
    valid: failedInvariants.length === 0,
    failedInvariants,
    checks,
  };
}
