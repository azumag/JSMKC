export { TA_BATTLE_ROYALE_ENTRY_CHUNK, TA_BATTLE_ROYALE_MAX_PLAYERS } from './battle-royale-constants';

export const TA_HANDICAP_SECONDS = [0, -1, -3, -5] as const;
export type TaHandicapSeconds = (typeof TA_HANDICAP_SECONDS)[number];

export interface Phase3Rules {
  initialLives: number;
  lifeResetThresholds: readonly number[];
  survivorsNeeded: number;
  handicapEnabled: boolean;
  retryAppliesHandicap: false;
}

export function isTaHandicapSeconds(value: unknown): value is TaHandicapSeconds {
  return typeof value === 'number' && TA_HANDICAP_SECONDS.includes(value as TaHandicapSeconds);
}

export function normalizeTaHandicapSeconds(value: unknown): TaHandicapSeconds {
  return isTaHandicapSeconds(value) ? value : 0;
}

export function applyTaHandicap(timeMs: number, handicapSeconds: TaHandicapSeconds): number {
  return Math.max(0, timeMs + handicapSeconds * 1000);
}

export function getTaPhase3Rules(battleRoyaleMode: boolean): Phase3Rules {
  return battleRoyaleMode
    ? {
        initialLives: 10,
        lifeResetThresholds: [],
        survivorsNeeded: 1,
        handicapEnabled: true,
        retryAppliesHandicap: false,
      }
    : {
        initialLives: 3,
        lifeResetThresholds: [8, 4, 2],
        survivorsNeeded: 1,
        handicapEnabled: false,
        retryAppliesHandicap: false,
      };
}
