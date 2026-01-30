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

import prisma from '@/lib/prisma';
import { sanitizeInput } from '@/lib/sanitize';
import { createLogger } from '@/lib/logger';

/** Logger scoped to audit logging operations */
const logger = createLogger('audit-log');

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
    // Log injection occurs when attackers include newlines, control
    // characters, or HTML in logged values to corrupt log files
    // or exploit log viewing dashboards.
    const sanitizedIpAddress = sanitizeInput(params.ipAddress);
    const sanitizedUserAgent = sanitizeInput(params.userAgent);
    const sanitizedAction = sanitizeInput(params.action);

    // Sanitize optional fields only when present
    const sanitizedTargetId = params.targetId
      ? sanitizeInput(params.targetId)
      : undefined;
    const sanitizedTargetType = params.targetType
      ? sanitizeInput(params.targetType)
      : undefined;

    // Sanitize the details object if provided.
    // This recursively sanitizes all string values within the JSON.
    const sanitizedDetails = params.details
      ? sanitizeInput(params.details)
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
 * Special: CREATE_BRACKET, REGENERATE_TOKEN, INVALIDATE_TOKEN, LOGIN_*, UNAUTHORIZED_ACCESS
 */
export const AUDIT_ACTIONS = {
  // Tournament lifecycle actions
  /** A new tournament was created by an admin */
  CREATE_TOURNAMENT: 'CREATE_TOURNAMENT',
  /** Tournament details (name, date, status) were updated */
  UPDATE_TOURNAMENT: 'UPDATE_TOURNAMENT',
  /** A tournament was soft-deleted by an admin */
  DELETE_TOURNAMENT: 'DELETE_TOURNAMENT',

  // Player management actions
  /** A new player was registered in the system */
  CREATE_PLAYER: 'CREATE_PLAYER',
  /** Player details (name, nickname, country) were updated */
  UPDATE_PLAYER: 'UPDATE_PLAYER',
  /** A player was soft-deleted from the system */
  DELETE_PLAYER: 'DELETE_PLAYER',

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

  // Bracket and token management actions
  /** A finals bracket was generated (double elimination) */
  CREATE_BRACKET: 'CREATE_BRACKET',
  /** A tournament access token was regenerated */
  REGENERATE_TOKEN: 'REGENERATE_TOKEN',
  /** A tournament access token was invalidated/expired */
  INVALIDATE_TOKEN: 'INVALIDATE_TOKEN',

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
