/**
 * @module time-utils.test
 *
 * Test suite for TA (Time Attack) time utility functions (`@/lib/ta/time-utils`).
 *
 * Covers:
 * - timeToMs: converting time strings (M:SS.mm / MM:SS.mm) to milliseconds,
 *   handling legacy 1/2/3-digit fractional padding, null/empty/invalid input rejection
 * - msToDisplayTime: converting milliseconds back to display format (M:SS.mm),
 *   null input returning dash, zero-padding for seconds and centiseconds
 * - calculateTotalTime: summing all course times, returning null for null input
 *   or any invalid/empty course time
 * - validateRequiredCourses: checking that all required courses have valid times,
 *   returning false for missing courses, invalid times, null input, or empty strings
 */
import {
  timeToMs,
  msToDisplayTime,
  calculateTotalTime,
  validateRequiredCourses,
  autoFormatTime,
} from '@/lib/ta/time-utils';

describe('TA Time Utils', () => {
  describe('timeToMs', () => {
    it('should convert valid time string M:SS.mm to milliseconds', () => {
      expect(timeToMs('1:23.45')).toBe(83450);
      expect(timeToMs('12:34.56')).toBe(754560);
      expect(timeToMs('59:59.99')).toBe(3599990);
    });

    it('should right-pad milliseconds with 1 digit to 3 digits', () => {
      // '1:23.4' -> .4 is padded to .400 -> 1*60000 + 23*1000 + 400 = 83400
      expect(timeToMs('1:23.4')).toBe(83400);
    });

    it('should right-pad milliseconds with 2 digits to 3 digits', () => {
      // '1:23.45' -> .45 is padded to .450 -> 1*60000 + 23*1000 + 450 = 83450
      expect(timeToMs('1:23.45')).toBe(83450);
    });

    it('should keep legacy 3-digit fractional precision as-is', () => {
      expect(timeToMs('1:23.456')).toBe(83456);
    });

    it('should return null for empty string', () => {
      expect(timeToMs('')).toBe(null);
    });

    it('should return null for null input', () => {
      expect(timeToMs(null as unknown as string)).toBe(null);
    });

    it('should return null for invalid format', () => {
      expect(timeToMs('invalid')).toBe(null);
      expect(timeToMs('1:23')).toBe(null); // Missing milliseconds
      expect(timeToMs('1:23')).toBe(null); // Missing period
    });
  });

  describe('msToDisplayTime', () => {
    it('should convert milliseconds to display format', () => {
      expect(msToDisplayTime(83456)).toBe('1:23.46');
      expect(msToDisplayTime(3599999)).toBe('60:00.00');
    });

    it('should return dash for null input', () => {
      expect(msToDisplayTime(null)).toBe('-');
    });

    it('should format with zero padding', () => {
      expect(msToDisplayTime(60000)).toBe('1:00.00');
      expect(msToDisplayTime(1000)).toBe('0:01.00');
    });

    it('should round to centiseconds for display', () => {
      expect(msToDisplayTime(60005)).toBe('1:00.01');
      expect(msToDisplayTime(60123)).toBe('1:00.12');
    });
  });

  describe('calculateTotalTime', () => {
    it('should calculate total time for all courses', () => {
      const times = {
        MC1: '1:23.45',
        DP1: '1:12.34',
        GV1: '0:59.78',
        BC1: '2:34.56',
      };
      expect(calculateTotalTime(times)).toBe(370130);
    });

    it('should return null if times is null', () => {
      expect(calculateTotalTime(null)).toBe(null);
    });

    it('should return null if any course time is invalid', () => {
      const times = {
        MC1: '1:23.45',
        DP1: 'invalid-time',
        GV1: '0:59.78',
        BC1: '2:34.56',
      };
      expect(calculateTotalTime(times)).toBe(null);
    });

    it('should handle empty time strings', () => {
      const times = {
        MC1: '1:23.45',
        DP1: '',
        GV1: '0:59.78',
        BC1: '2:34.56',
      };
      expect(calculateTotalTime(times)).toBe(null);
    });
  });

  describe('validateRequiredCourses', () => {
    it('should return true when all required courses have valid times', () => {
      const times = {
        MC1: '1:23.45',
        DP1: '1:12.34',
        GV1: '0:59.78',
        BC1: '2:34.56',
      };
      const requiredCourses = ['MC1', 'DP1', 'GV1', 'BC1'];
      expect(validateRequiredCourses(times, requiredCourses)).toBe(true);
    });

    it('should return false when required course is missing', () => {
      const times = {
        MC1: '1:23.45',
        DP1: '1:12.34',
        GV1: '0:59.78',
        BC1: '2:34.56',
      };
      const requiredCourses = ['MC1', 'DP1', 'GV1', 'BC1', 'MC2'];
      expect(validateRequiredCourses(times, requiredCourses)).toBe(false);
    });

    it('should return false when any required course has invalid time', () => {
      const times = {
        MC1: '1:23.45',
        DP1: 'invalid-time',
        GV1: '0:59.78',
        BC1: '2:34.56',
      };
      const requiredCourses = ['MC1', 'DP1', 'GV1', 'BC1'];
      expect(validateRequiredCourses(times, requiredCourses)).toBe(false);
    });

    it('should return false when times is null', () => {
      expect(validateRequiredCourses(null, ['MC1', 'DP1'])).toBe(false);
    });

    it('should handle empty time strings for required courses', () => {
      const times = {
        MC1: '1:23.45',
        DP1: '',
        GV1: '0:59.78',
        BC1: '2:34.56',
      };
      const requiredCourses = ['MC1', 'DP1', 'GV1', 'BC1'];
      expect(validateRequiredCourses(times, requiredCourses)).toBe(false);
    });
  });

  describe('autoFormatTime', () => {
    it('should return empty string for empty/null input', () => {
      expect(autoFormatTime('')).toBe('');
      expect(autoFormatTime('  ')).toBe('');
    });

    it('should normalize already-valid time strings to M:SS.mm', () => {
      expect(autoFormatTime('1:23.456')).toBe('1:23.46');
      expect(autoFormatTime('0:58.490')).toBe('0:58.49');
      expect(autoFormatTime('12:34.56')).toBe('12:34.56');
    });

    it('should append .00 for colon-only input (M:SS)', () => {
      expect(autoFormatTime('1:23')).toBe('1:23.00');
      expect(autoFormatTime('0:58')).toBe('0:58.00');
    });

    it('should format digits-only input as MSScc', () => {
      expect(autoFormatTime('12345')).toBe('1:23.45');
      expect(autoFormatTime('05849')).toBe('0:58.49');
      expect(autoFormatTime('123456')).toBe('12:34.56');
      expect(autoFormatTime('00112')).toBe('0:01.12');
      /* Short input — padded left */
      expect(autoFormatTime('5849')).toBe('0:58.49');
      expect(autoFormatTime('112')).toBe('0:01.12');
    });

    it('should handle dot-only input and normalize to centiseconds', () => {
      expect(autoFormatTime('58.490')).toBe('0:58.49');
      expect(autoFormatTime('123.456')).toBe('1:23.46');
      expect(autoFormatTime('1.234')).toBe('0:01.23');
    });

    it('should return null for uninterpretable input', () => {
      expect(autoFormatTime('abc')).toBeNull();
      expect(autoFormatTime('1:2:3')).toBeNull();
    });

    it('should return null for invalid seconds (>=60)', () => {
      /* "06500" → 0:65.00 — invalid seconds */
      expect(autoFormatTime('06500')).toBeNull();
    });

    it('should handle extreme short inputs (0, 00, 000)', () => {
      expect(autoFormatTime('0')).toBe('0:00.00');
      expect(autoFormatTime('00')).toBe('0:00.00');
      expect(autoFormatTime('000000')).toBe('0:00.00');
    });

    it('should reject digits-only input that would require 3+ minute digits', () => {
      expect(autoFormatTime('1234567')).toBeNull();
    });

    it('should preserve 2-digit centiseconds in valid format', () => {
      expect(autoFormatTime('0:58.49')).toBe('0:58.49');
      expect(timeToMs('0:58.49')).toBe(58490); /* Right-padded: 49 → 490ms */
    });

    it('should round-trip with timeToMs for valid outputs', () => {
      const formatted = autoFormatTime('12345');
      expect(formatted).toBe('1:23.45');
      expect(timeToMs(formatted!)).toBe(83450);
    });
  });
});
