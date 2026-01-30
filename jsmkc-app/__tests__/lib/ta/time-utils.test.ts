/**
 * @module time-utils.test
 *
 * Test suite for TA (Time Attack) time utility functions (`@/lib/ta/time-utils`).
 *
 * Covers:
 * - timeToMs: converting time strings (M:SS.mmm / MM:SS.mmm) to milliseconds,
 *   handling 1/2/3-digit millisecond padding, null/empty/invalid input rejection
 * - msToDisplayTime: converting milliseconds back to display format (M:SS.mmm),
 *   null input returning dash, zero-padding for seconds and milliseconds
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
} from '@/lib/ta/time-utils';

describe('TA Time Utils', () => {
  describe('timeToMs', () => {
    it('should convert valid time string M:SS.mmm to milliseconds', () => {
        expect(timeToMs('1:23.456')).toBe(83456);
        expect(timeToMs('12:34.567')).toBe(754567);
        expect(timeToMs('59:59.999')).toBe(3599999);
      });

      it('should convert valid time string MM:SS.mmm to milliseconds', () => {
        expect(timeToMs('1:23.456')).toBe(83456);
        expect(timeToMs('12:34.567')).toBe(754567);
        expect(timeToMs('59:59.999')).toBe(3599999);
      });

    it('should convert valid time string MM:SS.mmm to milliseconds', () => {
      expect(timeToMs('1:23.456')).toBe(83456);
      expect(timeToMs('59:59.999')).toBe(3599999);
    });

    it('should handle milliseconds with 1 digit padding', () => {
      expect(timeToMs('1:23.4')).toBe(83004);
      expect(timeToMs('1:23.45')).toBe(83045);
    });

    it('should handle milliseconds with 2 digit padding', () => {
      expect(timeToMs('1:23.4')).toBe(83004);
      expect(timeToMs('1:23.45')).toBe(83045);
    });

    it('should handle milliseconds with 3 digit padding', () => {
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
      expect(msToDisplayTime(83456)).toBe('1:23.456');
      expect(msToDisplayTime(3599999)).toBe('59:59.999');
    });

    it('should return dash for null input', () => {
      expect(msToDisplayTime(null)).toBe('-');
    });

    it('should format with zero padding', () => {
      expect(msToDisplayTime(60000)).toBe('1:00.000');
      expect(msToDisplayTime(1000)).toBe('0:01.000');
    });

    it('should format milliseconds with leading zeros', () => {
      expect(msToDisplayTime(60005)).toBe('1:00.005');
      expect(msToDisplayTime(60123)).toBe('1:00.123');
    });
  });

  describe('calculateTotalTime', () => {
    it('should calculate total time for all courses', () => {
      const times = {
        MC1: '1:23.456',
        DP1: '1:12.345',
        GV1: '0:59.789',
        BC1: '2:34.567',
      };
      expect(calculateTotalTime(times)).toBe(370157);
    });

    it('should return null if times is null', () => {
      expect(calculateTotalTime(null)).toBe(null);
    });

    it('should return null if any course time is invalid', () => {
      const times = {
        MC1: '1:23.456',
        DP1: 'invalid-time',
        GV1: '0:59.789',
        BC1: '2:34.567',
      };
      expect(calculateTotalTime(times)).toBe(null);
    });

    it('should handle empty time strings', () => {
      const times = {
        MC1: '1:23.456',
        DP1: '',
        GV1: '0:59.789',
        BC1: '2:34.567',
      };
      expect(calculateTotalTime(times)).toBe(null);
    });
  });

  describe('validateRequiredCourses', () => {
    it('should return true when all required courses have valid times', () => {
      const times = {
        MC1: '1:23.456',
        DP1: '1:12.345',
        GV1: '0:59.789',
        BC1: '2:34.567',
      };
      const requiredCourses = ['MC1', 'DP1', 'GV1', 'BC1'];
      expect(validateRequiredCourses(times, requiredCourses)).toBe(true);
    });

    it('should return false when required course is missing', () => {
      const times = {
        MC1: '1:23.456',
        DP1: '1:12.345',
        GV1: '0:59.789',
        BC1: '2:34.567',
      };
      const requiredCourses = ['MC1', 'DP1', 'GV1', 'BC1', 'MC2'];
      expect(validateRequiredCourses(times, requiredCourses)).toBe(false);
    });

    it('should return false when any required course has invalid time', () => {
      const times = {
        MC1: '1:23.456',
        DP1: 'invalid-time',
        GV1: '0:59.789',
        BC1: '2:34.567',
      };
      const requiredCourses = ['MC1', 'DP1', 'GV1', 'BC1'];
      expect(validateRequiredCourses(times, requiredCourses)).toBe(false);
    });

    it('should return false when times is null', () => {
      expect(validateRequiredCourses(null, ['MC1', 'DP1'])).toBe(false);
    });

    it('should handle empty time strings for required courses', () => {
      const times = {
        MC1: '1:23.456',
        DP1: '',
        GV1: '0:59.789',
        BC1: '2:34.567',
      };
      const requiredCourses = ['MC1', 'DP1', 'GV1', 'BC1'];
      expect(validateRequiredCourses(times, requiredCourses)).toBe(false);
    });
  });
});
