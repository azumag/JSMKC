import { normalizeTaHandicapSeconds, type TaHandicapSeconds } from '@/lib/ta/battle-royale';

export const TA_HANDICAP_TIER_KEYS: Record<TaHandicapSeconds, string> = {
  0: 'taHandicap0',
  [-1]: 'taHandicapMinus1',
  [-3]: 'taHandicapMinus3',
  [-5]: 'taHandicapMinus5',
};

export function formatTaHandicapSeconds(value: unknown): string {
  const normalized = normalizeTaHandicapSeconds(value);
  return normalized === 0 ? '±0秒' : `${normalized}秒`;
}
