/**
 * @module __tests__/lib/sanitize-error.test.ts
 * @description Test suite for the error sanitization utilities from `@/lib/sanitize-error`.
 *
 * This suite validates that error messages are properly sanitized before being
 * exposed to users or written to logs. The functions under test are:
 *
 * - `sanitizeError`: Redacts sensitive data from error messages including
 *   passwords, secrets, API keys, email addresses, IP addresses, file paths,
 *   database connection strings, and SQL query fragments.
 * - `createSafeError`: Produces a safe error response object with success=false,
 *   a user-facing error message, and optionally sanitized details.
 * - `sanitizeDatabaseError`: Specialized sanitizer for database/Prisma errors that
 *   maps known Prisma error codes to user-friendly messages.
 * - `sanitizeValidationError`: Sanitizes validation errors, with special handling
 *   for Zod-style errors with an `issues` array.
 *
 * Edge cases tested include empty/null/undefined errors, unicode content, circular
 * references, numeric error codes, and combined scenarios with multiple sensitive
 * patterns in a single error.
 */
// @ts-nocheck - This test file uses complex mock types that are difficult to type correctly
import { describe, it, expect, jest } from '@jest/globals';
import {
  sanitizeError,
  createSafeError,
  sanitizeDatabaseError,
  sanitizeValidationError,
} from '@/lib/sanitize-error';

// Mock logger to avoid console output in tests and to allow verifying log calls
jest.mock('@/lib/logger', () => ({
  createLogger: () => ({
    debug: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
  }),
}));

describe('Error Sanitization', () => {
  describe('sanitizeError', () => {
    it('should sanitize Error objects', () => {
      // Error objects should have their message extracted and returned
      const error = new Error('Something went wrong');
      const result = sanitizeError(error);

      expect(result).toContain('Something went wrong');
    });

    it('should sanitize string errors', () => {
      // String errors should be returned as-is (after pattern sanitization)
      const error = 'String error message';
      const result = sanitizeError(error);

      expect(result).toBe('String error message');
    });

    it('should return generic message for non-Error non-string types', () => {
      // Objects that are not Error instances and not strings get a generic message
      // because the source does not attempt toString() on unknown types
      const error = { message: 'Object error', code: 500 };
      const result = sanitizeError(error);

      expect(result).toBe('An unexpected error occurred');
    });

    it('should return generic message for numeric errors', () => {
      // Numbers are not Error or string, so they get the generic message
      const result = sanitizeError(12345);

      expect(result).toBe('An unexpected error occurred');
    });

    it('should redact passwords', () => {
      // Password patterns like "Password: value" should be replaced with [REDACTED]
      const error = new Error('Password: secret123');
      const result = sanitizeError(error);

      expect(result).not.toContain('secret123');
      expect(result).toContain('[REDACTED]');
    });

    it('should redact secrets', () => {
      // Secret patterns like "Secret token: value" should be replaced
      const error = new Error('Secret token: abc123def456');
      const result = sanitizeError(error);

      expect(result).toContain('[REDACTED]');
    });

    it('should redact API keys', () => {
      // Key patterns like "key: value" should be replaced with [REDACTED]
      const error = new Error('API key: key123');
      const result = sanitizeError(error);

      expect(result).not.toContain('key123');
      expect(result).toContain('[REDACTED]');
    });

    it('should redact email addresses', () => {
      // Email addresses are replaced with [EMAIL_REDACTED] per the source code
      const error = new Error('User email: user@example.com');
      const result = sanitizeError(error);

      expect(result).not.toContain('user@example.com');
      expect(result).toContain('[EMAIL_REDACTED]');
    });

    it('should redact IP addresses', () => {
      // IPv4 addresses are replaced with [IP_REDACTED] per the source code
      const error = new Error('Request from 192.168.1.1');
      const result = sanitizeError(error);

      expect(result).not.toContain('192.168.1.1');
      expect(result).toContain('[IP_REDACTED]');
    });

    it('should redact file paths', () => {
      // File system paths are replaced with [PATH_REDACTED] per the source code
      const error = new Error('Error in /app/api/users/route.ts');
      const result = sanitizeError(error);

      expect(result).not.toContain('/app/api/users/route.ts');
      expect(result).toContain('[PATH_REDACTED]');
    });

    it('should redact database connection strings', () => {
      // PostgreSQL connection strings are matched by SENSITIVE_PATTERNS
      const error = new Error('Database connection failed: postgresql://user:pass@localhost/db');
      const result = sanitizeError(error);

      expect(result).not.toContain('user:pass@');
    });

    it('should redact database queries', () => {
      // SQL query fragments are replaced with [QUERY_REDACTED] per the source code
      const error = new Error('Query failed: SELECT * FROM users WHERE id = "123"');
      const result = sanitizeError(error);

      expect(result).not.toContain('"123"');
      expect(result).toContain('[QUERY_REDACTED]');
    });

    it('should not truncate messages (source has no truncation logic)', () => {
      // The source code does not implement message truncation;
      // messages are returned at full length after sanitization
      const longError = 'x'.repeat(1500);
      const result = sanitizeError(longError);

      expect(result).toBe(longError);
    });

    it('should log context but not include it in returned message', () => {
      // Context is passed to logger.debug internally but is NOT
      // prepended or appended to the returned sanitized message
      const error = new Error('Something went wrong');
      const result = sanitizeError(error, 'API endpoint');

      expect(result).toBe('Something went wrong');
    });

    it('should handle sanitization errors gracefully', () => {
      // Circular reference objects should not throw; they are not Error
      // or string, so the generic message is returned
      const circular: any = { message: 'test' };
      circular.self = circular;

      const result = sanitizeError(circular, 'test');

      // Should not throw and should return a safe message
      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
    });

    it('should handle multiple sensitive patterns in one message', () => {
      // Multiple patterns should all be redacted in a single pass
      const error = new Error('Password: secret123, Email: user@test.com, IP: 1.2.3.4');
      const result = sanitizeError(error);

      expect(result).not.toContain('secret123');
      expect(result).not.toContain('user@test.com');
      expect(result).not.toContain('1.2.3.4');
    });

    it('should preserve error message structure', () => {
      // Non-sensitive parts of the message should be preserved
      const error = new Error('Validation error: Field name is required');
      const result = sanitizeError(error);

      expect(result).toContain('Validation error:');
      expect(result).toContain('Field name is required');
    });
  });

  describe('createSafeError', () => {
    it('should create safe error object with success=false and error message', () => {
      // createSafeError returns { success: false, error: userMessage, details?: sanitized }
      const error = new Error('Internal error');
      const result = createSafeError(error, 'Something went wrong');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Something went wrong');
      // Details should contain the sanitized original error message
      expect(result.details).toBeDefined();
      expect(result.details).toContain('Internal error');
    });

    it('should include details only when they differ from userMessage', () => {
      // When the sanitized error is the same as the user message,
      // details should not be included (to avoid redundancy)
      const error = new Error('Something went wrong');
      const result = createSafeError(error, 'Something went wrong');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Something went wrong');
      expect(result.details).toBeUndefined();
    });

    it('should include context in log but not in returned object fields', () => {
      // Context is used for internal logging only
      const error = new Error('Internal error');
      const result = createSafeError(error, 'Something went wrong', 'API endpoint');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Something went wrong');
    });

    it('should sanitize the error for details', () => {
      // Sensitive data in the original error should be redacted in details
      const error = new Error('Password: secret123');
      const result = createSafeError(error, 'Error occurred');

      expect(result.details).not.toContain('secret123');
      expect(result.details).toContain('[REDACTED]');
    });

    it('should return user message as-is in the error field', () => {
      // The user-provided message is returned verbatim
      const error = new Error('Internal error');
      const userMessage = 'Custom error message';
      const result = createSafeError(error, userMessage);

      expect(result.error).toBe(userMessage);
    });
  });

  describe('sanitizeDatabaseError', () => {
    it('should apply base sanitization to non-Prisma database errors', () => {
      // For plain Error objects without a `code` property, the function
      // falls through to return the base sanitized message
      const error = new Error('Database query failed');
      const result = sanitizeDatabaseError(error, 'users endpoint');

      expect(result).toContain('Database query failed');
    });

    it('should return friendly message for P2002 (unique constraint)', () => {
      // Prisma P2002 errors map to a specific user-friendly message
      const error = { code: 'P2002', message: 'Duplicate entry' };
      const result = sanitizeDatabaseError(error, 'users');

      expect(result).toBe('A record with this value already exists');
    });

    it('should return friendly message for P2003 (foreign key constraint)', () => {
      // Prisma P2003 errors map to a specific user-friendly message
      const error = { code: 'P2003', message: 'Foreign key constraint failed' };
      const result = sanitizeDatabaseError(error, 'insert');

      expect(result).toBe('Related record not found');
    });

    it('should return friendly message for P2025 (record not found)', () => {
      // Prisma P2025 errors map to a specific user-friendly message
      const error = { code: 'P2025', message: 'Record to update not found' };
      const result = sanitizeDatabaseError(error, 'update');

      expect(result).toBe('Record not found');
    });

    it('should return friendly message for P2024 (connection pool timeout)', () => {
      // Prisma P2024 errors map to a specific user-friendly message
      const error = { code: 'P2024', message: 'Connection pool timeout' };
      const result = sanitizeDatabaseError(error, 'query');

      expect(result).toBe('Database temporarily unavailable');
    });

    it('should return friendly message for P2028 (transaction error)', () => {
      // Prisma P2028 errors map to a specific user-friendly message
      const error = { code: 'P2028', message: 'Transaction API error' };
      const result = sanitizeDatabaseError(error, 'transaction');

      expect(result).toBe('Database transaction failed');
    });

    it('should return base sanitized message for unrecognized Prisma codes', () => {
      // For unrecognized error codes, falls back to base sanitization
      const error = { code: 'P9999', message: 'Unknown Prisma error' };
      const result = sanitizeDatabaseError(error, 'api');

      // The error is not an Error or string, so base sanitization returns generic message
      expect(result).toBe('An unexpected error occurred');
    });

    it('should handle Error objects without a code property', () => {
      // Plain Error objects go through base sanitization only
      const error = new Error('Connection failed');
      const result = sanitizeDatabaseError(error, 'database');

      expect(result).toContain('Connection failed');
    });

    it('should handle non-Error objects without a code property', () => {
      // Objects without `code` go through base sanitization
      const error = { message: 'Custom error' };
      const result = sanitizeDatabaseError(error, 'api');

      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
    });
  });

  describe('sanitizeValidationError', () => {
    it('should format Zod-style validation errors with issues array', () => {
      // When the error has an `issues` array, it formats them as
      // "Validation failed: field: message; field: message"
      const error = {
        issues: [
          { path: ['email'], message: 'Invalid email format' },
          { path: ['name'], message: 'Required' },
        ],
      };
      const result = sanitizeValidationError(error);

      expect(result).toContain('Validation failed:');
      expect(result).toContain('email: Invalid email format');
      expect(result).toContain('name: Required');
    });

    it('should handle issues with empty paths', () => {
      // When path is empty, only the message is included (no field prefix)
      const error = {
        issues: [
          { path: [], message: 'Invalid input' },
        ],
      };
      const result = sanitizeValidationError(error);

      expect(result).toContain('Validation failed:');
      expect(result).toContain('Invalid input');
    });

    it('should fall back to sanitizeError for non-Zod Error objects', () => {
      // When the error does not have an `issues` array, it falls through
      // to sanitizeError with 'validation' context
      const error = new Error('Invalid field value');
      const result = sanitizeValidationError(error);

      expect(result).toContain('Invalid field value');
    });

    it('should fall back to sanitizeError for string errors', () => {
      // String errors go through sanitizeError as fallback
      const error = 'Invalid input field username';
      const result = sanitizeValidationError(error);

      expect(result).toContain('Invalid input');
    });

    it('should handle non-string non-Error objects without issues', () => {
      // Objects without `issues` array fall through to sanitizeError
      // which returns the generic message for non-Error non-string types
      const error = { code: 'VALIDATION_ERROR' };
      const result = sanitizeValidationError(error);

      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty error message', () => {
      // Empty message is still a valid string, should return empty string
      const error = new Error('');
      const result = sanitizeError(error);

      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
    });

    it('should handle null error', () => {
      // null is not Error or string, so generic message is returned
      const result = sanitizeError(null);

      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
    });

    it('should handle undefined error', () => {
      // undefined is not Error or string, so generic message is returned
      const result = sanitizeError(undefined);

      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
    });

    it('should handle error with no message', () => {
      // Error() with no argument has empty string message
      const error = new Error();
      const result = sanitizeError(error);

      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
    });

    it('should handle special characters in error', () => {
      // Special characters like HTML tags should pass through
      // (sanitize-error focuses on sensitive data, not XSS)
      const error = new Error('Error: <script>alert("xss")</script>');
      const result = sanitizeError(error);

      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
    });

    it('should handle unicode characters', () => {
      // Unicode characters should be preserved as-is
      const error = new Error('エラー発生');
      const result = sanitizeError(error);

      expect(result).toContain('エラー発生');
    });

    it('should return generic message for numeric error codes', () => {
      // Numbers are not Error or string, so generic message is returned
      const error = 500;
      const result = sanitizeError(error);

      expect(result).toBe('An unexpected error occurred');
    });

    it('should handle very long error messages without truncation', () => {
      // The source code does not truncate messages
      const longError = 'Error: ' + 'x'.repeat(2000);
      const result = sanitizeError(longError);

      expect(result).toBe(longError);
    });
  });

  describe('Combined Scenarios', () => {
    it('should handle complex database error with sensitive data', () => {
      // Database connection string should be redacted by SENSITIVE_PATTERNS
      const error = new Error(
        'Connection failed for user: postgresql://user:password@localhost/db'
      );
      const result = sanitizeDatabaseError(error, 'users');

      // The postgresql:// URL pattern should be caught and redacted
      expect(result).not.toContain('password');
      expect(result).not.toContain('postgresql://');
    });

    it('should handle error with multiple email addresses', () => {
      // All email addresses in the message should be replaced with [EMAIL_REDACTED]
      const error = new Error(
        'Failed to send to user1@test.com, user2@test.com, user3@test.com'
      );
      const result = sanitizeError(error);

      expect(result).not.toContain('user1@test.com');
      expect(result).not.toContain('user2@test.com');
      expect(result).not.toContain('user3@test.com');
      expect((result.match(/\[EMAIL_REDACTED\]/g) || []).length).toBeGreaterThanOrEqual(3);
    });

    it('should handle error with query containing multiple values', () => {
      // The entire SQL statement after INSERT is replaced with [QUERY_REDACTED]
      const error = new Error(
        'Query failed: INSERT INTO users (name, email) VALUES ("John", "john@test.com")'
      );
      const result = sanitizeError(error);

      // The QUERY_PATTERN replaces the entire SQL fragment
      expect(result).toContain('[QUERY_REDACTED]');
      expect(result).not.toContain('John');
      expect(result).not.toContain('john@test.com');
    });

    it('should handle error with multiple file paths', () => {
      // All file paths in the message should be replaced with [PATH_REDACTED]
      const error = new Error(
        'Errors in /app/api/route.ts, /app/page.tsx, /lib/utils.ts'
      );
      const result = sanitizeError(error);

      expect((result.match(/\[PATH_REDACTED\]/g) || []).length).toBeGreaterThanOrEqual(3);
    });
  });
});
