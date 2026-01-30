/**
 * Error Sanitization Utilities
 *
 * Removes sensitive information from error messages before they are
 * returned to API clients or logged to external services.
 *
 * This module prevents accidental leakage of:
 * - Database connection strings and credentials
 * - API keys, tokens, and secrets
 * - Email addresses and IP addresses
 * - File system paths revealing server structure
 * - SQL queries exposing database schema
 *
 * All error messages that will be exposed to end users (API responses,
 * client-side error displays) MUST pass through these sanitization
 * functions to ensure no sensitive data leaks.
 *
 * Usage:
 *   import { sanitizeError, createSafeError } from '@/lib/sanitize-error';
 *   const safeMessage = sanitizeError(caughtError, 'api-players');
 *   const safeResponse = createSafeError(error, 'Operation failed', 'api-players');
 */

import { createLogger } from './logger';

/** Logger scoped to error sanitization for tracking sanitization events */
const logger = createLogger('sanitize-error');

// ============================================================
// Sensitive Pattern Definitions
// ============================================================

/**
 * Regex patterns that match common sensitive information in error messages.
 *
 * These patterns detect keywords commonly associated with credentials,
 * secrets, and connection details. When matched, the surrounding content
 * is replaced with a generic placeholder to prevent information leakage.
 *
 * Each pattern uses word boundaries (\b) and case-insensitive matching
 * to catch variations like "Password", "PASSWORD", "db_password", etc.
 */
export const SENSITIVE_PATTERNS: RegExp[] = [
  // Credential-related keywords followed by assignment-like patterns
  /password\s*[=:]\s*\S+/gi,
  /secret\s*[=:]\s*\S+/gi,
  /token\s*[=:]\s*\S+/gi,
  /key\s*[=:]\s*\S+/gi,
  /auth\s*[=:]\s*\S+/gi,

  // Database connection strings (PostgreSQL, MySQL, MongoDB formats)
  /database\s*[=:]\s*\S+/gi,
  /connection\s*[=:]\s*\S+/gi,

  // Full database URL patterns (postgres://, mysql://, mongodb://)
  /(?:postgres|postgresql|mysql|mongodb|redis):\/\/[^\s]+/gi,

  // Environment variable references that may contain secrets
  /DATABASE_URL\s*[=:]\s*\S+/gi,
];

/**
 * Pattern matching email addresses in error messages.
 * Prevents leaking user email addresses in error responses.
 * Matches standard email format: user@domain.tld
 */
export const EMAIL_PATTERN: RegExp = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

/**
 * Pattern matching IPv4 and IPv6 addresses in error messages.
 * Prevents leaking client or server IP addresses.
 * Matches:
 * - IPv4: 192.168.1.1
 * - IPv6: ::1, fe80::1, 2001:db8::1
 */
export const IP_PATTERN: RegExp =
  /(?:\d{1,3}\.){3}\d{1,3}|(?:[0-9a-fA-F]{1,4}:){2,7}[0-9a-fA-F]{1,4}|::1/g;

/**
 * Pattern matching file system paths that reveal server directory structure.
 * Prevents attackers from learning about the server's file system layout.
 * Matches Unix-style paths like /home/user/app/src/file.ts
 */
export const FILE_PATH_PATTERN: RegExp =
  /(?:\/[\w.-]+){2,}(?:\.\w+)?/g;

/**
 * Pattern matching SQL query fragments in error messages.
 * Prevents exposing database schema through SQL-related error details.
 * Matches common SQL keywords when they appear in error contexts.
 */
export const QUERY_PATTERN: RegExp =
  /(?:SELECT|INSERT|UPDATE|DELETE|CREATE|DROP|ALTER)\s+.{0,200}/gi;

// ============================================================
// Sanitization Functions
// ============================================================

/**
 * Sanitizes an error of any type into a safe string message.
 *
 * Handles Error objects, strings, and unknown types. Applies all
 * sensitive pattern replacements to ensure no credentials, connection
 * strings, or other sensitive data appears in the output.
 *
 * The original error is logged at debug level (with full details)
 * for internal debugging, while the sanitized version is returned
 * for external consumption.
 *
 * @param error - The error to sanitize (Error object, string, or unknown)
 * @param context - Optional context string for logging (e.g., 'api-players')
 * @returns A sanitized error message safe for client display
 *
 * @example
 *   try { await db.query(...) } catch (error) {
 *     const safe = sanitizeError(error, 'player-lookup');
 *     return { error: safe };
 *   }
 */
export function sanitizeError(error: unknown, context?: string): string {
  // Extract the raw error message from the various error types
  let message: string;

  if (error instanceof Error) {
    message = error.message;
  } else if (typeof error === 'string') {
    message = error;
  } else {
    // For completely unknown types, use a generic message
    // to avoid calling toString() on potentially dangerous objects
    message = 'An unexpected error occurred';
  }

  // Log the original unsanitized error internally for debugging.
  // This preserves full error details in server logs while keeping
  // the client-facing message clean.
  if (context) {
    logger.debug('Sanitizing error', { context, originalMessage: message });
  }

  // Apply all sensitive pattern replacements sequentially.
  // Each pattern replaces matched content with a generic placeholder
  // so the error structure is preserved but sensitive values are hidden.
  let sanitized = message;

  // Replace credential and connection string patterns
  for (const pattern of SENSITIVE_PATTERNS) {
    sanitized = sanitized.replace(pattern, '[REDACTED]');
  }

  // Replace email addresses to protect user privacy
  sanitized = sanitized.replace(EMAIL_PATTERN, '[EMAIL_REDACTED]');

  // Replace IP addresses to prevent network topology leakage
  sanitized = sanitized.replace(IP_PATTERN, '[IP_REDACTED]');

  // Replace file paths to prevent server structure disclosure
  sanitized = sanitized.replace(FILE_PATH_PATTERN, '[PATH_REDACTED]');

  // Replace SQL fragments to prevent schema disclosure
  sanitized = sanitized.replace(QUERY_PATTERN, '[QUERY_REDACTED]');

  return sanitized;
}

/**
 * Creates a safe error response object suitable for API responses.
 *
 * Combines a user-friendly message with the sanitized original error.
 * The user-facing message is shown to the client, while the sanitized
 * technical details are included for debugging but safe from leakage.
 *
 * @param error - The original error (any type)
 * @param userMessage - The user-friendly message to display
 * @param context - Optional context for logging
 * @returns An object with success=false, the user message, and sanitized details
 *
 * @example
 *   catch (error) {
 *     const safe = createSafeError(error, 'Failed to update player', 'api-players');
 *     return NextResponse.json(safe, { status: 500 });
 *   }
 */
export function createSafeError(
  error: unknown,
  userMessage: string,
  context?: string
): { success: false; error: string; details?: string } {
  // Sanitize the original error for safe inclusion in response
  const sanitizedDetails = sanitizeError(error, context);

  // Log the full error at error level for server-side diagnostics.
  // The original error object preserves stack traces and other details
  // that are invaluable for debugging but unsafe for clients.
  logger.error('Creating safe error response', {
    context,
    userMessage,
    sanitizedDetails,
  });

  return {
    success: false as const,
    error: userMessage,
    // Only include sanitized details if they differ from the user message
    // to avoid redundant information in the response
    ...(sanitizedDetails !== userMessage && { details: sanitizedDetails }),
  };
}

/**
 * Sanitizes database-specific errors with additional handling for
 * Prisma error codes and PostgreSQL error details.
 *
 * Database errors often contain connection strings, table names,
 * column details, and query fragments that should not be exposed.
 * This function applies extra sanitization specific to DB errors.
 *
 * @param error - The database error (typically a PrismaClientKnownRequestError)
 * @param context - Optional context for logging
 * @returns A sanitized, user-friendly database error message
 *
 * @example
 *   catch (error) {
 *     if (error instanceof Prisma.PrismaClientKnownRequestError) {
 *       const safe = sanitizeDatabaseError(error, 'player-create');
 *     }
 *   }
 */
export function sanitizeDatabaseError(
  error: unknown,
  context?: string
): string {
  // First apply general sanitization to catch common patterns
  const baseSanitized = sanitizeError(error, context);

  // Check for Prisma-specific error properties that may contain
  // additional sensitive details (meta, clientVersion, etc.)
  if (error && typeof error === 'object' && 'code' in error) {
    const prismaError = error as { code: string; meta?: Record<string, unknown> };

    // Map common Prisma error codes to user-friendly messages.
    // These codes are well-documented and safe to handle explicitly.
    // See: https://www.prisma.io/docs/reference/api-reference/error-reference
    switch (prismaError.code) {
      case 'P2002':
        // Unique constraint violation - do not expose which field(s)
        return 'A record with this value already exists';
      case 'P2003':
        // Foreign key constraint - do not expose relationship details
        return 'Related record not found';
      case 'P2025':
        // Record not found for update/delete
        return 'Record not found';
      case 'P2024':
        // Connection pool timeout - do not expose pool configuration
        return 'Database temporarily unavailable';
      case 'P2028':
        // Transaction API error
        return 'Database transaction failed';
      default:
        // For unrecognized Prisma codes, return the base sanitized message
        // since it has already had sensitive patterns removed
        logger.warn('Unhandled Prisma error code', {
          code: prismaError.code,
          context,
        });
        return baseSanitized;
    }
  }

  return baseSanitized;
}

/**
 * Sanitizes validation errors by extracting only the field names
 * and validation messages, stripping any values that were rejected.
 *
 * Validation errors can contain the actual input values that failed
 * validation, which may include passwords, tokens, or other sensitive
 * data that the user provided.
 *
 * @param error - The validation error (typically a ZodError or similar)
 * @returns A sanitized validation error message listing field issues
 *
 * @example
 *   catch (error) {
 *     if (error instanceof z.ZodError) {
 *       const safe = sanitizeValidationError(error);
 *       return NextResponse.json({ error: safe }, { status: 400 });
 *     }
 *   }
 */
export function sanitizeValidationError(error: unknown): string {
  // Handle Zod validation errors which have an 'issues' array property
  if (
    error &&
    typeof error === 'object' &&
    'issues' in error &&
    Array.isArray((error as { issues: unknown[] }).issues)
  ) {
    const issues = (error as { issues: Array<{ path: (string | number)[]; message: string }> }).issues;

    // Extract only field paths and validation messages, NOT the rejected values.
    // This prevents sensitive input (like passwords) from appearing in error responses.
    const sanitizedIssues = issues.map((issue) => {
      const fieldPath = issue.path.join('.');
      return fieldPath
        ? `${fieldPath}: ${issue.message}`
        : issue.message;
    });

    return `Validation failed: ${sanitizedIssues.join('; ')}`;
  }

  // For non-Zod validation errors, apply general sanitization
  return sanitizeError(error, 'validation');
}
