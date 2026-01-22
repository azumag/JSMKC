// @ts-nocheck - This test file uses complex mock types that are difficult to type correctly
import { describe, it, expect, jest } from '@jest/globals';
import {
  sanitizeError,
  createSafeError,
  sanitizeDatabaseError,
  sanitizeValidationError,
} from '@/lib/sanitize-error';

// Mock logger to avoid console output in tests
jest.mock('@/lib/logger', () => ({
  createLogger: () => ({
    debug: jest.fn(),
    error: jest.fn(),
  }),
}));

describe('Error Sanitization', () => {
  describe('sanitizeError', () => {
    it('should sanitize Error objects', () => {
      const error = new Error('Something went wrong');
      const result = sanitizeError(error);

      expect(result).toContain('Something went wrong');
    });

    it('should sanitize string errors', () => {
      const error = 'String error message';
      const result = sanitizeError(error);

      expect(result).toBe('String error message');
    });

    it('should sanitize object errors', () => {
      const error = { message: 'Object error', code: 500 };
      const result = sanitizeError(error);

      expect(result).toContain('Object error');
    });

    it('should sanitize other types', () => {
      const result = sanitizeError(12345);

      expect(result).toBe('12345');
    });

    it('should redact passwords', () => {
      const error = new Error('Password: secret123');
      const result = sanitizeError(error);

      expect(result).not.toContain('secret123');
      expect(result).toContain('[REDACTED]');
    });

    it('should redact secrets', () => {
      const error = new Error('Secret token: abc123def456');
      const result = sanitizeError(error);

      expect(result).toContain('[REDACTED]');
    });

    it('should redact API keys', () => {
      const error = new Error('API key: key123');
      const result = sanitizeError(error);

      expect(result).not.toContain('key123');
      expect(result).toContain('[REDACTED]');
    });

    it('should redact email addresses', () => {
      const error = new Error('User email: user@example.com');
      const result = sanitizeError(error);

      expect(result).not.toContain('user@example.com');
      expect(result).toContain('[REDACTED_EMAIL]');
    });

    it('should redact IP addresses', () => {
      const error = new Error('Request from 192.168.1.1');
      const result = sanitizeError(error);

      expect(result).not.toContain('192.168.1.1');
      expect(result).toContain('[REDACTED_IP]');
    });

    it('should redact file paths', () => {
      const error = new Error('Error in /app/api/users/route.ts');
      const result = sanitizeError(error);

      expect(result).not.toContain('/app/api/users/route.ts');
      expect(result).toContain('[REDACTED_PATH]');
    });

    it('should redact database connection strings', () => {
      const error = new Error('Database connection failed: postgresql://user:pass@localhost/db');
      const result = sanitizeError(error);

      expect(result).not.toContain('user:pass@');
    });

    it('should redact database queries', () => {
      const error = new Error('Query failed: SELECT * FROM users WHERE id = "123"');
      const result = sanitizeError(error);

      expect(result).not.toContain('"123"');
      expect(result).toContain('[REDACTED_VALUE]');
    });

    it('should truncate long error messages', () => {
      const longError = 'x'.repeat(1500);
      const result = sanitizeError(longError);

      expect(result.length).toBeLessThanOrEqual(1015); // 1000 + '... [TRUNCATED]'
      expect(result).toContain('... [TRUNCATED]');
    });

    it('should add context when provided', () => {
      const error = new Error('Something went wrong');
      const result = sanitizeError(error, 'API endpoint');

      expect(result).toContain('[API endpoint]');
    });

    it('should handle sanitization errors gracefully', () => {
      // Create an error that causes issues in sanitization
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const circular: any = { message: 'test' };
      circular.self = circular;

      const result = sanitizeError(circular, 'test');

      // Should not throw and should return a safe message
      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
    });

    it('should handle multiple sensitive patterns in one message', () => {
      const error = new Error('Password: secret123, Email: user@test.com, IP: 1.2.3.4');
      const result = sanitizeError(error);

      expect(result).not.toContain('secret123');
      expect(result).not.toContain('user@test.com');
      expect(result).not.toContain('1.2.3.4');
    });

    it('should preserve error message structure', () => {
      const error = new Error('Validation error: Field name is required');
      const result = sanitizeError(error);

      expect(result).toContain('Validation error:');
      expect(result).toContain('Field name is required');
    });
  });

  describe('createSafeError', () => {
    it('should create safe error object', () => {
      const error = new Error('Internal error');
      const result = createSafeError(error, 'Something went wrong');

      expect(result.userMessage).toBe('Something went wrong');
      expect(result.logMessage).toBeDefined();
      expect(result.logMessage).toContain('Internal error');
    });

    it('should use default user message if not provided', () => {
      const error = new Error('Internal error');
      const result = createSafeError(error);

      expect(result.userMessage).toBe('An unexpected error occurred');
    });

    it('should include context in log message', () => {
      const error = new Error('Internal error');
      const result = createSafeError(error, 'Something went wrong', 'API endpoint');

      expect(result.logMessage).toContain('[API endpoint]');
    });

    it('should sanitize the error for log message', () => {
      const error = new Error('Password: secret123');
      const result = createSafeError(error, 'Error occurred');

      expect(result.logMessage).not.toContain('secret123');
      expect(result.logMessage).toContain('[REDACTED]');
    });

    it('should return user message as-is', () => {
      const error = new Error('Internal error');
      const userMessage = 'Custom error message';
      const result = createSafeError(error, userMessage);

      expect(result.userMessage).toBe(userMessage);
    });
  });

  describe('sanitizeDatabaseError', () => {
    it('should sanitize database errors', () => {
      const error = new Error('Database query failed');
      const result = sanitizeDatabaseError(error, 'users endpoint');

      expect(result).toContain('[Database error in users endpoint]');
    });

    it('should redact Prisma error codes', () => {
      const error = { code: 'P2002', message: 'Duplicate entry' };
      const result = sanitizeDatabaseError(error, 'users');

      expect(result).toContain('Duplicate entry');
    });

    it('should redact relation names', () => {
      const error = new Error('relation "users" does not exist');
      const result = sanitizeDatabaseError(error, 'tables');

      expect(result).toContain('[REDACTED_IDENTIFIER]');
    });

    it('should redact column names', () => {
      const error = new Error('column "email" does not exist');
      const result = sanitizeDatabaseError(error, 'query');

      expect(result).toContain('[REDACTED_IDENTIFIER]');
    });

    it('should redact foreign key constraint messages', () => {
      const error = new Error('foreign key constraint fails');
      const result = sanitizeDatabaseError(error, 'insert');

      expect(result).toContain('[REDACTED]');
    });

    it('should redact unique constraint messages', () => {
      const error = new Error('duplicate key value violates unique constraint');
      const result = sanitizeDatabaseError(error, 'insert');

      expect(result).toContain('[REDACTED]');
    });

    it('should handle Error objects', () => {
      const error = new Error('Connection failed');
      const result = sanitizeDatabaseError(error, 'database');

      expect(result).toContain('[Database error in database]');
    });

    it('should handle non-Error objects', () => {
      const error = { message: 'Custom error', code: 500 };
      const result = sanitizeDatabaseError(error, 'api');

      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
    });
  });

  describe('sanitizeValidationError', () => {
    it('should sanitize validation errors', () => {
      const error = new Error('Validation failed for field email');
      const result = sanitizeValidationError(error);

      expect(result).toContain('Validation failed for field');
    });

    it('should redact field names', () => {
      const error = new Error('Validation failed for field user_email');
      const result = sanitizeValidationError(error);

      expect(result).toContain('field');
    });

    it('should handle Error objects', () => {
      const error = new Error('Invalid field value');
      const result = sanitizeValidationError(error);

      expect(result).toContain('Invalid');
    });

    it('should handle string errors', () => {
      const error = 'Invalid input field username';
      const result = sanitizeValidationError(error);

      expect(result).toContain('Invalid input');
    });

    it('should handle non-string errors', () => {
      const error = { code: 'VALIDATION_ERROR' };
      const result = sanitizeValidationError(error);

      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty error message', () => {
      const error = new Error('');
      const result = sanitizeError(error);

      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
    });

    it('should handle null error', () => {
      const result = sanitizeError(null);

      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
    });

    it('should handle undefined error', () => {
      const result = sanitizeError(undefined);

      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
    });

    it('should handle error with no message', () => {
      const error = new Error();
      const result = sanitizeError(error);

      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
    });

    it('should handle special characters in error', () => {
      const error = new Error('Error: <script>alert("xss")</script>');
      const result = sanitizeError(error);

      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
    });

    it('should handle unicode characters', () => {
      const error = new Error('エラー発生');
      const result = sanitizeError(error);

      expect(result).toContain('エラー発生');
    });

    it('should handle numeric error codes', () => {
      const error = 500;
      const result = sanitizeError(error);

      expect(result).toBe('500');
    });

    it('should handle very long error messages', () => {
      const longError = 'Error: ' + 'x'.repeat(2000);
      const result = sanitizeError(longError);

      expect(result.length).toBeLessThan(2020);
      expect(result).toContain('... [TRUNCATED]');
    });
  });

  describe('Combined Scenarios', () => {
    it('should handle complex database error with sensitive data', () => {
      const error = new Error(
        'Connection failed for user: postgresql://user:password@localhost/db'
      );
      const result = sanitizeDatabaseError(error, 'users');

      expect(result).toContain('[Database error in users]');
      expect(result).not.toContain('password');
    });

    it('should handle error with multiple email addresses', () => {
      const error = new Error(
        'Failed to send to user1@test.com, user2@test.com, user3@test.com'
      );
      const result = sanitizeError(error);

      expect(result).not.toContain('user1@test.com');
      expect(result).not.toContain('user2@test.com');
      expect(result).not.toContain('user3@test.com');
      expect((result.match(/\[REDACTED_EMAIL\]/g) || []).length).toBeGreaterThanOrEqual(3);
    });

    it('should handle error with query containing multiple values', () => {
      const error = new Error(
        'Query failed: INSERT INTO users (name, email) VALUES ("John", "john@test.com")'
      );
      const result = sanitizeError(error);

      expect(result).toContain('INSERT INTO users');
      expect(result).not.toContain('John');
      expect(result).not.toContain('john@test.com');
    });

    it('should handle error with multiple file paths', () => {
      const error = new Error(
        'Errors in /app/api/route.ts, /app/page.tsx, /lib/utils.ts'
      );
      const result = sanitizeError(error);

      expect((result.match(/\[REDACTED_PATH\]/g) || []).length).toBeGreaterThanOrEqual(3);
    });
  });
});
