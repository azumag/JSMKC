/**
 * @module __tests__/lib/password-utils.test.ts
 * @description Test suite for password generation, hashing, and verification utilities.
 *
 * Generated passwords use the exported readable character set, which excludes
 * visually ambiguous characters while retaining uppercase letters, lowercase
 * letters, digits, and special characters.
 */
import { describe, it, expect } from '@jest/globals';
import {
  generateSecurePassword,
  hashPassword,
  READABLE_PASSWORD_CHARSET,
  verifyPassword,
} from '@/lib/password-utils';
import bcrypt from 'bcryptjs';

const EXPECTED_READABLE_PASSWORD_CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%^&*';

describe('Password Utilities', () => {
  describe('generateSecurePassword', () => {
    it('should generate password with default length of 12', () => {
      const password = generateSecurePassword();
      expect(password).toHaveLength(12);
      expect(typeof password).toBe('string');
    });

    it('should generate password with custom length', () => {
      const password = generateSecurePassword(16);
      expect(password).toHaveLength(16);
      expect(typeof password).toBe('string');
    });

    it('should generate password with minimum valid length', () => {
      const password = generateSecurePassword(1);
      expect(password).toHaveLength(1);
      expect(typeof password).toBe('string');
    });

    it('should match the intended readable character set exactly', () => {
      expect(READABLE_PASSWORD_CHARSET).toBe(EXPECTED_READABLE_PASSWORD_CHARSET);
    });

    it('should exclude characters that are easy to confuse visually', () => {
      const ambiguousCharacters = ['I', 'O', 'l', 'o', '0', '1'];

      for (const character of ambiguousCharacters) {
        expect(READABLE_PASSWORD_CHARSET).not.toContain(character);
      }
    });

    it('should generate password using valid characters from the readable charset', () => {
      const password = generateSecurePassword();

      for (const character of password) {
        expect(READABLE_PASSWORD_CHARSET).toContain(character);
      }
    });

    it('should generate different passwords on each call (randomness)', () => {
      const password1 = generateSecurePassword();
      const password2 = generateSecurePassword();

      expect(password1).not.toBe(password2);
    });

    it('should generate passwords using crypto.getRandomValues for security', () => {
      const password = generateSecurePassword();
      expect(password).toBeDefined();
      expect(password.length).toBeGreaterThan(0);
    });

    it('should only generate characters from the readable charset', () => {
      const password = generateSecurePassword(1000);

      for (const character of password) {
        expect(READABLE_PASSWORD_CHARSET).toContain(character);
      }
    });
  });

  describe('hashPassword', () => {
    it('should hash password correctly', async () => {
      const password = 'testPassword123!';
      const hashed = await hashPassword(password);

      expect(hashed).toBeDefined();
      expect(typeof hashed).toBe('string');
      expect(hashed.length).toBe(60);
    });

    it('should generate different hashes for the same password (salt)', async () => {
      const password = 'testPassword123!';
      const hash1 = await hashPassword(password);
      const hash2 = await hashPassword(password);

      expect(hash1).not.toBe(hash2);
    });

    it('should hash empty string', async () => {
      const hashed = await hashPassword('');
      expect(hashed).toBeDefined();
      expect(typeof hashed).toBe('string');
      expect(hashed.length).toBe(60);
    });

    it('should hash password with special characters', async () => {
      const password = '!@#$%^&*()_+-=[]{}|;:,.<>?';
      const hashed = await hashPassword(password);

      expect(hashed).toBeDefined();
      expect(hashed.length).toBe(60);
    });

    it('should hash password with unicode characters', async () => {
      const password = 'パスワード123!';
      const hashed = await hashPassword(password);

      expect(hashed).toBeDefined();
      expect(hashed.length).toBe(60);
    });
  });

  describe('verifyPassword', () => {
    it('should verify correct password returns true', async () => {
      const password = 'testPassword123!';
      const hashed = await hashPassword(password);

      const result = await verifyPassword(password, hashed);
      expect(result).toBe(true);
    });

    it('should verify incorrect password returns false', async () => {
      const password = 'testPassword123!';
      const hashed = await hashPassword(password);

      const result = await verifyPassword('wrongPassword', hashed);
      expect(result).toBe(false);
    });

    it('should verify password against different hash returns false', async () => {
      const password = 'testPassword123!';
      const wrongHash = await hashPassword('differentPassword');

      const result = await verifyPassword(password, wrongHash);
      expect(result).toBe(false);
    });

    it('should return false for empty password against valid hash', async () => {
      const hashed = await hashPassword('testPassword123!');

      const result = await verifyPassword('', hashed);
      expect(result).toBe(false);
    });

    it('should return false for invalid hash format', async () => {
      const password = 'testPassword123!';

      const result = await verifyPassword(password, 'invalidHash');
      expect(result).toBe(false);
    });

    it('should handle malformed hash string gracefully', async () => {
      const password = 'testPassword123!';
      const malformedHash = 'notavalidhash';

      const result = await verifyPassword(password, malformedHash);
      expect(result).toBe(false);
    });
  });

  describe('Bcrypt Integration', () => {
    it('should use correct number of bcrypt rounds', async () => {
      const password = 'testPassword123!';
      const hashed = await hashPassword(password);

      const match = await bcrypt.compare(password, hashed);
      expect(match).toBe(true);
      expect(hashed).toMatch(/^\$2[aby]\$/);
    });

    it('should use 10 rounds for hashing (as defined in BCRYPT_ROUNDS)', async () => {
      const password = 'testPassword123!';
      const hashed = await hashPassword(password);
      const hashParts = hashed.split('$');
      const rounds = parseInt(hashParts[2], 10);

      expect(rounds).toBe(10);
    });

    it('should verify hashed password with bcrypt directly', async () => {
      const password = 'testPassword123!';
      const hashed = await hashPassword(password);

      const result = await bcrypt.compare(password, hashed);
      expect(result).toBe(true);
    });
  });

  describe('Password Security', () => {
    it('should generate cryptographically secure passwords', () => {
      const passwords = Array.from({ length: 100 }, () => generateSecurePassword());
      const uniquePasswords = new Set(passwords);

      expect(uniquePasswords.size).toBeGreaterThan(90);
    });

    it('should hash passwords securely with salt', async () => {
      const password = 'samePassword123!';
      const hash1 = await hashPassword(password);
      const hash2 = await hashPassword(password);

      expect(hash1).not.toBe(hash2);
      expect(await verifyPassword(password, hash1)).toBe(true);
      expect(await verifyPassword(password, hash2)).toBe(true);
    });
  });
});
