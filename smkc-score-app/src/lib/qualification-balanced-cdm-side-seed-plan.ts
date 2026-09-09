import { buildBalancedCdmSideOverridePlan } from '@/lib/qualification-schedule-comparison';

export interface BalancedCdmSideSeedOverride {
  day: number;
  cdmPlayer1Seed: number;
  cdmPlayer2Seed: number;
  balancedPlayer1Seed: number;
  balancedPlayer2Seed: number;
}

/**
 * Project the balanced-side CDM override plan onto stable seed positions.
 *
 * This is a read-only decision aid for #3054. It does not persist anything or
 * change the qualification scheduling policy. null means the player count has
 * no compatible CDM fixture (or the underlying pair sets are incompatible).
 */
export function buildBalancedCdmSideSeedOverridePlan(playerCount: number): BalancedCdmSideSeedOverride[] | null {
  if (!Number.isInteger(playerCount) || playerCount <= 0) return null;

  const playerIds = Array.from({ length: playerCount }, (_, index) => `P${index + 1}`);
  const seedByPlayerId = new Map(playerIds.map((playerId, index) => [playerId, index + 1] as const));
  const overrides = buildBalancedCdmSideOverridePlan(playerIds);
  if (overrides === null) return null;

  const seedPlan: BalancedCdmSideSeedOverride[] = [];
  for (const override of overrides) {
    const cdmPlayer1Seed = seedByPlayerId.get(override.cdmPlayer1Id);
    const cdmPlayer2Seed = seedByPlayerId.get(override.cdmPlayer2Id);
    const balancedPlayer1Seed = seedByPlayerId.get(override.balancedPlayer1Id);
    const balancedPlayer2Seed = seedByPlayerId.get(override.balancedPlayer2Id);

    if (
      cdmPlayer1Seed === undefined ||
      cdmPlayer2Seed === undefined ||
      balancedPlayer1Seed === undefined ||
      balancedPlayer2Seed === undefined
    ) {
      return null;
    }

    seedPlan.push({
      day: override.day,
      cdmPlayer1Seed,
      cdmPlayer2Seed,
      balancedPlayer1Seed,
      balancedPlayer2Seed,
    });
  }

  return seedPlan;
}
