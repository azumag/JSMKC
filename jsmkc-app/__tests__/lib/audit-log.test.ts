import { createAuditLog, AUDIT_ACTIONS } from '@/lib/audit-log';

jest.mock('@/lib/prisma');
jest.mock('@/lib/sanitize');

describe('Audit Log', () => {
  let mockPrisma: any;
  let mockSanitizeInput: jest.Mock;

  beforeEach(() => {
    mockPrisma = {
      auditLog: {
        create: jest.fn(),
      },
    };
    mockSanitizeInput = require('@/lib/sanitize').sanitizeInput as jest.Mock;
    mockSanitizeInput.mockImplementation((input) => input);
    require('@/lib/prisma').prisma = mockPrisma;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

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

    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
      data: {
        userId: params.userId,
        ipAddress: params.ipAddress,
        userAgent: params.userAgent,
        action: params.action,
        targetId: params.targetId,
        targetType: params.targetType,
        details: JSON.parse(JSON.stringify(mockSanitizeInput(params.details))),
      },
    });
    expect(result).toBeDefined();
  });

  it('should sanitize details before creating log', async () => {
    const params = {
      userId: 'user-123',
      ipAddress: '192.168.1.1',
      userAgent: 'Mozilla/5.0',
      action: AUDIT_ACTIONS.CREATE_TOURNAMENT,
      details: { '<script>alert("xss")</script>': 'malicious' },
    };

    mockSanitizeInput.mockImplementation((input) => ({ sanitized: input }));

    await createAuditLog(params);

    expect(mockSanitizeInput).toHaveBeenCalledWith(params.details);
  });

  it('should create log without optional fields', async () => {
    const params = {
      ipAddress: '192.168.1.1',
      userAgent: 'Mozilla/5.0',
      action: AUDIT_ACTIONS.CREATE_TOURNAMENT,
    };

    const result = await createAuditLog(params);

    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
      data: {
        userId: undefined,
        ipAddress: params.ipAddress,
        userAgent: params.userAgent,
        action: params.action,
        targetId: undefined,
        targetType: undefined,
        details: undefined,
      },
    });
    expect(result).toBeDefined();
  });

  it('should handle errors gracefully and return undefined', async () => {
    const params = {
      ipAddress: '192.168.1.1',
      userAgent: 'Mozilla/5.0',
      action: AUDIT_ACTIONS.CREATE_TOURNAMENT,
    };

    mockPrisma.auditLog.create.mockRejectedValue(new Error('Database connection failed'));

    const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
    const result = await createAuditLog(params);

    expect(result).toBeUndefined();
    expect(consoleSpy).toHaveBeenCalledWith(
      'Audit log creation failed - Action: %s, User: %s, Target: %s/%s, IP: %s, Error: %s',
      AUDIT_ACTIONS.CREATE_TOURNAMENT,
      'anonymous',
      'N/A',
      'N/A',
      '192.168.1.1',
      'Database connection failed'
    );
    consoleSpy.mockRestore();
  });

  it('should not call sanitizeInput when details is not provided', async () => {
    const params = {
      ipAddress: '192.168.1.1',
      userAgent: 'Mozilla/5.0',
      action: AUDIT_ACTIONS.CREATE_TOURNAMENT,
    };

    await createAuditLog(params);

    expect(mockSanitizeInput).not.toHaveBeenCalled();
  });

  it('should log user as anonymous when userId not provided', async () => {
    const params = {
      ipAddress: '192.168.1.1',
      userAgent: 'Mozilla/5.0',
      action: AUDIT_ACTIONS.UNAUTHORIZED_ACCESS,
    };

    const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
    mockPrisma.auditLog.create.mockRejectedValue(new Error('DB error'));

    await createAuditLog(params);

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Audit log creation failed - Action: UNAUTHORIZED_ACCESS, User: anonymous'),
      expect.stringContaining('IP: 192.168.1.1'),
      expect.stringContaining('Error: DB error')
    );
    consoleSpy.mockRestore();
  });
});
