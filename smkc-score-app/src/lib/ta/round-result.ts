import { normalizeTaHandicapSeconds } from '@/lib/ta/battle-royale';
import { isCanonicalTaPlayerId } from '@/lib/ta/player-id';
import type { TaRoundResult } from '@/lib/ta/phase-api-types';

function isFiniteNonNegative(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

export function normalizeTaRoundResult(value: unknown): TaRoundResult | null {
  if (!value || typeof value !== 'object') return null;
  const input = value as Record<string, unknown>;
  if (!isCanonicalTaPlayerId(input.playerId) || !isFiniteNonNegative(input.timeMs)) {
    return null;
  }
  const rawTimeMs = isFiniteNonNegative(input.rawTimeMs) ? input.rawTimeMs : input.timeMs;
  const tvNumber = typeof input.tvNumber === 'number' && [1, 2, 3, 4].includes(input.tvNumber) ? input.tvNumber : null;
  return {
    playerId: input.playerId,
    rawTimeMs,
    handicapSeconds: normalizeTaHandicapSeconds(input.handicapSeconds),
    timeMs: input.timeMs,
    isRetry: input.isRetry === true,
    tvNumber,
  };
}

export function normalizeTaRoundResults(value: unknown): TaRoundResult[] {
  if (!Array.isArray(value)) return [];
  return value.map(normalizeTaRoundResult).filter((result): result is TaRoundResult => result !== null);
}

export type TaSuddenDeathRoundWithNormalizedResults<T extends { results: unknown }> = Omit<T, 'results'> & {
  results: TaRoundResult[];
};

/**
 * Prisma exposes sudden-death `results` as persisted JSON. Normalize that
 * nested boundary before feeding live phase rounds into Phase 3 replay so a
 * malformed sub-round cannot leak an incompatible `JsonValue` shape into the
 * typed replay contract.
 */
export function normalizeTaSuddenDeathRoundResults<T extends { results: unknown }>(
  rounds: readonly T[] | null | undefined,
): Array<TaSuddenDeathRoundWithNormalizedResults<T>> {
  return (rounds ?? []).map((round) => ({
    ...round,
    results: normalizeTaRoundResults(round.results),
  }));
}
