// @ts-nocheck
import { describe, it, expect, jest } from '@jest/globals';

jest.mock('@/lib/logger', () => {
  const inst = { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() };
  return { createLogger: jest.fn(() => inst) };
});

jest.mock('@/lib/rate-limit', () => ({
  getServerSideIdentifier: jest.fn(() => Promise.resolve('127.0.0.1')),
}));

jest.mock('@/lib/audit-log', () => ({
  createAuditLog: jest.fn(),
  AUDIT_ACTIONS: { CREATE_TOURNAMENT: 'CREATE_TOURNAMENT' },
}));

describe('debug logger mock', () => {
  it('should verify createLogger returns mock', () => {
    const loggerMod = jest.requireMock('@/lib/logger');
    const logger = loggerMod.createLogger('test');
    console.log('TYPE of createLogger:', typeof loggerMod.createLogger);
    console.log('IS MOCK:', !!loggerMod.createLogger.mock);
    console.log('TYPE of logger.error:', typeof logger.error);
    console.log('IS ERROR MOCK:', !!logger.error?.mock);
    
    logger.error('test msg', { foo: 'bar' });
    console.log('ERROR CALLS:', logger.error.mock?.calls?.length);
    
    expect(logger.error).toHaveBeenCalledWith('test msg', { foo: 'bar' });
  });

  it('should verify rate-limit mock', async () => {
    const rlMod = jest.requireMock('@/lib/rate-limit');
    console.log('getServerSideIdentifier IS MOCK:', !!rlMod.getServerSideIdentifier?.mock);
    const result = await rlMod.getServerSideIdentifier();
    console.log('getServerSideIdentifier result:', result);
    expect(result).toBe('127.0.0.1');
  });

  it('should verify audit-log mock', () => {
    const alMod = jest.requireMock('@/lib/audit-log');
    console.log('createAuditLog IS MOCK:', !!alMod.createAuditLog?.mock);
    expect(alMod.createAuditLog).toBeDefined();
  });

  it('should verify route uses mocked logger', async () => {
    // Import after mocks are set up
    const { createLogger } = jest.requireMock('@/lib/logger');
    const { GET } = require('@/app/api/tournaments/route');
    
    // Need a request
    const { NextRequest } = jest.requireMock('next/server');
    
    // Make findMany/count throw to trigger the error path
    const prisma = jest.requireMock('@/lib/prisma').default;
    prisma.tournament.findMany.mockRejectedValue(new Error('test error'));
    prisma.tournament.count.mockRejectedValue(new Error('test error'));
    
    const req = new NextRequest('http://localhost:3000/api/tournaments');
    await GET(req);
    
    // Check if the logger error was called
    const loggerInstance = createLogger('test');
    console.log('After route call - logger.error calls:', loggerInstance.error.mock.calls.length);
    console.log('After route call - logger.error args:', JSON.stringify(loggerInstance.error.mock.calls));
  });
});
