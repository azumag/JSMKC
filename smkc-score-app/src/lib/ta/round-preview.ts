import { RETRY_PENALTY_MS } from '@/lib/constants';
import { applyTaHandicap, normalizeTaHandicapSeconds, type TaHandicapSeconds } from '@/lib/ta/battle-royale';
import type { TaMode } from '@/lib/ta/phase-api-types';

export interface TaRoundPreviewEntry {
  playerId: string;
  playerName: string;
  taHandicapSeconds: number;
  lives?: number;
}

export interface TaRoundPreviewRow {
  playerId: string;
  playerName: string;
  rawTimeMs: number;
  handicapSeconds: TaHandicapSeconds;
  adjustedTimeMs: number;
  isRetry: boolean;
  projectedRank: number;
  projectedLifeLoss: boolean;
  boundaryTie: boolean;
}

export function buildTaRoundPreview(
  entries: readonly TaRoundPreviewEntry[],
  rawTimesByPlayer: Readonly<Record<string, number>>,
  retryFlags: Readonly<Record<string, boolean>>,
  mode: TaMode,
): TaRoundPreviewRow[] {
  if (new Set(entries.map((entry) => entry.playerId)).size !== entries.length) {
    throw new Error('Duplicate player IDs are not allowed');
  }
  const base = entries.map((entry) => {
    const rawInput = rawTimesByPlayer[entry.playerId];
    if (!Number.isFinite(rawInput) || rawInput < 0) {
      throw new Error(`Invalid time for player ${entry.playerId}`);
    }
    const isRetry = retryFlags[entry.playerId] === true;
    const rawTimeMs = isRetry ? RETRY_PENALTY_MS : rawInput;
    const configuredHandicap = normalizeTaHandicapSeconds(entry.taHandicapSeconds);
    const handicapSeconds = mode === 'battle_royale' && !isRetry ? configuredHandicap : 0;
    const adjustedTimeMs = handicapSeconds === 0 ? rawTimeMs : applyTaHandicap(rawTimeMs, handicapSeconds);
    return { entry, rawTimeMs, handicapSeconds, adjustedTimeMs, isRetry };
  });
  base.sort((a, b) => a.adjustedTimeMs - b.adjustedTimeMs || a.entry.playerId.localeCompare(b.entry.playerId));
  const halfwayPoint = Math.ceil(base.length / 2);
  const boundaryTime =
    base.length > 1 &&
    halfwayPoint < base.length &&
    base[halfwayPoint - 1].adjustedTimeMs === base[halfwayPoint].adjustedTimeMs
      ? base[halfwayPoint].adjustedTimeMs
      : null;
  return base.map((row, index) => ({
    playerId: row.entry.playerId,
    playerName: row.entry.playerName,
    rawTimeMs: row.rawTimeMs,
    handicapSeconds: row.handicapSeconds,
    adjustedTimeMs: row.adjustedTimeMs,
    isRetry: row.isRetry,
    projectedRank: index + 1,
    projectedLifeLoss: index >= halfwayPoint,
    boundaryTie: boundaryTime !== null && row.adjustedTimeMs === boundaryTime,
  }));
}
