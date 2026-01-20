export type BracketType = "winners" | "losers" | "grand_final";

export type BracketRound =
  | "winners_qf"
  | "winners_sf"
  | "winners_final"
  | "losers_r1"
  | "losers_r2"
  | "losers_r3"
  | "losers_sf"
  | "losers_final"
  | "grand_final";

export interface BracketMatch {
  matchNumber: number;
  round: string;
  bracket: BracketType;
  player1Seed?: number;
  player2Seed?: number;
  winnerGoesTo?: number;
  loserGoesTo?: number;
  position?: 1 | 2;
}
