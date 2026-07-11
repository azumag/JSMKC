import { normalizeTaHandicapSeconds } from '@/lib/ta/battle-royale';
import type { TaRoundResult } from '@/lib/ta/phase-api-types';

function isFiniteNonNegative(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

export function normalizeTaRoundResult(value: unknown): TaRoundResult | null {
  if (!value || typeof value !== 'object') return null;
  const input = value as Record<string, unknown>;
  if (typeof input.playerId !== 'string' || !isFiniteNonNegative(input.timeMs)) return null;
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
