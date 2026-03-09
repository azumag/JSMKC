/**
 * Score Validation Utilities for BM, MR, and GP Matches
 *
 * This module provides validation logic for all three 2P competition modes:
 *
 * - BM (Battle Mode): Players pop each other's balloons (best-of-5, first to 3).
 *   Scores are 0-5 (balloons remaining/popped); ties are not allowed.
 *
 * - MR (Match Race): Players race head-to-head (best-of-5, first to 3 wins).
 *   Scores represent race wins, valid range 0-3; a player cannot win more than
 *   3 races. Ties (e.g., 2-2) are permitted; match result is determined by
 *   who first reaches 3 wins.
 *
 * - GP (Grand Prix): 4-race cup match with driver points (1st=9, 2nd=6, 3rd=3, 4th=1).
 *   Race finishing positions must be in the range 1-4; other positions earn 0 points
 *   but are rejected to prevent accidental null/undefined entries.
 *
 * Score constants for BM are defined in constants.ts.
 * MR and GP bounds are defined as module constants here.
 */

import { MIN_BATTLE_SCORE, MAX_BATTLE_SCORE } from './constants';

/** MR: best-of-5 match race. Maximum race wins per match = 3 (first to win 3). */
export const MAX_RACE_WIN_SCORE = 3;

/** GP: SMK finishes positions are 1-4 (two human players among CPU racers). */
export const MIN_GP_POSITION = 1;
export const MAX_GP_POSITION = 4;

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
 * Validate Match Race scores according to tournament rules.
 *
 * MR uses a best-of-5 format: the first player to win 3 races takes the match.
 * Each score must be in [0, MAX_RACE_WIN_SCORE], and neither player can exceed
 * 3 wins (which would be impossible in a best-of-5 that stops when someone wins).
 *
 * Ties (e.g. 2-2, 1-1) are permitted because a match may end in a draw.
 * Entries of (0, 0) are also permitted as the "not yet played" state.
 *
 * @param score1 - Races won by player 1
 * @param score2 - Races won by player 2
 * @returns Validation result; `isValid` is true if the entry is a legal MR score
 */
export function validateMatchRaceScores(score1: number, score2: number): ScoreValidationResult {
  // Both scores must be non-negative integers within the maximum win count
  if (
    !Number.isInteger(score1) || !Number.isInteger(score2) ||
    score1 < 0 || score1 > MAX_RACE_WIN_SCORE ||
    score2 < 0 || score2 > MAX_RACE_WIN_SCORE
  ) {
    return {
      isValid: false,
      error: `Match race score must be an integer between 0 and ${MAX_RACE_WIN_SCORE}`,
    };
  }
  return { isValid: true };
}

/**
 * Validate a GP race finishing position.
 *
 * In SMK 2-player Grand Prix mode, each race is contested against CPU opponents.
 * Human players can finish 1st through 4th; positions beyond 4th earn 0 driver
 * points and indicate a position input error (e.g., a player submitted position 5
 * or 0 by mistake). Rejecting out-of-range positions prevents silent data corruption.
 *
 * @param position - Race finishing position (1-based; 1=first, 4=fourth)
 * @returns Validation result; `isValid` is true for positions 1-4
 */
export function validateGPRacePosition(position: number): ScoreValidationResult {
  if (
    !Number.isInteger(position) ||
    position < MIN_GP_POSITION ||
    position > MAX_GP_POSITION
  ) {
    return {
      isValid: false,
      error: `GP race finishing position must be an integer between ${MIN_GP_POSITION} and ${MAX_GP_POSITION}`,
    };
  }
  return { isValid: true };
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
