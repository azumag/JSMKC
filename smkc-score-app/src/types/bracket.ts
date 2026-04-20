/**
 * Double Elimination Bracket Type Definitions
 *
 * Defines the data structures that describe an 8-player double elimination
 * tournament bracket. Used by BM (Battle Mode), MR (Match Race), and
 * GP (Grand Prix) finals for both bracket generation and display.
 *
 * The bracket consists of a winners side, a losers side, and a grand
 * final. Each BracketMatch carries routing information (winnerGoesTo,
 * loserGoesTo) that the generation logic uses to wire matches together,
 * while the UI reads seed/position fields for rendering.
 *
 * Usage:
 *   import type { BracketMatch, BracketRound } from '@/types/bracket';
 */

/** Bracket type for double elimination tournament */
export type BracketType = "winners" | "losers" | "grand_final";

/** All possible round identifiers in a double elimination bracket */
export type BracketRound =
  | "playoff_r1"      // Pre-Bracket Playoff Round 1 — Top 24 → Top 16 barrage (4 matches)
  | "playoff_r2"      // Pre-Bracket Playoff Round 2 — decider producing 4 Upper-Bracket entrants (4 matches)
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
  /**
   * For playoff matches only: the Upper-Bracket seed (1-16) the winner receives
   * when entering the 16-player double-elimination bracket. Only set on final
   * playoff round matches (playoff_r2) whose winners advance to Upper Bracket.
   */
  advancesToUpperSeed?: number;
}
