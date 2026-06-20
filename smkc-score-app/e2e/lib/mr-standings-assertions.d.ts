export interface MrStandingEntry {
  playerId: string;
  matchesPlayed: number;
  wins: number;
  ties: number;
  losses: number;
  points: number;
  score: number;
}

export interface MrStandingStats {
  matchesPlayed: number;
  wins: number;
  ties: number;
  losses: number;
  points: number;
  score: number;
}

export function normalizeMrStandingsPayload(payload: unknown): MrStandingEntry[];
export function assertMrStandingStats(
  payload: unknown,
  playerId: string,
  expected: MrStandingStats,
): MrStandingEntry;
