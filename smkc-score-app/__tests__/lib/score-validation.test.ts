/**
 * @module __tests__/lib/score-validation.test.ts
 *
 * Test suite for the score validation utilities (score-validation.ts).
 *
 * Covers the following functionality:
 * - validateBattleModeScores(): Validates BM scores according to 4-round match rules.
 *   Checks: integer type, range [0, MAX_BATTLE_SCORE=4], sum === 4, no tie.
 *   - Tests valid combos (1-3, 3-1, 0-4, 4-0), invalid sums, ties, out-of-range,
 *     non-integer, null, and undefined inputs.
 * - isPlayer1Win(): Determines whether player 1 won based on score comparison.
 *   - Tests normal wins, losses, ties, and edge cases with null/undefined/negative
 *     and decimal values.
 * - calculateMatchResult(): Returns the full match result object including
 *   the winner (1, 2, or null for tie) and result strings ('win', 'loss', 'tie')
 *   for each player.
 *   - Tests all combinations of win/loss/tie outcomes and edge cases.
 * - Score validation edge cases: very small decimal differences, boundary values,
 *   and large decimal differences.
 */
// __tests__/lib/score-validation.test.ts
import { describe, it, expect } from '@jest/globals';
import {
  validateBattleModeScores,
  isPlayer1Win,
  calculateMatchResult,
  validateMatchRaceScores,
  validateBattleModeFinalScores,
  validateGPRacePosition,
  MAX_RACE_WIN_SCORE,
  MIN_GP_POSITION,
  MAX_GP_POSITION,
} from '@/lib/score-validation';
import { MIN_BATTLE_SCORE, MAX_BATTLE_SCORE, TOTAL_BM_ROUNDS, BM_FINALS_TARGET_WINS } from '@/lib/constants';

describe('Score Validation Utilities', () => {
  describe('validateBattleModeScores', () => {
    // === Valid cases: integer, in range [0,4], sum === 4, not tied ===

    it('should accept 3-1 (player 1 wins with 3 rounds)', () => {
      const result = validateBattleModeScores(3, 1);
      expect(result.isValid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should accept 1-3 (player 2 wins with 3 rounds)', () => {
      const result = validateBattleModeScores(1, 3);
      expect(result.isValid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should accept 4-0 (player 1 wins all rounds)', () => {
      const result = validateBattleModeScores(MAX_BATTLE_SCORE, MIN_BATTLE_SCORE);
      expect(result.isValid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should accept 0-4 (player 2 wins all rounds)', () => {
      const result = validateBattleModeScores(MIN_BATTLE_SCORE, MAX_BATTLE_SCORE);
      expect(result.isValid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    // === Integer check ===

    it('should reject decimal scores (non-integer values)', () => {
      const result = validateBattleModeScores(1.5, 2.5);
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Battle Mode scores must be integers');
    });

    it('should reject null score for player 1', () => {
      const result = validateBattleModeScores(null as unknown as number, 3);
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Battle Mode scores must be integers');
    });

    it('should reject null score for player 2', () => {
      const result = validateBattleModeScores(3, null as unknown as number);
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Battle Mode scores must be integers');
    });

    it('should reject undefined score for player 1', () => {
      const result = validateBattleModeScores(undefined as unknown as number, 3);
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Battle Mode scores must be integers');
    });

    it('should reject undefined score for player 2', () => {
      const result = validateBattleModeScores(3, undefined as unknown as number);
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Battle Mode scores must be integers');
    });

    // === Range check ===

    it('should reject score below minimum for player 1', () => {
      const result = validateBattleModeScores(MIN_BATTLE_SCORE - 1, 3);
      expect(result.isValid).toBe(false);
      expect(result.error).toBe(`Score must be between ${MIN_BATTLE_SCORE} and ${MAX_BATTLE_SCORE}`);
    });

    it('should reject score below minimum for player 2', () => {
      const result = validateBattleModeScores(3, MIN_BATTLE_SCORE - 1);
      expect(result.isValid).toBe(false);
      expect(result.error).toBe(`Score must be between ${MIN_BATTLE_SCORE} and ${MAX_BATTLE_SCORE}`);
    });

    it('should reject score above maximum for player 1', () => {
      const result = validateBattleModeScores(MAX_BATTLE_SCORE + 1, 0);
      expect(result.isValid).toBe(false);
      expect(result.error).toBe(`Score must be between ${MIN_BATTLE_SCORE} and ${MAX_BATTLE_SCORE}`);
    });

    it('should reject score above maximum for player 2', () => {
      const result = validateBattleModeScores(0, MAX_BATTLE_SCORE + 1);
      expect(result.isValid).toBe(false);
      expect(result.error).toBe(`Score must be between ${MIN_BATTLE_SCORE} and ${MAX_BATTLE_SCORE}`);
    });

    it('should handle both scores out of range above maximum', () => {
      const result = validateBattleModeScores(10, 20);
      expect(result.isValid).toBe(false);
      expect(result.error).toBe(`Score must be between ${MIN_BATTLE_SCORE} and ${MAX_BATTLE_SCORE}`);
    });

    // === Sum check: score1 + score2 must equal TOTAL_BM_ROUNDS ===

    it('should reject scores that do not sum to TOTAL_BM_ROUNDS (2+3=5)', () => {
      const result = validateBattleModeScores(2, 3);
      expect(result.isValid).toBe(false);
      expect(result.error).toBe(
        `Scores must total exactly ${TOTAL_BM_ROUNDS} rounds (got 5)`
      );
    });

    it('should reject scores that do not sum to TOTAL_BM_ROUNDS (1+1=2)', () => {
      const result = validateBattleModeScores(1, 1);
      expect(result.isValid).toBe(false);
      expect(result.error).toBe(
        `Scores must total exactly ${TOTAL_BM_ROUNDS} rounds (got 2)`
      );
    });

    it('should reject scores that do not sum to TOTAL_BM_ROUNDS (0+0=0)', () => {
      const result = validateBattleModeScores(0, 0);
      expect(result.isValid).toBe(false);
      expect(result.error).toBe(
        `Scores must total exactly ${TOTAL_BM_ROUNDS} rounds (got 0)`
      );
    });

    // === Tie check: 2-2 is the only in-range, valid-sum pair that is a tie ===

    it('should reject tie (2-2 sums to 4 but is a draw)', () => {
      const result = validateBattleModeScores(2, 2);
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Scores must be different');
    });
  });

  describe('isPlayer1Win', () => {
    it('should return true when player 1 wins', () => {
      expect(isPlayer1Win(3, 2)).toBe(true);
      expect(isPlayer1Win(MAX_BATTLE_SCORE, MIN_BATTLE_SCORE)).toBe(true);
      expect(isPlayer1Win(1.5, 1.4)).toBe(true);
    });

    it('should return false when player 2 wins', () => {
      expect(isPlayer1Win(2, 3)).toBe(false);
      expect(isPlayer1Win(MIN_BATTLE_SCORE, MAX_BATTLE_SCORE)).toBe(false);
      expect(isPlayer1Win(1.4, 1.5)).toBe(false);
    });

    it('should return false when there is a tie', () => {
      expect(isPlayer1Win(2, 2)).toBe(false);
      expect(isPlayer1Win(MIN_BATTLE_SCORE, MIN_BATTLE_SCORE)).toBe(false);
      expect(isPlayer1Win(MAX_BATTLE_SCORE, MAX_BATTLE_SCORE)).toBe(false);
    });

    it('should handle decimal values correctly', () => {
      expect(isPlayer1Win(2.9, 2.8)).toBe(true);
      expect(isPlayer1Win(2.8, 2.9)).toBe(false);
    });

    it('should handle null player 1 score', () => {
      expect(isPlayer1Win(null as unknown as number, 2)).toBe(false);
    });

    it('should handle null player 2 score', () => {
      // In JavaScript, 2 > null is true (because null is coerced to 0)
      // This test documents the actual behavior
      expect(isPlayer1Win(2, null as unknown as number)).toBe(true);
    });

    it('should handle both null scores', () => {
      expect(isPlayer1Win(null as unknown as number, null as unknown as number)).toBe(false);
    });

    it('should handle undefined scores', () => {
      expect(isPlayer1Win(undefined as unknown as number, 2)).toBe(false);
      expect(isPlayer1Win(2, undefined as unknown as number)).toBe(false);
    });

    it('should handle negative scores', () => {
      expect(isPlayer1Win(-1, -2)).toBe(true);
      expect(isPlayer1Win(-2, -1)).toBe(false);
    });
  });

  describe('calculateMatchResult', () => {
    it('should return player 1 win result when score1 > score2', () => {
      const result = calculateMatchResult(3, 2);
      expect(result.winner).toBe(1);
      expect(result.result1).toBe('win');
      expect(result.result2).toBe('loss');
    });

    it('should return player 2 win result when score2 > score1', () => {
      const result = calculateMatchResult(2, 3);
      expect(result.winner).toBe(2);
      expect(result.result1).toBe('loss');
      expect(result.result2).toBe('win');
    });

    it('should return tie result when scores are equal', () => {
      const result = calculateMatchResult(2, 2);
      expect(result.winner).toBe(null);
      expect(result.result1).toBe('tie');
      expect(result.result2).toBe('tie');
    });

    it('should handle player 1 win at maximum difference', () => {
      const result = calculateMatchResult(MAX_BATTLE_SCORE, MIN_BATTLE_SCORE);
      expect(result.winner).toBe(1);
      expect(result.result1).toBe('win');
      expect(result.result2).toBe('loss');
    });

    it('should handle player 2 win at maximum difference', () => {
      const result = calculateMatchResult(MIN_BATTLE_SCORE, MAX_BATTLE_SCORE);
      expect(result.winner).toBe(2);
      expect(result.result1).toBe('loss');
      expect(result.result2).toBe('win');
    });

    it('should handle decimal scores for player 1 win', () => {
      const result = calculateMatchResult(2.5, 2.3);
      expect(result.winner).toBe(1);
      expect(result.result1).toBe('win');
      expect(result.result2).toBe('loss');
    });

    it('should handle decimal scores for player 2 win', () => {
      const result = calculateMatchResult(2.3, 2.5);
      expect(result.winner).toBe(2);
      expect(result.result1).toBe('loss');
      expect(result.result2).toBe('win');
    });

    it('should handle decimal scores for tie', () => {
      const result = calculateMatchResult(2.5, 2.5);
      expect(result.winner).toBe(null);
      expect(result.result1).toBe('tie');
      expect(result.result2).toBe('tie');
    });

    it('should handle null scores as tie', () => {
      const result = calculateMatchResult(null as unknown as number, null as unknown as number);
      expect(result.winner).toBe(null);
      expect(result.result1).toBe('tie');
      expect(result.result2).toBe('tie');
    });

    it('should handle undefined scores as tie', () => {
      const result = calculateMatchResult(undefined as unknown as number, undefined as unknown as number);
      expect(result.winner).toBe(null);
      expect(result.result1).toBe('tie');
      expect(result.result2).toBe('tie');
    });

    it('should handle one null score (player 1) as tie in validation logic', () => {
      const result = calculateMatchResult(null as unknown as number, 2);
      // In JavaScript, null is coerced to 0 in comparisons: 0 < 2, so player 2 wins
      // This test documents the actual behavior of the implementation
      expect(result.winner).toBe(2);
      expect(result.result1).toBe('loss');
      expect(result.result2).toBe('win');
    });

    it('should handle negative scores correctly', () => {
      const result1 = calculateMatchResult(-1, -2);
      expect(result1.winner).toBe(1);
      expect(result1.result1).toBe('win');
      expect(result1.result2).toBe('loss');

      const result2 = calculateMatchResult(-2, -1);
      expect(result2.winner).toBe(2);
      expect(result2.result1).toBe('loss');
      expect(result2.result2).toBe('win');
    });

    it('should return correct result types (const assertions)', () => {
      const result = calculateMatchResult(3, 2);
      expect(result.result1).toBe('win');
      expect(result.result2).toBe('loss');
      expect(typeof result.result1).toBe('string');
      expect(typeof result.result2).toBe('string');
    });
  });

  describe('validateBattleModeFinalScores', () => {
    // BM finals: best-of-9, first to BM_FINALS_TARGET_WINS (5) wins

    it('should accept valid finals score 5-2', () => {
      expect(validateBattleModeFinalScores(5, 2).isValid).toBe(true);
    });

    it('should accept valid finals score 5-0', () => {
      expect(validateBattleModeFinalScores(5, 0).isValid).toBe(true);
    });

    it('should accept valid finals score 0-5 (player 2 wins)', () => {
      expect(validateBattleModeFinalScores(0, 5).isValid).toBe(true);
    });

    it('should accept valid finals score 5-4', () => {
      expect(validateBattleModeFinalScores(5, 4).isValid).toBe(true);
    });

    it('should accept valid finals score 4-5 (player 2 wins)', () => {
      expect(validateBattleModeFinalScores(4, 5).isValid).toBe(true);
    });

    it('should reject score where neither player reached target', () => {
      const result = validateBattleModeFinalScores(4, 3);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain(String(BM_FINALS_TARGET_WINS));
    });

    it('should reject both players at target wins', () => {
      const result = validateBattleModeFinalScores(5, 5);
      expect(result.isValid).toBe(false);
      expect(result.error).toBe("Both players cannot have the same winning score");
    });

    it('should reject score exceeding target', () => {
      const result = validateBattleModeFinalScores(6, 2);
      expect(result.isValid).toBe(false);
    });

    it('should reject negative scores', () => {
      expect(validateBattleModeFinalScores(-1, 5).isValid).toBe(false);
    });

    it('should reject non-integer scores', () => {
      expect(validateBattleModeFinalScores(5.5, 2).isValid).toBe(false);
    });
  });

  describe('validateMatchRaceScores', () => {
    // MR qualification: fixed 4-course format (§6.3, §10.5).
    // All 4 courses are always played; score1 + score2 must equal 4.
    it('should accept all valid 4-course outcomes', () => {
      expect(validateMatchRaceScores(4, 0).isValid).toBe(true); // clean sweep
      expect(validateMatchRaceScores(3, 1).isValid).toBe(true); // 3-1 win
      expect(validateMatchRaceScores(2, 2).isValid).toBe(true); // draw
      expect(validateMatchRaceScores(1, 3).isValid).toBe(true); // 1-3 loss
      expect(validateMatchRaceScores(0, 4).isValid).toBe(true); // 0-4 loss
    });

    it('should accept boundary values (4-0 and 0-4)', () => {
      expect(validateMatchRaceScores(MAX_RACE_WIN_SCORE, 0).isValid).toBe(true);
      expect(validateMatchRaceScores(0, MAX_RACE_WIN_SCORE).isValid).toBe(true);
    });

    it('should reject scores above MAX_RACE_WIN_SCORE', () => {
      const result = validateMatchRaceScores(MAX_RACE_WIN_SCORE + 1, 0);
      expect(result.isValid).toBe(false);
    });

    it('should reject scores that do not sum to 4 (incomplete match entry)', () => {
      // 0-0 means no races entered
      expect(validateMatchRaceScores(0, 0).isValid).toBe(false);
      // 3-0 would be valid range but sum ≠ 4 (old best-of-5 partial)
      expect(validateMatchRaceScores(3, 0).isValid).toBe(false);
      expect(validateMatchRaceScores(0, 3).isValid).toBe(false);
    });

    it('should reject negative scores', () => {
      const result = validateMatchRaceScores(-1, 2);
      expect(result.isValid).toBe(false);
    });

    it('should reject non-integer scores', () => {
      expect(validateMatchRaceScores(1.5, 2).isValid).toBe(false);
      expect(validateMatchRaceScores(2, 0.5).isValid).toBe(false);
    });
  });

  describe('validateGPRacePosition', () => {
    it('should accept valid positions 1-4', () => {
      expect(validateGPRacePosition(MIN_GP_POSITION).isValid).toBe(true);
      expect(validateGPRacePosition(2).isValid).toBe(true);
      expect(validateGPRacePosition(3).isValid).toBe(true);
      expect(validateGPRacePosition(MAX_GP_POSITION).isValid).toBe(true);
    });

    it('should accept position 0 as game over (§7.2)', () => {
      const result = validateGPRacePosition(0);
      expect(result.isValid).toBe(true);
    });

    it('should reject position 5 and above', () => {
      expect(validateGPRacePosition(5).isValid).toBe(false);
      expect(validateGPRacePosition(MAX_GP_POSITION + 1).isValid).toBe(false);
    });

    it('should reject negative positions', () => {
      expect(validateGPRacePosition(-1).isValid).toBe(false);
    });

    it('should reject non-integer positions', () => {
      expect(validateGPRacePosition(1.5).isValid).toBe(false);
      expect(validateGPRacePosition(2.9).isValid).toBe(false);
    });
  });

  describe('Score Validation Edge Cases', () => {
    it('should handle very small decimal differences', () => {
      const result = calculateMatchResult(2.0001, 2.0000);
      expect(result.winner).toBe(1);
    });

    it('should handle large decimal differences', () => {
      const result = calculateMatchResult(2.9, 2.1);
      expect(result.winner).toBe(1);
    });

    it('should validate that boundary values work correctly', () => {
      // 0-4: player 2 wins all rounds (minimum score for p1, maximum for p2)
      const result1 = validateBattleModeScores(MIN_BATTLE_SCORE, MAX_BATTLE_SCORE);
      expect(result1.isValid).toBe(true);

      // 4-0: player 1 wins all rounds (maximum score for p1, minimum for p2)
      const result2 = validateBattleModeScores(MAX_BATTLE_SCORE, MIN_BATTLE_SCORE);
      expect(result2.isValid).toBe(true);
    });
  });
});
