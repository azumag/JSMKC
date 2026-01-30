// Double Elimination Bracket Type Definitions
// Used by BM, MR, and GP finals bracket generation and display

/** Bracket type for double elimination tournament */
export type BracketType = "winners" | "losers" | "grand_final";

/** All possible round identifiers in a double elimination bracket */
export type BracketRound =
  | "winners_qf"      // Winners Bracket Quarter-Finals (4 matches)
  | "winners_sf"      // Winners Bracket Semi-Finals (2 matches)
  | "winners_final"   // Winners Bracket Final (1 match)
  | "losers_r1"       // Losers Bracket Round 1 (2 matches)
  | "losers_r2"       // Losers Bracket Round 2 (2 matches)
  | "losers_r3"       // Losers Bracket Round 3 (2 matches)
  | "losers_sf"       // Losers Bracket Semi-Final (1 match)
  | "losers_final"    // Losers Bracket Final (1 match)
  | "grand_final";    // Grand Final (1 match)

/** Structure of a single bracket match with routing information */
export interface BracketMatch {
  /** Sequential match number (1-based) */
  matchNumber: number;
  /** Which round this match belongs to (string for flexibility) */
  round: string;
  /** Whether this is winners, losers, or grand final bracket */
  bracket: BracketType;
  /** Seed number for player 1 (only set for initial QF matches) */
  player1Seed?: number;
  /** Seed number for player 2 (only set for initial QF matches) */
  player2Seed?: number;
  /** Match number the winner advances to */
  winnerGoesTo?: number;
  /** Match number the loser drops to (null in losers bracket final rounds) */
  loserGoesTo?: number;
  /** Display position within the receiving match (1 or 2) */
  position?: 1 | 2;
}
