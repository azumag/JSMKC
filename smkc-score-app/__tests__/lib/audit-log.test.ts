/**
 * @jest-environment jsdom
 */

/**
 * @module __tests__/lib/audit-log.test.ts
 * @description Test suite for the audit logging utility from `@/lib/audit-log`.
 *
 * Tests cover:
 * - Successful audit log creation with all fields
 * - Log injection prevention (removing LF, CR, control chars, ANSI escapes)
 * - Recursive sanitization of object values in details
 * - Maximum field length enforcement
 * - Graceful error handling (fire-and-forget pattern)
 * - Anonymous user handling when userId is absent
 */
jest.mock('@/lib/logger', () => {
  const auditLogger = {
    debug: jest.fn(),
    error: jest.fn(),
  };
  return {
    createLogger: jest.fn(() => auditLogger),
    __auditLogger: auditLogger,
  };
});

import { createAuditLog, createAuditLogs, AUDIT_ACTIONS } from '@/lib/audit-log';
import { prisma as prismaMock } from '@/lib/prisma';

const loggerModuleMock = jest.requireMock('@/lib/logger') as {
  __auditLogger: { debug: jest.Mock; error: jest.Mock };
};

describe('Audit Log', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (prismaMock.auditLog.create as any).mockResolvedValue({
      id: 'audit-1',
      userId: 'user-123',
      ipAddress: '192.168.1.1',
      userAgent: 'Mozilla/5.0',
      action: AUDIT_ACTIONS.CREATE_TOURNAMENT,
      targetId: 'tournament-456',
      targetType: 'Tournament',
      details: { test: 'data' },
    });
    (prismaMock.auditLog.createMany as any).mockResolvedValue({ count: 2 });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createAuditLog', () => {
    it('should create audit log successfully', async () => {
      const params = {
        userId: 'user-123',
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
        action: AUDIT_ACTIONS.CREATE_TOURNAMENT,
        targetId: 'tournament-456',
        targetType: 'Tournament',
        details: { test: 'data' },
      };

      const result = await createAuditLog(params);

      expect(prismaMock.auditLog.create).toHaveBeenCalledWith({
        data: {
          userId: params.userId,
          ipAddress: params.ipAddress,
          userAgent: params.userAgent,
          action: params.action,
          targetId: params.targetId,
          targetType: params.targetType,
          details: JSON.parse(JSON.stringify(params.details)),
        },
      });
      expect(result).toBeUndefined();
    });

    it('should remove newlines and control characters from ipAddress', async () => {
      const params = {
        ipAddress: '192.168.1.1\n[FAKE_LOG_ENTRY]',
        userAgent: 'Mozilla/5.0',
        action: AUDIT_ACTIONS.CREATE_TOURNAMENT,
      };

      await createAuditLog(params);

      const call = (prismaMock.auditLog.create as any).mock.calls[0][0];
      expect(call.data.ipAddress).toBe('192.168.1.1[FAKE_LOG_ENTRY]');
    });

    it('should remove carriage return from userAgent', async () => {
      const params = {
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0\r\n[INJECTED]',
        action: AUDIT_ACTIONS.CREATE_TOURNAMENT,
      };

      await createAuditLog(params);

      const call = (prismaMock.auditLog.create as any).mock.calls[0][0];
      expect(call.data.userAgent).toBe('Mozilla/5.0[INJECTED]');
    });

    it('should remove ANSI escape sequences', async () => {
      const params = {
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
        action: AUDIT_ACTIONS.CREATE_TOURNAMENT,
        details: { userAgent: '\x1B[31mRed Text\x1B[0m' },
      };

      await createAuditLog(params);

      const call = (prismaMock.auditLog.create as any).mock.calls[0][0];
      expect(call.data.details.userAgent).toBe('Red Text');
    });

    it('should recursively sanitize details object', async () => {
      const params = {
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
        action: AUDIT_ACTIONS.CREATE_TOURNAMENT,
        details: {
          player: 'John\n[FAKE_LOG]',
          score: 100,
          nested: { message: 'Test\r\nInjection' },
        },
      };

      await createAuditLog(params);

      const call = (prismaMock.auditLog.create as any).mock.calls[0][0];
      expect(call.data.details.player).toBe('John[FAKE_LOG]');
      expect(call.data.details.score).toBe(100);
      expect(call.data.details.nested.message).toBe('TestInjection');
    });

    it('should trim and limit field length to 500 chars', async () => {
      const longString = 'A'.repeat(600);
      const params = {
        ipAddress: longString,
        userAgent: 'Mozilla/5.0',
        action: AUDIT_ACTIONS.CREATE_TOURNAMENT,
      };

      await createAuditLog(params);

      const call = (prismaMock.auditLog.create as any).mock.calls[0][0];
      expect(call.data.ipAddress.length).toBe(500);
    });

    it('should handle empty strings', async () => {
      const params = {
        ipAddress: '',
        userAgent: '',
        action: AUDIT_ACTIONS.CREATE_TOURNAMENT,
      };

      const result = await createAuditLog(params);
      expect(result).toBeUndefined();
    });

    it('should handle errors gracefully and return undefined', async () => {
      const params = {
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
        action: AUDIT_ACTIONS.CREATE_TOURNAMENT,
      };

      (prismaMock.auditLog.create as any).mockRejectedValue(new Error('Database connection failed'));

      const result = await createAuditLog(params);

      expect(result).toBeUndefined();
    });

    it('should create log without optional fields', async () => {
      const params = {
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
        action: AUDIT_ACTIONS.LOGIN_FAILURE,
      };

      const result = await createAuditLog(params);

      expect(prismaMock.auditLog.create).toHaveBeenCalledWith({
        data: {
          userId: null,
          ipAddress: params.ipAddress,
          userAgent: params.userAgent,
          action: params.action,
          targetId: undefined,
          targetType: undefined,
          details: undefined,
        },
      });
      expect(result).toBeUndefined();
    });

    it('should use null for missing userId', async () => {
      const params = {
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
        action: AUDIT_ACTIONS.UNAUTHORIZED_ACCESS,
      };

      await createAuditLog(params);

      const call = (prismaMock.auditLog.create as any).mock.calls[0][0];
      expect(call.data.userId).toBeNull();
    });

    it('should handle null details', async () => {
      const params = {
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
        action: AUDIT_ACTIONS.CREATE_TOURNAMENT,
        details: undefined,
      };

      const result = await createAuditLog(params);
      expect(result).toBeUndefined();
    });
  });

  describe('createAuditLogs', () => {
    it('should return early for an empty list', async () => {
      const result = await createAuditLogs([]);

      expect(result).toBeUndefined();
      expect(prismaMock.auditLog.createMany).not.toHaveBeenCalled();
    });

    it('should create sanitized audit logs in bulk', async () => {
      await createAuditLogs([
        {
          userId: 'user-123',
          ipAddress: '192.168.1.1\n[FAKE]',
          userAgent: 'Mozilla/5.0\r\n[INJECTED]',
          action: AUDIT_ACTIONS.CREATE_TA_ENTRY,
          targetId: 'entry-1',
          targetType: 'TTEntry',
          details: { playerNickname: 'Player\x1B[31mRed\x1B[0m' },
        },
        {
          ipAddress: '10.0.0.1',
          userAgent: 'Agent',
          action: AUDIT_ACTIONS.DELETE_TA_ENTRY,
        },
      ]);

      expect(prismaMock.auditLog.createMany).toHaveBeenCalledWith({
        data: [
          {
            userId: 'user-123',
            ipAddress: '192.168.1.1[FAKE]',
            userAgent: 'Mozilla/5.0[INJECTED]',
            action: AUDIT_ACTIONS.CREATE_TA_ENTRY,
            targetId: 'entry-1',
            targetType: 'TTEntry',
            details: { playerNickname: 'PlayerRed' },
          },
          {
            userId: null,
            ipAddress: '10.0.0.1',
            userAgent: 'Agent',
            action: AUDIT_ACTIONS.DELETE_TA_ENTRY,
            targetId: undefined,
            targetType: undefined,
            details: undefined,
          },
        ],
      });
      expect(loggerModuleMock.__auditLogger.debug).toHaveBeenCalledWith('Audit logs created', { count: 2 });
    });

    it('should not throw when bulk audit creation fails', async () => {
      (prismaMock.auditLog.createMany as any).mockRejectedValue(new Error('Database connection failed'));

      const result = await createAuditLogs([
        {
          ipAddress: '192.168.1.1',
          userAgent: 'Mozilla/5.0',
          action: AUDIT_ACTIONS.CREATE_TA_ENTRY,
        },
      ]);

      expect(result).toBeUndefined();
      expect(loggerModuleMock.__auditLogger.error).toHaveBeenCalledWith(
        'Failed to create audit logs',
        {
          count: 1,
          error: 'Database connection failed',
        }
      );
    });
  });
});
