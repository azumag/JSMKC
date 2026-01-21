import { generateSecurePassword, hashPassword, verifyPassword } from '@/lib/password-utils';

// Mock crypto module for test environment
global.crypto = {
  getRandomValues: jest.fn((array: Uint8Array) => {
    for (let i = 0; i < array.length; i++) {
      array[i] = Math.floor(Math.random() * 256);
    }
    return array;
  }),
};

describe('Password Utilities', () => {
  describe('generateSecurePassword', () => {
    it('should generate a password of the specified length', () => {
      const password = generateSecurePassword(16);
      expect(password).toHaveLength(16);
    });

    it('should generate a password with default length when no length is provided', () => {
      const password = generateSecurePassword();
      expect(password).toHaveLength(12);
    });

    it('should only include allowed characters', () => {
      const password = generateSecurePassword(50);
      const allowedChars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*';
      
      for (const char of password) {
        expect(allowedChars).toContain(char);
      }
    });

    it('should generate different passwords each time', () => {
      const password1 = generateSecurePassword(12);
      const password2 = generateSecurePassword(12);
      expect(password1).not.toBe(password2);
    });

    it('should generate at least 1 character', () => {
      const password = generateSecurePassword(1);
      expect(password).toHaveLength(1);
    });

    it('should generate at most 100 characters', () => {
      const password = generateSecurePassword(100);
      expect(password).toHaveLength(100);
    });

    it('should generate exactly 12 characters for length 12', () => {
      const password = generateSecurePassword(12);
      expect(password).toHaveLength(12);
    });
  });

  describe('hashPassword', () => {
    it('should hash a password and return a string', async () => {
      const password = 'testPassword123';
      const hashedPassword = await hashPassword(password);
      
      expect(typeof hashedPassword).toBe('string');
      expect(hashedPassword).not.toBe(password);
    });

    it('should produce different hashes for the same password', async () => {
      const password = 'testPassword123';
      const hash1 = await hashPassword(password);
      const hash2 = await hashPassword(password);
      
      expect(hash1).not.toBe(hash2);
    });

    it('should hash different passwords differently', async () => {
      const password1 = 'password1';
      const password2 = 'password2';
      const hash1 = await hashPassword(password1);
      const hash2 = await hashPassword(password2);
      
      expect(hash1).not.toBe(hash2);
    });

    it('should hash empty string', async () => {
      const hash = await hashPassword('');
      expect(typeof hash).toBe('string');
      expect(hash).not.toBe('');
    });
  });

  describe('verifyPassword', () => {
    it('should verify a correct password', async () => {
      const password = 'testPassword123';
      const hashedPassword = await hashPassword(password);
      const isValid = await verifyPassword(password, hashedPassword);
      
      expect(isValid).toBe(true);
    });

    it('should return false for incorrect password', async () => {
      const password = 'correctPassword';
      const hashedPassword = await hashPassword(password);
      const isValid = await verifyPassword('wrongPassword', hashedPassword);
      
      expect(isValid).toBe(false);
    });

    it('should handle empty password correctly', async () => {
      const hashedPassword = await hashPassword('');
      const isValid = await verifyPassword('', hashedPassword);
      
      expect(isValid).toBe(true);
    });

    it('should handle malformed password hash', async () => {
      const password = 'testPassword';
      const isValid = await verifyPassword(password, 'not-a-valid-hash');
      
      expect(isValid).toBe(false);
    });

    it('should handle null/undefined password', async () => {
      const hashedPassword = await hashPassword('testPassword');
      
      expect(await verifyPassword(null, hashedPassword)).toBe(false);
      expect(await verifyPassword(undefined, hashedPassword)).toBe(false);
    });

    it('should handle null/undefined hash', async () => {
      const isValid1 = await verifyPassword('testPassword', null);
      const isValid2 = await verifyPassword('testPassword', undefined);
      
      expect(isValid1).toBe(false);
      expect(isValid2).toBe(false);
    });

    it('should handle empty string password', async () => {
      const hashedPassword = await hashPassword('');
      const isValid = await verifyPassword('', hashedPassword);
      
      expect(isValid).toBe(true);
    });

    it('should handle empty string hash', async () => {
      const isValid = await verifyPassword('testPassword', '');
      
      expect(isValid).toBe(false);
    });
  });
});
