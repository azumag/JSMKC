import { MIN_BATTLE_SCORE, MAX_BATTLE_SCORE } from './constants';

/**
 * Score validation utilities for battle mode matches
 */

export interface ScoreValidationResult {
  isValid: boolean;
  error?: string;
}

/**
 * Validate battle mode scores according to architecture specifications
 * @param score1 - Score for player 1
 * @param score2 - Score for player 2
 * @returns Validation result with error message if invalid
 */
export function validateBattleModeScores(score1: number, score2: number): ScoreValidationResult {
  // Validate score ranges using constants
  if (score1 < MIN_BATTLE_SCORE || score1 > MAX_BATTLE_SCORE || 
      score2 < MIN_BATTLE_SCORE || score2 > MAX_BATTLE_SCORE) {
    return {
      isValid: false,
      error: `Score must be between ${MIN_BATTLE_SCORE} and ${MAX_BATTLE_SCORE}`,
    };
  }

  // Validate that scores are different (no ties in battle mode)
  if (Math.abs(score1 - score2) < 1) {
    return {
      isValid: false,
      error: "Scores must be different",
    };
  }

  return { isValid: true };
}

/**
 * Check if a score represents a win for player 1
 * @param score1 - Score for player 1
 * @param score2 - Score for player 2
 * @returns True if player 1 wins
 */
export function isPlayer1Win(score1: number, score2: number): boolean {
  return score1 > score2;
}

/**
 * Calculate match result based on scores
 * @param score1 - Score for player 1
 * @param score2 - Score for player 2
 * @returns Match result object
 */
export function calculateMatchResult(score1: number, score2: number) {
  if (isPlayer1Win(score1, score2)) {
    return { winner: 1, result1: "win" as const, result2: "loss" as const };
  } else if (score2 > score1) {
    return { winner: 2, result1: "loss" as const, result2: "win" as const };
  } else {
    return { winner: null, result1: "tie" as const, result2: "tie" as const };
  }
}