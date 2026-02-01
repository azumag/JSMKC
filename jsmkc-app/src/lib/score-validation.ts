/**
 * Score Validation Utilities for Battle Mode Matches
 *
 * This module provides validation logic specific to Battle Mode (BM) scoring.
 * In SMK Battle Mode, two players pop each other's balloons.
 * Each player starts with 3 balloons, and scores represent balloons popped
 * (or remaining). Ties are not allowed because every battle has a definitive
 * winner -- one player always loses all balloons first.
 *
 * Score constraints are defined in constants.ts:
 *   MIN_BATTLE_SCORE = 0  (all balloons popped)
 *   MAX_BATTLE_SCORE = 5  (BM rounds are best-of-5, first to 3 wins)
 *
 * These utilities are consumed by the BM match API routes to ensure
 * that submitted scores are within valid ranges and represent a valid outcome.
 */

import { MIN_BATTLE_SCORE, MAX_BATTLE_SCORE } from './constants';

/**
 * Result of a score validation check.
 * When `isValid` is false, `error` contains a human-readable description
 * of what failed, suitable for returning in an API error response.
 */
export interface ScoreValidationResult {
  isValid: boolean;
  error?: string;
}

/**
 * Validate battle mode scores according to the tournament rules.
 *
 * Two checks are performed:
 * 1. Range check: Both scores must fall within [MIN_BATTLE_SCORE, MAX_BATTLE_SCORE].
 *    This prevents out-of-bounds values that would be nonsensical (e.g., negative
 *    balloon counts or scores exceeding the best-of-5 maximum).
 * 2. Tie check: Scores must differ. Battle Mode always produces a winner because
 *    one player's balloons are fully depleted before the other's. A tie would
 *    indicate a data entry error.
 *
 * @param score1 - Score for player 1 (number of rounds won or balloons remaining)
 * @param score2 - Score for player 2
 * @returns Validation result; `isValid` is true if both checks pass
 */
export function validateBattleModeScores(score1: number, score2: number): ScoreValidationResult {
  // Range validation: ensure both scores fall within the acceptable bounds
  // defined by the tournament constants. This guards against malformed input.
  if (score1 < MIN_BATTLE_SCORE || score1 > MAX_BATTLE_SCORE ||
      score2 < MIN_BATTLE_SCORE || score2 > MAX_BATTLE_SCORE) {
    return {
      isValid: false,
      error: `Score must be between ${MIN_BATTLE_SCORE} and ${MAX_BATTLE_SCORE}`,
    };
  }

  // Tie check: Battle Mode does not permit draws. Using Math.abs with a
  // threshold of 1 ensures integer equality is properly detected, while
  // also being robust against floating point comparison if scores were
  // ever inadvertently represented as non-integers.
  if (Math.abs(score1 - score2) < 1) {
    return {
      isValid: false,
      error: "Scores must be different",
    };
  }

  return { isValid: true };
}

/**
 * Determine whether player 1 wins based on score comparison.
 *
 * In Battle Mode, the player with the higher score (more rounds won
 * or more balloons remaining) is the winner.
 *
 * @param score1 - Score for player 1
 * @param score2 - Score for player 2
 * @returns True if player 1's score is strictly greater than player 2's
 */
export function isPlayer1Win(score1: number, score2: number): boolean {
  return score1 > score2;
}

/**
 * Calculate the full match result including winner designation and
 * individual result labels for both players.
 *
 * Returns a structured object that can be directly used to update
 * match records in the database. The `winner` field is 1 or 2
 * (corresponding to player position), or null in the edge case of a tie.
 *
 * Note: Although ties should not occur in Battle Mode (validated upstream),
 * the tie case is handled defensively to ensure robustness if this
 * function is called without prior validation.
 *
 * @param score1 - Score for player 1
 * @param score2 - Score for player 2
 * @returns Object with `winner` (1, 2, or null), `result1`, and `result2`
 */
export function calculateMatchResult(score1: number, score2: number) {
  if (isPlayer1Win(score1, score2)) {
    return { winner: 1, result1: "win" as const, result2: "loss" as const };
  } else if (score2 > score1) {
    return { winner: 2, result1: "loss" as const, result2: "win" as const };
  } else {
    // Defensive tie handling: should never occur in BM after proper validation,
    // but included for safety and potential reuse in other modes
    return { winner: null, result1: "tie" as const, result2: "tie" as const };
  }
}
