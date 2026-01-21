import { validateBattleModeScores, isPlayer1Win, calculateMatchResult } from '@/lib/score-validation';

describe('Score Validation Utilities', () => {
  describe('validateBattleModeScores', () => {
    it('should validate scores within the correct range', () => {
      const result = validateBattleModeScores(2, 3);
      expect(result.isValid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should reject scores below the minimum', () => {
      const result = validateBattleModeScores(-1, 2);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('between 0 and 5');
    });

    it('should reject scores above the maximum', () => {
      const result = validateBattleModeScores(6, 2);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('between 0 and 5');
    });

    it('should reject scores that are the same (no ties)', () => {
      const result = validateBattleModeScores(2, 2);
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Scores must be different');
    });

    it('should validate player 1 winning scores', () => {
      const result = validateBattleModeScores(3, 1);
      expect(result.isValid).toBe(true);
    });

    it('should validate player 2 winning scores', () => {
      const result = validateBattleModeScores(1, 3);
      expect(result.isValid).toBe(true);
    });

    it('should handle edge case: minimum valid score for player 1', () => {
      const result = validateBattleModeScores(0, 1);
      expect(result.isValid).toBe(true);
    });

    it('should handle edge case: minimum valid score for player 2', () => {
      const result = validateBattleModeScores(1, 0);
      expect(result.isValid).toBe(true);
    });

    it('should handle edge case: maximum valid score for player 1', () => {
      const result = validateBattleModeScores(5, 0);
      expect(result.isValid).toBe(true);
    });

    it('should handle edge case: maximum valid score for player 2', () => {
      const result = validateBattleModeScores(0, 5);
      expect(result.isValid).toBe(true);
    });

    it('should handle scores with difference of 1', () => {
      const result = validateBattleModeScores(3, 2);
      expect(result.isValid).toBe(true);
    });

    it('should handle scores with difference of 4', () => {
      const result = validateBattleModeScores(5, 1);
      expect(result.isValid).toBe(true);
    });
  });

  describe('isPlayer1Win', () => {
    it('should return true when player 1 has higher score', () => {
      expect(isPlayer1Win(75, 25)).toBe(true);
    });

    it('should return false when player 2 has higher score', () => {
      expect(isPlayer1Win(25, 75)).toBe(false);
    });

    it('should return false when scores are equal', () => {
      expect(isPlayer1Win(50, 50)).toBe(false);
    });

    it('should return true for minimal difference', () => {
      expect(isPlayer1Win(51, 50)).toBe(true);
    });

    it('should return true for large difference', () => {
      expect(isPlayer1Win(100, 0)).toBe(true);
    });

    it('should return false for large difference', () => {
      expect(isPlayer1Win(0, 100)).toBe(false);
    });
  });

  describe('calculateMatchResult', () => {
    it('should calculate player 1 win', () => {
      const result = calculateMatchResult(75, 25);
      expect(result.winner).toBe(1);
      expect(result.result1).toBe('win');
      expect(result.result2).toBe('loss');
    });

    it('should calculate player 2 win', () => {
      const result = calculateMatchResult(25, 75);
      expect(result.winner).toBe(2);
      expect(result.result1).toBe('loss');
      expect(result.result2).toBe('win');
    });

    it('should calculate tie when scores are equal', () => {
      const result = calculateMatchResult(50, 50);
      expect(result.winner).toBeNull();
      expect(result.result1).toBe('tie');
      expect(result.result2).toBe('tie');
    });

    it('should handle minimal difference for player 1 win', () => {
      const result = calculateMatchResult(51, 50);
      expect(result.winner).toBe(1);
      expect(result.result1).toBe('win');
      expect(result.result2).toBe('loss');
    });

    it('should handle minimal difference for player 2 win', () => {
      const result = calculateMatchResult(50, 51);
      expect(result.winner).toBe(2);
      expect(result.result1).toBe('loss');
      expect(result.result2).toBe('win');
    });

    it('should handle maximum scores', () => {
      const result1 = calculateMatchResult(100, 0);
      expect(result1.winner).toBe(1);
      expect(result1.result1).toBe('win');
      expect(result1.result2).toBe('loss');

      const result2 = calculateMatchResult(0, 100);
      expect(result2.winner).toBe(2);
      expect(result2.result1).toBe('loss');
      expect(result2.result2).toBe('win');
    });

    it('should handle scores with large differences', () => {
      const result1 = calculateMatchResult(99, 1);
      expect(result1.winner).toBe(1);
      expect(result1.result1).toBe('win');
      expect(result1.result2).toBe('loss');

      const result2 = calculateMatchResult(1, 99);
      expect(result2.winner).toBe(2);
      expect(result2.result1).toBe('loss');
      expect(result2.result2).toBe('win');
    });

    it('should handle scores that are close but not equal', () => {
      const result = calculateMatchResult(50, 51);
      expect(result.winner).toBe(2);
      expect(result.result1).toBe('loss');
      expect(result.result2).toBe('win');
    });
  });
});
