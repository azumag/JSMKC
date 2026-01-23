import { prisma } from '@/lib/prisma';
import { sanitizeInput } from '@/lib/sanitize';

export interface AuditLogParams {
  userId?: string;
  ipAddress: string;
  userAgent: string;
  action: string;
  targetId?: string;
  targetType?: string;
  details?: Record<string, unknown>;
}

export async function createAuditLog(params: AuditLogParams) {
  try {
    return await prisma.auditLog.create({
      data: {
        userId: params.userId,
        ipAddress: params.ipAddress,
        userAgent: params.userAgent,
        action: params.action,
        targetId: params.targetId,
        targetType: params.targetType,
        details: params.details ? JSON.parse(JSON.stringify(sanitizeInput(params.details))) : undefined,
      },
    });
  } catch (error) {
    console.error(
      'Audit log creation failed - Action: %s, User: %s, Target: %s/%s, IP: %s, Error: %s',
      params.action,
      params.userId || 'anonymous',
      params.targetType || 'N/A',
      params.targetId || 'N/A',
      params.ipAddress,
      error instanceof Error ? error.message : 'Unknown error'
    );
    return undefined;
  }
}

export const AUDIT_ACTIONS = {
  CREATE_TOURNAMENT: 'CREATE_TOURNAMENT',
  UPDATE_TOURNAMENT: 'UPDATE_TOURNAMENT',
  DELETE_TOURNAMENT: 'DELETE_TOURNAMENT',
  CREATE_PLAYER: 'CREATE_PLAYER',
  UPDATE_PLAYER: 'UPDATE_PLAYER',
  DELETE_PLAYER: 'DELETE_PLAYER',
  CREATE_TA_ENTRY: 'CREATE_TA_ENTRY',
  UPDATE_TA_ENTRY: 'UPDATE_TA_ENTRY',
  DELETE_TA_ENTRY: 'DELETE_TA_ENTRY',
  CREATE_BM_MATCH: 'CREATE_BM_MATCH',
  UPDATE_BM_MATCH: 'UPDATE_BM_MATCH',
  DELETE_BM_MATCH: 'DELETE_BM_MATCH',
  CREATE_MR_MATCH: 'CREATE_MR_MATCH',
  UPDATE_MR_MATCH: 'UPDATE_MR_MATCH',
  DELETE_MR_MATCH: 'DELETE_MR_MATCH',
  CREATE_BRACKET: 'CREATE_BRACKET',
  REGENERATE_TOKEN: 'REGENERATE_TOKEN',
  INVALIDATE_TOKEN: 'INVALIDATE_TOKEN',
  LOGIN_SUCCESS: 'LOGIN_SUCCESS',
  LOGIN_FAILURE: 'LOGIN_FAILURE',
  UNAUTHORIZED_ACCESS: 'UNAUTHORIZED_ACCESS',
} as const;

export type AuditAction = typeof AUDIT_ACTIONS[keyof typeof AUDIT_ACTIONS];