import { createLogger } from './logger';

const log = createLogger('error-sanitization');

// Sensitive information patterns to remove
const SENSITIVE_PATTERNS = [
  /password[^a-zA-Z0-9]*/gi,
  /secret[^a-zA-Z0-9]*/gi,
  /token[^a-zA-Z0-9]*/gi,
  /key[^a-zA-Z0-9]*/gi,
  /auth[^a-zA-Z0-9]*/gi,
  /database[^a-zA-Z0-9]*/gi,
  /connection[^a-zA-Z0-9]*/gi,
  /postgresql:\/\/[^@\s]*@/gi,
  /mysql:\/\/[^@\s]*@/gi,
  /mongodb:\/\/[^@\s]*@/gi,
];

// Email pattern to redact
const EMAIL_PATTERN = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;

// IP address pattern to redact
const IP_PATTERN = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g;

// File path pattern to redact
const FILE_PATH_PATTERN = /\/[^\s]*\.(ts|js|json|env|sql|db|log)/gi;

// Database query pattern to redact
const QUERY_PATTERN = /(SELECT|INSERT|UPDATE|DELETE|CREATE|DROP|ALTER)[\s\S]*?(;|$)/gi;

/**
 * Sanitizes error messages to remove sensitive information
 * @param error - The error object or message to sanitize
 * @param context - Optional context about where the error occurred
 * @returns Sanitized error message safe for logging/display
 * 
 * @example
 * ```typescript
 * const error = new Error('Database connection failed: postgresql://user:pass@host/db');
 * const sanitized = sanitizeError(error, 'users endpoint');
 * // Returns: "[users endpoint] Database connection failed: [REDACTED_DB_PATH]"
 * ```
 */
export function sanitizeError(error: unknown, context?: string): string {
  try {
    let errorMessage = '';

    if (error instanceof Error) {
      errorMessage = error.message;
    } else if (typeof error === 'string') {
      errorMessage = error;
    } else if (error && typeof error === 'object') {
      errorMessage = JSON.stringify(error);
    } else {
      errorMessage = String(error);
    }

    // Remove sensitive patterns
    let sanitized = errorMessage;
    
    for (const pattern of SENSITIVE_PATTERNS) {
      sanitized = sanitized.replace(pattern, '[REDACTED]');
    }

    // Redact email addresses
    sanitized = sanitized.replace(EMAIL_PATTERN, '[REDACTED_EMAIL]');

    // Redact IP addresses
    sanitized = sanitized.replace(IP_PATTERN, '[REDACTED_IP]');

    // Redact file paths
    sanitized = sanitized.replace(FILE_PATH_PATTERN, '[REDACTED_PATH]');

    // Redact database queries (partial redaction to keep structure)
    sanitized = sanitized.replace(QUERY_PATTERN, (match) => {
      return match.replace(/['"`][^'"`]*['"`]/g, "'[REDACTED_VALUE]'");
    });

    // Truncate very long error messages
    if (sanitized.length > 1000) {
      sanitized = sanitized.substring(0, 1000) + '... [TRUNCATED]';
    }

    // Add context if provided
    if (context) {
      sanitized = `[${context}] ${sanitized}`;
    }

    log.debug('Error sanitized', { originalLength: errorMessage.length, sanitizedLength: sanitized.length });

    return sanitized;
  } catch (sanitizationError) {
    log.error('Failed to sanitize error:', sanitizationError);
    return 'An error occurred (sanitization failed)';
  }
}

/**
 * Create a safe error response for client consumption
 * @param error - The original error
 * @param userMessage - User-friendly message to display
 * @param context - Context where the error occurred
 * @returns Safe error object
 */
export function createSafeError(
  error: unknown,
  userMessage: string = 'An unexpected error occurred',
  context?: string
): { userMessage: string; logMessage: string } {
  const logMessage = sanitizeError(error, context);
  
  return {
    userMessage,
    logMessage,
  };
}

/**
 * Sanitize database error specifically
 * @param error - Database error
 * @param context - Context (e.g., 'players endpoint', 'tournaments endpoint')
 * @returns Sanitized database error message
 */
export function sanitizeDatabaseError(error: unknown, context: string): string {
  const sanitized = sanitizeError(error, `Database error in ${context}`);
  
  // Additional database-specific sanitization
  const dbSpecificPatterns = [
    /PrismaClientKnownRequestError.*?code: ['"`]([^'"`]+)['"`]/gi,
    /relation ["`']([^'"`]+)["`'] does not exist/gi,
    /column ["`']([^'"`]+)["`'] does not exist/gi,
    /foreign key constraint fails/gi,
    /duplicate key value violates unique constraint/gi,
  ];

  let finalSanitized = sanitized;
  
  for (const pattern of dbSpecificPatterns) {
    finalSanitized = finalSanitized.replace(pattern, (match, p1) => {
      if (p1) {
        return match.replace(p1, '[REDACTED_IDENTIFIER]');
      }
      return match.replace(/constraint|relation|column/gi, '[REDACTED_DB_ENTITY]');
    });
  }

  return finalSanitized;
}

/**
 * Sanitize validation error messages
 * @param error - Validation error
 * @returns Sanitized validation error message
 */
export function sanitizeValidationError(error: unknown): string {
  const sanitized = sanitizeError(error);
  
  // Remove any field-specific sensitive information from validation errors
  return sanitized.replace(/field[^a-zA-Z0-9]*[^a-zA-Z0-9\s]*/gi, 'field');
}