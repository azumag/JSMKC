import { getTaPhase3Rules } from '@/lib/ta/battle-royale';
import type { Phase3RulesDto, TaMode } from '@/lib/ta/phase-api-types';

export function buildPhase3RulesDto(battleRoyaleMode: boolean): {
  taMode: TaMode;
  taBattleRoyaleMode: boolean;
  phase3Rules: Phase3RulesDto;
} {
  const rules = getTaPhase3Rules(battleRoyaleMode);
  return {
    taMode: battleRoyaleMode ? 'battle_royale' : 'standard',
    taBattleRoyaleMode: battleRoyaleMode,
    phase3Rules: {
      initialLives: rules.initialLives,
      lifeResetThresholds: [...rules.lifeResetThresholds],
      survivorsNeeded: rules.survivorsNeeded,
      handicapEnabled: rules.handicapEnabled,
      retryAppliesHandicap: rules.retryAppliesHandicap,
    },
  };
}
