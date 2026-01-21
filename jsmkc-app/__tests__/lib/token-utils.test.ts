// __tests__/lib/token-utils.test.ts
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import crypto from 'crypto';
import {
  generateTournamentToken,
  isValidTokenFormat,
  isTokenValid,
  getTokenExpiry,
  extendTokenExpiry,
  getTokenTimeRemaining,
} from '@/lib/token-utils';

describe('Token Utilities', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('generateTournamentToken', () => {
    it('should generate a 32-character hex string', () => {
      const token = generateTournamentToken();
      expect(token).toHaveLength(32);
      expect(token).toMatch(/^[a-f0-9]{32}$/i);
    });

    it('should use crypto.randomBytes for generation', () => {
      const spy = jest.spyOn(crypto, 'randomBytes');
      generateTournamentToken();
      expect(spy).toHaveBeenCalledWith(16);
      spy.mockRestore();
    });

    it('should generate unique tokens on each call', () => {
      const token1 = generateTournamentToken();
      const token2 = generateTournamentToken();
      expect(token1).not.toBe(token2);
    });

    it('should generate lowercase hex characters', () => {
      const token = generateTournamentToken();
      expect(token).toMatch(/^[a-f0-9]+$/);
    });

    it('should not generate non-hex characters', () => {
      const token = generateTournamentToken();
      expect(token).not.toMatch(/[^a-f0-9]/i);
    });
  });

  describe('isValidTokenFormat', () => {
    it('should accept valid 32-character hex string', () => {
      const validToken = '0123456789abcdef0123456789abcdef';
      expect(isValidTokenFormat(validToken)).toBe(true);
    });

    it('should generate and accept lowercase hex characters', () => {
      const token = generateTournamentToken();
      expect(token).toMatch(/^[a-f0-9]{32}$/i);
      expect(isValidTokenFormat(token)).toBe(true);
    });

    it('should reject strings shorter than 32 characters', () => {
      const shortToken = '0123456789abcdef0123456789abcde';
      expect(isValidTokenFormat(shortToken)).toBe(false);
    });

    it('should reject strings longer than 32 characters', () => {
      const longToken = '0123456789abcdef0123456789abcdef123';
      expect(isValidTokenFormat(longToken)).toBe(false);
    });

    it('should reject strings with non-hex characters', () => {
      const invalidToken = 'ghijklmnopqrstuvwxyz0123456789abcdef';
      expect(isValidTokenFormat(invalidToken)).toBe(false);
    });

    it('should reject strings with special characters', () => {
      const invalidToken = '0123456789abcdef0123456789ab!@#';
      expect(isValidTokenFormat(invalidToken)).toBe(false);
    });

    it('should reject empty string', () => {
      expect(isValidTokenFormat('')).toBe(false);
    });

    it('should accept all zeros', () => {
      const allZeros = '0'.repeat(32);
      expect(allZeros.length).toBe(32);
      expect(isValidTokenFormat(allZeros)).toBe(true);
    });

    it('should accept all fs', () => {
      const allFs = 'ffffffffffffffffffffffffffffffff';
      expect(isValidTokenFormat(allFs)).toBe(true);
    });
  });

  describe('isTokenValid', () => {
    it('should return true for valid token with valid expiry', () => {
      const token = '0123456789abcdef0123456789abcdef';
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      expect(isTokenValid(token, expiresAt)).toBe(true);
    });

    it('should return false for null token', () => {
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      expect(isTokenValid(null, expiresAt)).toBe(false);
    });

    it('should return false for undefined token', () => {
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      expect(isTokenValid(undefined, expiresAt)).toBe(false);
    });

    it('should return false for empty string token', () => {
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      expect(isTokenValid('', expiresAt)).toBe(false);
    });

    it('should return false for invalid token format', () => {
      const token = 'invalid-token';
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      expect(isTokenValid(token, expiresAt)).toBe(false);
    });

    it('should return false for null expiry', () => {
      const token = '0123456789abcdef0123456789abcdef';
      expect(isTokenValid(token, null)).toBe(false);
    });

    it('should return false for undefined expiry', () => {
      const token = '0123456789abcdef0123456789abcdef';
      expect(isTokenValid(token, undefined)).toBe(false);
    });

    it('should return false for expired token', () => {
      const token = '0123456789abcdef0123456789abcdef';
      const expiresAt = new Date(Date.now() - 24 * 60 * 60 * 1000);
      expect(isTokenValid(token, expiresAt)).toBe(false);
    });

    it('should return false for token expired now', () => {
      const token = '0123456789abcdef0123456789abcdef';
      const expiresAt = new Date(Date.now() - 1000);
      expect(isTokenValid(token, expiresAt)).toBe(false);
    });

    it('should return true for token expiring in 1 second', () => {
      const token = '0123456789abcdef0123456789abcdef';
      const expiresAt = new Date(Date.now() + 1000);
      expect(isTokenValid(token, expiresAt)).toBe(true);
    });

    it('should return false when both token and expiry are invalid', () => {
      expect(isTokenValid(null, null)).toBe(false);
      expect(isTokenValid('', undefined)).toBe(false);
    });
  });

  describe('getTokenExpiry', () => {
    it('should return a Date object', () => {
      const expiry = getTokenExpiry();
      expect(expiry).toBeInstanceOf(Date);
    });

    it('should return expiry 24 hours from now by default', () => {
      const now = Date.now();
      const expiry = getTokenExpiry();
      const expectedTime = now + 24 * 60 * 60 * 1000;
      
      // Allow small margin of error for execution time
      expect(expiry.getTime()).toBeGreaterThanOrEqual(expectedTime - 100);
      expect(expiry.getTime()).toBeLessThan(expectedTime + 100);
    });

    it('should return expiry for custom hours', () => {
      const hours = 48;
      const now = Date.now();
      const expiry = getTokenExpiry(hours);
      const expectedTime = now + hours * 60 * 60 * 1000;
      
      expect(expiry.getTime()).toBeGreaterThanOrEqual(expectedTime - 100);
      expect(expiry.getTime()).toBeLessThan(expectedTime + 100);
    });

    it('should return expiry for 1 hour', () => {
      const hours = 1;
      const now = Date.now();
      const expiry = getTokenExpiry(hours);
      const expectedTime = now + hours * 60 * 60 * 1000;
      
      expect(expiry.getTime()).toBeGreaterThanOrEqual(expectedTime - 100);
      expect(expiry.getTime()).toBeLessThan(expectedTime + 100);
    });

    it('should return expiry for 168 hours (7 days)', () => {
      const hours = 168;
      const now = Date.now();
      const expiry = getTokenExpiry(hours);
      const expectedTime = now + hours * 60 * 60 * 1000;
      
      expect(expiry.getTime()).toBeGreaterThanOrEqual(expectedTime - 100);
      expect(expiry.getTime()).toBeLessThan(expectedTime + 100);
    });

    it('should handle zero hours', () => {
      const now = Date.now();
      const expiry = getTokenExpiry(0);
      const expectedTime = now + 0 * 60 * 60 * 1000;
      
      expect(expiry.getTime()).toBeGreaterThanOrEqual(expectedTime - 100);
      expect(expiry.getTime()).toBeLessThan(expectedTime + 100);
    });
  });

  describe('extendTokenExpiry', () => {
    it('should extend expiry by default 24 hours from current expiry', () => {
      const currentExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const newExpiry = extendTokenExpiry(currentExpiresAt);
      
      const diff = newExpiry.getTime() - currentExpiresAt.getTime();
      const expectedDiff = 24 * 60 * 60 * 1000;
      
      expect(diff).toBeGreaterThanOrEqual(expectedDiff - 100);
      expect(diff).toBeLessThan(expectedDiff + 100);
    });

    it('should extend expiry by custom hours', () => {
      const currentExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const hours = 48;
      const newExpiry = extendTokenExpiry(currentExpiresAt, hours);
      
      const diff = newExpiry.getTime() - currentExpiresAt.getTime();
      const expectedDiff = hours * 60 * 60 * 1000;
      
      expect(diff).toBeGreaterThanOrEqual(expectedDiff - 100);
      expect(diff).toBeLessThan(expectedDiff + 100);
    });

    it('should return expiry from now if current expiry is expired', () => {
      const currentExpiresAt = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const now = Date.now();
      const newExpiry = extendTokenExpiry(currentExpiresAt);
      
      const expectedTime = now + 24 * 60 * 60 * 1000;
      expect(newExpiry.getTime()).toBeGreaterThanOrEqual(expectedTime - 100);
      expect(newExpiry.getTime()).toBeLessThan(expectedTime + 100);
    });

    it('should return expiry from now if current expiry is null', () => {
      const now = Date.now();
      const newExpiry = extendTokenExpiry(null);
      
      const expectedTime = now + 24 * 60 * 60 * 1000;
      expect(newExpiry.getTime()).toBeGreaterThanOrEqual(expectedTime - 100);
      expect(newExpiry.getTime()).toBeLessThan(expectedTime + 100);
    });

    it('should handle custom hours when extending from now', () => {
      const hours = 12;
      const now = Date.now();
      const newExpiry = extendTokenExpiry(null, hours);
      
      const expectedTime = now + hours * 60 * 60 * 1000;
      expect(newExpiry.getTime()).toBeGreaterThanOrEqual(expectedTime - 100);
      expect(newExpiry.getTime()).toBeLessThan(expectedTime + 100);
    });

    it('should return a Date object', () => {
      const currentExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const newExpiry = extendTokenExpiry(currentExpiresAt);
      expect(newExpiry).toBeInstanceOf(Date);
    });
  });

  describe('getTokenTimeRemaining', () => {
    it('should return remaining time for future expiry', () => {
      const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000 + 30 * 60 * 1000 + 1000); // Add 1 second
      const result = getTokenTimeRemaining(expiresAt);
      expect(result).toBe('2h 30m remaining');
    });

    it('should return remaining time for 1 hour', () => {
      const expiresAt = new Date(Date.now() + 1 * 60 * 60 * 1000);
      const result = getTokenTimeRemaining(expiresAt);
      expect(result).toBe('1h 0m remaining');
    });

    it('should return remaining time for minutes only', () => {
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
      const result = getTokenTimeRemaining(expiresAt);
      expect(result).toBe('0h 30m remaining');
    });

    it('should return remaining time for seconds only', () => {
      const expiresAt = new Date(Date.now() + 30 * 1000);
      const result = getTokenTimeRemaining(expiresAt);
      expect(result).toBe('0h 0m remaining');
    });

    it('should return "Expired" for past expiry', () => {
      const expiresAt = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const result = getTokenTimeRemaining(expiresAt);
      expect(result).toBe('Expired');
    });

    it('should return "Expired" for current time', () => {
      const expiresAt = new Date(Date.now());
      const result = getTokenTimeRemaining(expiresAt);
      expect(result).toBe('Expired');
    });

    it('should return "No expiry set" for null expiry', () => {
      const result = getTokenTimeRemaining(null);
      expect(result).toBe('No expiry set');
    });

    it('should return remaining time for more than 24 hours (1 day)', () => {
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000 + 5 * 60 * 60 * 1000);
      const result = getTokenTimeRemaining(expiresAt);
      expect(result).toBe('1 day 5h remaining');
    });

    it('should return remaining time for more than 48 hours (2 days)', () => {
      const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000 + 5 * 60 * 60 * 1000);
      const result = getTokenTimeRemaining(expiresAt);
      expect(result).toBe('2 days 5h remaining');
    });

    it('should return remaining time for exactly 24 hours', () => {
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000 + 1); // Add 1ms to ensure it's > 24 hours
      const result = getTokenTimeRemaining(expiresAt);
      expect(result).toBe('24h 0m remaining');
    });

    it('should handle 59 minutes correctly', () => {
      const expiresAt = new Date(Date.now() + 59 * 60 * 1000 + 30 * 1000);
      const result = getTokenTimeRemaining(expiresAt);
      expect(result).toBe('0h 59m remaining');
    });

    it('should handle 23 hours correctly', () => {
      const expiresAt = new Date(Date.now() + 23 * 60 * 60 * 1000 + 30 * 60 * 1000);
      const result = getTokenTimeRemaining(expiresAt);
      expect(result).toBe('23h 30m remaining');
    });

    it('should handle 25 hours correctly (1 day + 1 hour)', () => {
      const expiresAt = new Date(Date.now() + 25 * 60 * 60 * 1000);
      const result = getTokenTimeRemaining(expiresAt);
      expect(result).toBe('1 day 1h remaining');
    });

    it('should return consistent format for various times', () => {
      const cases = [
        { hours: 1, minutes: 0 },
        { hours: 12, minutes: 30 },
        { hours: 23, minutes: 59 },
      ];

      cases.forEach(({ hours, minutes }) => {
        const expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000 + minutes * 60 * 1000);
        const result = getTokenTimeRemaining(expiresAt);
        expect(result).toMatch(/remaining/);
        expect(result).toContain(`${hours}h`);
        if (minutes > 0) {
          expect(result).toContain(`${minutes}m`);
        }
      });
    });
  });

  describe('Token Utilities Integration', () => {
    it('should work together to manage token lifecycle', () => {
      // Generate token
      const token = generateTournamentToken();
      expect(isValidTokenFormat(token)).toBe(true);

      // Get expiry
      const expiry = getTokenExpiry(24);
      expect(expiry).toBeInstanceOf(Date);

      // Check validity
      expect(isTokenValid(token, expiry)).toBe(true);

      // Get remaining time
      const remaining = getTokenTimeRemaining(expiry);
      expect(remaining).toMatch(/remaining/);
    });

    it('should handle token extension correctly', () => {
      const token = generateTournamentToken();
      const initialExpiry = getTokenExpiry(24);
      
      expect(isTokenValid(token, initialExpiry)).toBe(true);
      
      const extendedExpiry = extendTokenExpiry(initialExpiry, 24);
      expect(extendedExpiry.getTime()).toBeGreaterThan(initialExpiry.getTime());
    });

    it('should detect expired tokens correctly', () => {
      const token = generateTournamentToken();
      const expiredExpiry = new Date(Date.now() - 24 * 60 * 60 * 1000);
      
      expect(isValidTokenFormat(token)).toBe(true);
      expect(isTokenValid(token, expiredExpiry)).toBe(false);
      expect(getTokenTimeRemaining(expiredExpiry)).toBe('Expired');
    });
  });

  describe('Token Security', () => {
    it('should generate cryptographically secure tokens', () => {
      const tokens = Array.from({ length: 100 }, () => generateTournamentToken());
      const uniqueTokens = new Set(tokens);
      
      // Verify statistical randomness (should be mostly unique)
      expect(uniqueTokens.size).toBeGreaterThan(90);
    });

    it('should always generate valid format tokens', () => {
      const tokens = Array.from({ length: 100 }, () => generateTournamentToken());
      
      tokens.forEach(token => {
        expect(isValidTokenFormat(token)).toBe(true);
        expect(token).toHaveLength(32);
        expect(token).toMatch(/^[a-f0-9]{32}$/i);
      });
    });
  });
});
