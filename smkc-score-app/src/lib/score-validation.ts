/**
 * Score Validation Utilities for BM, MR, and GP Matches
 *
 * This module provides validation logic for all three 2P competition modes:
 *
 * - BM (Battle Mode): Fixed 4-round match format (score1 + score2 must equal 4).
 *   Scores represent rounds won (0–4); a player wins by taking 3 or more rounds.
 *   Ties (2-2) indicate a data entry error and are not allowed.
 *
 * - MR (Match Race): Fixed 4-course qualification format (§6.3, §10.5).
 *   All 4 pre-assigned courses are always played; score1 + score2 must equal 4.
 *   Scores represent race wins (0–4); a 2-2 draw is a valid result.
 *
 * - GP (Grand Prix): 4-race cup match with driver points (1st=9, 2nd=6, 3rd=3, 4th=1).
 *   Race finishing positions must be in the range 1-4; other positions earn 0 points
 *   but are rejected to prevent accidental null/undefined entries.
 *
 * Score constants for BM are defined in constants.ts.
 * MR and GP bounds are defined as module constants here.
 */

import { MIN_BATTLE_SCORE, MAX_BATTLE_SCORE, TOTAL_BM_ROUNDS, TOTAL_MR_RACES } from './constants';

/**
 * MR: 4-course qualification match format (§6.3, §10.5).
 * All 4 courses are always played; the winner is whoever wins more races.
 * A 2-2 result is a valid draw. Maximum wins = all 4 races.
 */
export const MAX_RACE_WIN_SCORE = TOTAL_MR_RACES;

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
 * BM matches consist of exactly TOTAL_BM_ROUNDS (4) rounds. Four checks are performed
 * in priority order:
 * 1. Integer check: Both scores must be whole numbers. Non-integers (floats, null,
 *    undefined) are rejected because rounds won is always a discrete count.
 * 2. Range check: Both scores must fall within [MIN_BATTLE_SCORE, MAX_BATTLE_SCORE].
 *    Since each player can win at most all 4 rounds, MAX_BATTLE_SCORE = 4.
 * 3. Sum check: score1 + score2 must equal TOTAL_BM_ROUNDS (4). This enforces that
 *    exactly 4 rounds were played and recorded. A sum ≠ 4 indicates missing or extra
 *    rounds in the entry, which would silently corrupt match results.
 * 4. Tie check: Scores must differ (i.e., reject 2-2). Battle Mode always produces a
 *    winner; a tie would indicate a data entry error that requires a rematch.
 *
 * @param score1 - Rounds won by player 1 (integer 0–4)
 * @param score2 - Rounds won by player 2 (integer 0–4)
 * @returns Validation result; `isValid` is true if all four checks pass
 */
export function validateBattleModeScores(score1: number, score2: number): ScoreValidationResult {
  // Integer check: round counts are discrete values. Number.isInteger rejects
  // floats, null, undefined, and NaN without requiring explicit type guards.
  if (!Number.isInteger(score1) || !Number.isInteger(score2)) {
    return {
      isValid: false,
      error: "Battle Mode scores must be integers",
    };
  }

  // Range validation: ensure both scores fall within [0, MAX_BATTLE_SCORE].
  if (score1 < MIN_BATTLE_SCORE || score1 > MAX_BATTLE_SCORE ||
      score2 < MIN_BATTLE_SCORE || score2 > MAX_BATTLE_SCORE) {
    return {
      isValid: false,
      error: `Score must be between ${MIN_BATTLE_SCORE} and ${MAX_BATTLE_SCORE}`,
    };
  }

  // Sum check: BM matches are exactly TOTAL_BM_ROUNDS rounds. Without this check,
  // a score like 1-2 (sum = 3) passes range validation but is silently treated
  // as a tie by the match result calculation (which requires totalRounds === 4).
  if (score1 + score2 !== TOTAL_BM_ROUNDS) {
    return {
      isValid: false,
      error: `Scores must total exactly ${TOTAL_BM_ROUNDS} rounds (got ${score1 + score2})`,
    };
  }

  // Tie check: a 2-2 result requires a rematch and should not be recorded as-is.
  if (score1 === score2) {
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
 * MR qualification uses a fixed 4-course format (§6.3, §10.5): all 4 pre-assigned
 * courses are always played. Each score represents the number of races won (0–4),
 * and the two scores must sum to exactly TOTAL_MR_RACES (4).
 *
 * A 2-2 result is a valid draw; both players' qualification records receive a tie.
 * Scores that don't sum to 4 indicate incomplete or incorrectly entered data.
 *
 * @param score1 - Races won by player 1 (integer 0–4)
 * @param score2 - Races won by player 2 (integer 0–4)
 * @returns Validation result; `isValid` is true if the entry is a legal MR score
 */
export function validateMatchRaceScores(score1: number, score2: number): ScoreValidationResult {
  // Both scores must be non-negative integers within the possible range
  if (
    !Number.isInteger(score1) || !Number.isInteger(score2) ||
    score1 < 0 || score1 > TOTAL_MR_RACES ||
    score2 < 0 || score2 > TOTAL_MR_RACES
  ) {
    return {
      isValid: false,
      error: `Match race score must be an integer between 0 and ${TOTAL_MR_RACES}`,
    };
  }
  // Sum check: all 4 races must be accounted for. A sum ≠ 4 indicates missing
  // race results or a data entry error.
  if (score1 + score2 !== TOTAL_MR_RACES) {
    return {
      isValid: false,
      error: `Scores must total exactly ${TOTAL_MR_RACES} races (got ${score1 + score2})`,
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
