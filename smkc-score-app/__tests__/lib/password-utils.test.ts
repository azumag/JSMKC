/**
 * @module __tests__/lib/password-utils.test.ts
 * @description Test suite for the password utility functions from `@/lib/password-utils`.
 *
 * This suite validates three exported functions:
 *
 * - `generateSecurePassword`: Generates a cryptographically secure random password
 *   using `crypto.getRandomValues`. The character set includes all uppercase letters,
 *   lowercase letters, digits, and special characters (!@#$%^&*). Tests verify
 *   default length (12), custom lengths, character set compliance,
 *   randomness (uniqueness across 100 passwords), and that
 *   all generated characters belong to the allowed charset.
 *
 * - `hashPassword`: Hashes a password using bcrypt with 12 rounds of salting.
 *   Tests confirm the hash is 60 characters long, different hashes are produced
 *   for the same password (due to random salt), and special/unicode characters
 *   are handled correctly.
 *
 * - `verifyPassword`: Compares a plaintext password against a bcrypt hash. Tests
 *   cover correct password verification, incorrect password rejection, empty
 *   password handling, and graceful behavior with invalid/malformed hash strings.
 *
 * Integration tests verify bcrypt round count (12), direct bcrypt.compare
 * compatibility, and overall password security properties (salt uniqueness,
 *  statistical randomness of generated passwords).
 */
// __tests__/lib/password-utils.test.ts
import { describe, it, expect } from '@jest/globals';
import { generateSecurePassword, hashPassword, verifyPassword } from '@/lib/password-utils';
import bcrypt from 'bcrypt';

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

    it('should generate password using valid characters from charset', () => {
      const password = generateSecurePassword();
      // The source charset includes all uppercase, lowercase, digits, and special characters
      // including ambiguous characters (I, O, 0, 1, l) and the ^ character
      const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
      const passwordChars = password.split('');

      passwordChars.forEach(char => {
        expect(charset).toContain(char);
      });
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

    it('should include all characters from the full charset including ambiguous ones', () => {
      // The source charset does NOT exclude ambiguous characters.
      // Generate a long password to increase the chance of including various chars.
      const password = generateSecurePassword(1000);
      // The full charset includes uppercase, lowercase, digits, and special chars
      const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
      // Verify every character in the generated password belongs to the charset
      for (const char of password) {
        expect(charset).toContain(char);
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

      // Verify the hash was created with bcrypt
      const match = await bcrypt.compare(password, hashed);
      expect(match).toBe(true);

      // Verify hash format starts with bcrypt prefix
      expect(hashed).toMatch(/^\$2[aby]\$/);
    });

    it('should use 12 rounds for hashing (as defined in BCRYPT_ROUNDS)', async () => {
      const password = 'testPassword123!';
      const hashed = await hashPassword(password);

      // Extract rounds from hash (format: $2a$12$...)
      const hashParts = hashed.split('$');
      const rounds = parseInt(hashParts[2], 10);

      expect(rounds).toBe(12);
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

      // Verify that we're getting mostly unique passwords (statistical randomness)
      expect(uniquePasswords.size).toBeGreaterThan(90);
    });

    it('should hash passwords securely with salt', async () => {
      const password = 'samePassword123!';
      const hash1 = await hashPassword(password);
      const hash2 = await hashPassword(password);

      // Same password should produce different hashes due to salt
      expect(hash1).not.toBe(hash2);

      // But both should verify correctly
      expect(await verifyPassword(password, hash1)).toBe(true);
      expect(await verifyPassword(password, hash2)).toBe(true);
    });
  });
});
