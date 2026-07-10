export const TA_HANDICAP_SECONDS = [0, -1, -3, -5] as const;
export type TaHandicapSeconds = (typeof TA_HANDICAP_SECONDS)[number];

export function isTaHandicapSeconds(value: unknown): value is TaHandicapSeconds {
  return typeof value === 'number' && TA_HANDICAP_SECONDS.includes(value as TaHandicapSeconds);
}

export function applyTaHandicap(timeMs: number, handicapSeconds: TaHandicapSeconds): number {
  return Math.max(0, timeMs + handicapSeconds * 1000);
}

export function getTaPhase3Rules(battleRoyaleMode: boolean) {
  return battleRoyaleMode
    ? { initialLives: 10, lifeResetThresholds: [] as readonly number[] }
    : { initialLives: 3, lifeResetThresholds: [8, 4, 2] as readonly number[] };
}
