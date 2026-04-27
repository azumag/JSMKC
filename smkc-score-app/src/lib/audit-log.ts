/**
 * Audit Logging Utilities
 *
 * Records security-relevant and administrative actions to the database
 * for compliance, debugging, and incident investigation purposes.
 *
 * Every significant action in JSMKC is audit-logged:
 * - Tournament CRUD operations
 * - Player management
 * - Match score updates
 * - Authentication events (login success/failure)
 * - Token generation and invalidation
 * - Unauthorized access attempts
 *
 * Design decisions:
 * - Audit logging NEVER blocks the primary operation (fail-silent)
 * - All input is sanitized before logging to prevent log injection
 * - Logs include IP address and user agent for forensics
 * - The AuditLog model in Prisma has indexes on timestamp, userId,
 *   action, and targetType+targetId for efficient querying
 *
 * Usage:
 *   import { createAuditLog, AUDIT_ACTIONS } from '@/lib/audit-log';
 *   await createAuditLog({
 *     userId: session.user.id,
 *     ipAddress: clientIp,
 *     userAgent: request.headers.get('user-agent'),
 *     action: AUDIT_ACTIONS.CREATE_TOURNAMENT,
 *     targetId: tournament.id,
 *     targetType: 'Tournament',
 *   });
 */

import type { Session } from 'next-auth';
import prisma from '@/lib/prisma';
import { createLogger } from '@/lib/logger';

/**
 * Logger scoped to audit logging operations
 */
const logger = createLogger('audit-log');

/**
 * Maximum length for audit log string fields.
 * Prevents excessive storage usage and long-field issues in logs.
 */
const MAX_AUDIT_LOG_FIELD_LENGTH = 500;

/**
 * Sanitizes a string for safe inclusion in audit logs.
 *
 * Unlike sanitizeInput (XSS prevention), this function targets log injection
 * attacks which use:
 * - Newlines and line breaks to fake structured log entries
 * - Control characters to corrupt log parsers
 * - ANSI escape sequences to colorize fake log entries
 *
 * This function does NOT perform HTML encoding because audit logs are
 * stored in database tables, not rendered in HTML contexts.
 *
 * @param str - Raw string to sanitize for audit logging
 * @param maxLength - Maximum allowed length (default 500)
 * @returns Sanitized string safe for audit logs
 */
function sanitizeForAuditLog(str: string, maxLength = MAX_AUDIT_LOG_FIELD_LENGTH): string {
  if (!str) return '';

  return str
    // Strip ANSI escape sequences FIRST — the control-character pass below
    // includes ESC (0x1B) in its range, which would otherwise eat the ESC
    // byte and leave the trailing `[31m ... [0m` as plain text.
    .replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '')
    // Remove control characters including LF (0x0A) and CR (0x0D)
    // which are the primary vectors for log injection attacks
    .replace(/[\x00-\x08\x0A-\x0D\x0E-\x1F\x7F]/g, '')
    // Trim whitespace and limit length
    .trim()
    .slice(0, maxLength);
}

/**
 * Sanitizes an object for safe inclusion in audit logs.
 * Recursively processes all string values within the object.
 *
 * @param obj - Object to sanitize for audit logging
 * @param maxLength - Maximum allowed length per field (default 500)
 * @returns Sanitized object with all string values sanitized
 */
function sanitizeObjectForAuditLog(
  obj: Record<string, unknown>,
  maxLength = MAX_AUDIT_LOG_FIELD_LENGTH
): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      sanitized[key] = sanitizeForAuditLog(value, maxLength);
    } else if (Array.isArray(value)) {
      sanitized[key] = value.map((item) =>
        typeof item === 'string' ? sanitizeForAuditLog(item, maxLength) : item
      );
    } else if (value !== null && typeof value === 'object') {
      sanitized[key] = sanitizeObjectForAuditLog(value as Record<string, unknown>, maxLength);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

// ============================================================
// Helpers
// ============================================================

/**
 * Resolves the userId to store in AuditLog from a NextAuth session.
 *
 * Admin sessions (Discord OAuth) carry a real User.id; player sessions
 * (credential-based) carry a Player.id which has no User FK and would cause
 * a FK violation on AuditLog.userId (#734). Returns undefined for player
 * sessions so the audit log row stores NULL instead.
 */
export function resolveAuditUserId(session: Session | null | undefined): string | undefined {
  if (!session?.user) return undefined;
  if (session.user.userType === 'player') return undefined;
  return session.user.id ?? undefined;
}

// ============================================================
// Types
// ============================================================

/**
 * Parameters for creating an audit log entry.
 *
 * All parameters except userId are required to ensure complete
 * audit trails. userId is optional for anonymous actions (e.g.,
 * token-based score entry by participants without accounts).
 */
export interface AuditLogParams {
  /** The user ID who performed the action (null for anonymous) */
  userId?: string;
  /** The IP address of the client */
  ipAddress: string;
  /** The User-Agent string of the client */
  userAgent: string;
  /** The action performed (use AUDIT_ACTIONS constants) */
  action: string;
  /** The ID of the target resource (e.g., tournament ID, player ID) */
  targetId?: string;
  /** The type of the target resource (e.g., 'Tournament', 'Player') */
  targetType?: string;
  /** Additional details about the action (JSON-serializable) */
  details?: Record<string, unknown>;
}

// ============================================================
// Audit Log Creation
// ============================================================

/**
 * Creates an audit log entry in the database.
 *
 * This function is designed to NEVER throw or block the calling operation.
 * If the audit log creation fails (database error, validation issue, etc.),
 * the error is logged but the calling operation continues normally.
 *
 * This fail-silent design ensures that audit logging infrastructure
 * issues don't cause user-facing errors in the application.
 *
 * Input sanitization is applied to all string fields to prevent
 * log injection attacks where malicious input could corrupt audit logs
 * or exploit log viewing tools.
 *
 * @param params - The audit log parameters
 *
 * @example
 *   // Log a tournament creation
 *   await createAuditLog({
 *     userId: session.user.id,
 *     ipAddress: getClientIdentifier(request),
 *     userAgent: getUserAgent(request),
 *     action: AUDIT_ACTIONS.CREATE_TOURNAMENT,
 *     targetId: newTournament.id,
 *     targetType: 'Tournament',
 *     details: { name: newTournament.name },
 *   });
 *
 *   // Log a failed login attempt (no userId)
 *   await createAuditLog({
 *     ipAddress: getClientIdentifier(request),
 *     userAgent: getUserAgent(request),
 *     action: AUDIT_ACTIONS.LOGIN_FAILURE,
 *     details: { reason: 'Invalid credentials' },
 *   });
 */
export async function createAuditLog(params: AuditLogParams): Promise<void> {
  try {
    // Sanitize all string inputs to prevent log injection attacks.
    // Unlike sanitizeInput (XSS prevention), this targets log injection
    // which uses newlines, control characters, and ANSI escapes.
    const sanitizedIpAddress = sanitizeForAuditLog(params.ipAddress);
    const sanitizedUserAgent = sanitizeForAuditLog(params.userAgent);
    const sanitizedAction = sanitizeForAuditLog(params.action);

    // Sanitize optional fields only when present
    const sanitizedTargetId = params.targetId
      ? sanitizeForAuditLog(params.targetId)
      : undefined;
    const sanitizedTargetType = params.targetType
      ? sanitizeForAuditLog(params.targetType)
      : undefined;

    // Sanitize the details object if provided.
    // This recursively sanitizes all string values within the JSON.
    const sanitizedDetails = params.details
      ? sanitizeObjectForAuditLog(params.details)
      : undefined;

    // Create the audit log entry in the database.
    // The AuditLog model has indexes on timestamp, userId, action,
    // and (targetType, targetId) for efficient querying.
    await prisma.auditLog.create({
      data: {
        userId: params.userId || null,
        ipAddress: sanitizedIpAddress,
        userAgent: sanitizedUserAgent,
        action: sanitizedAction,
        targetId: sanitizedTargetId,
        targetType: sanitizedTargetType,
        details: sanitizedDetails ? JSON.parse(JSON.stringify(sanitizedDetails)) : undefined,
      },
    });

    logger.debug('Audit log created', {
      action: sanitizedAction,
      targetType: sanitizedTargetType,
      targetId: sanitizedTargetId,
    });
  } catch (error) {
    // CRITICAL: Never let audit logging failures bubble up to the caller.
    // The primary operation must succeed regardless of audit logging status.
    // We log the failure for operations teams to investigate.
    logger.error('Failed to create audit log', {
      action: params.action,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

// ============================================================
// Audit Action Constants
// ============================================================

/**
 * Predefined audit action type constants.
 *
 * Using constants instead of raw strings ensures:
 * - Consistent action naming across the codebase
 * - TypeScript autocompletion support
 * - Easier searching/filtering of audit logs by action type
 * - Compile-time detection of typos in action names
 *
 * Action naming convention: VERB_RESOURCE
 * Verbs: CREATE, UPDATE, DELETE
 * Resources: TOURNAMENT, PLAYER, TA, BM, MR (match types)
 * Special: CREATE_BRACKET, LOGIN_*, UNAUTHORIZED_ACCESS
 */
export const AUDIT_ACTIONS = {
  // Tournament lifecycle actions
  /** A new tournament was created by an admin */
  CREATE_TOURNAMENT: 'CREATE_TOURNAMENT',
  /** Tournament details (name, date, status) were updated */
  UPDATE_TOURNAMENT: 'UPDATE_TOURNAMENT',
  /** A tournament was deleted by an admin */
  DELETE_TOURNAMENT: 'DELETE_TOURNAMENT',

  // Player management actions
  /** A new player was registered in the system */
  CREATE_PLAYER: 'CREATE_PLAYER',
  /** Player details (name, nickname, country) were updated */
  UPDATE_PLAYER: 'UPDATE_PLAYER',
  /** A player was deleted from the system */
  DELETE_PLAYER: 'DELETE_PLAYER',
  /** A player's password was regenerated by admin */
  RESET_PLAYER_PASSWORD: 'RESET_PLAYER_PASSWORD',

  // Time Attack (TA) actions
  /** A TA time entry was created or initial times submitted */
  CREATE_TA_ENTRY: 'CREATE_TA_ENTRY',
  /** TA times were updated (re-submission or correction) */
  UPDATE_TA_ENTRY: 'UPDATE_TA_ENTRY',
  /** A TA entry was deleted */
  DELETE_TA_ENTRY: 'DELETE_TA_ENTRY',

  // Battle Mode (BM) actions
  /** A BM match was created (qualification or finals) */
  CREATE_BM_MATCH: 'CREATE_BM_MATCH',
  /** A BM match score was updated */
  UPDATE_BM_MATCH: 'UPDATE_BM_MATCH',
  /** A BM match was deleted */
  DELETE_BM_MATCH: 'DELETE_BM_MATCH',

  // Match Race (MR) actions
  /** An MR match was created (qualification or finals) */
  CREATE_MR_MATCH: 'CREATE_MR_MATCH',
  /** An MR match score was updated */
  UPDATE_MR_MATCH: 'UPDATE_MR_MATCH',
  /** An MR match was deleted */
  DELETE_MR_MATCH: 'DELETE_MR_MATCH',

  // Grand Prix (GP) actions
  /** A GP match was created (qualification setup) */
  CREATE_GP_MATCH: 'CREATE_GP_MATCH',

  // Bracket management actions
  /** A finals bracket was generated (double elimination) */
  CREATE_BRACKET: 'CREATE_BRACKET',

  // Debug-mode actions (only available on tournaments with debugMode === true)
  /** Admin auto-filled qualification scores for a debug tournament */
  DEBUG_FILL_SCORES: 'DEBUG_FILL_SCORES',

  // Authentication events
  /** A user successfully authenticated via OAuth */
  LOGIN_SUCCESS: 'LOGIN_SUCCESS',
  /** An authentication attempt failed (wrong credentials, etc.) */
  LOGIN_FAILURE: 'LOGIN_FAILURE',

  // Authorization events
  /** An authenticated user attempted an action they don't have permission for */
  UNAUTHORIZED_ACCESS: 'UNAUTHORIZED_ACCESS',
} as const;

/**
 * Type representing valid audit action strings.
 * Derived from the AUDIT_ACTIONS constant object values.
 *
 * @example
 *   function logAction(action: AuditAction) { ... }
 *   logAction(AUDIT_ACTIONS.CREATE_TOURNAMENT); // OK
 *   logAction('INVALID_ACTION'); // TypeScript error
 */
export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];
