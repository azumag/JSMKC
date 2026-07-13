// @ts-nocheck - route tests use focused Jest mocks for Next.js and Prisma

jest.mock('@/lib/prisma', () => {
  const mockPrisma = {
    tTEntry: { count: jest.fn(), createMany: jest.fn(), deleteMany: jest.fn(), findMany: jest.fn() },
    tTPhaseRound: { count: jest.fn() },
    player: { findMany: jest.fn() },
  };
  return { __esModule: true, default: mockPrisma, prisma: mockPrisma };
});

jest.mock('@/lib/api-auth', () => ({ requireAdminSession: jest.fn() }));
jest.mock('@/lib/sanitize', () => ({ sanitizeInput: jest.fn((value) => value) }));
jest.mock('@/lib/error-handling', () => ({
  createErrorResponse: jest.fn((message, status, code) => ({ message, status, code })),
}));
jest.mock('@/lib/tournament-identifier', () => ({ resolveTournament: jest.fn() }));
jest.mock('@/lib/ta/battle-royale', () => ({
  getTaPhase3Rules: jest.fn(() => ({ initialLives: 3 })),
  normalizeTaHandicapSeconds: jest.fn((value) => value),
}));
jest.mock('@/lib/audit-log', () => ({
  createAuditLogs: jest.fn(),
  AUDIT_ACTIONS: { CREATE_TA_ENTRY: 'CREATE_TA_ENTRY' },
  resolveAuditUserId: jest.fn(() => 'admin-1'),
}));
jest.mock('@/lib/request-utils', () => ({
  getClientIdentifier: jest.fn(() => 'test-client'),
  getUserAgent: jest.fn(() => 'test-agent'),
}));
jest.mock('@/lib/logger', () => ({
  createLogger: jest.fn(() => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() })),
}));
jest.mock('next/server', () => {
  class MockNextRequest {
    url: string;
    method: string;
    private readonly body: unknown;
    headers: { get: jest.Mock; forEach: jest.Mock };

    constructor(url: string, init: { method?: string; body?: unknown } = {}) {
      this.url = url;
      this.method = init.method ?? 'GET';
      this.body = init.body;
      this.headers = { get: jest.fn(() => null), forEach: jest.fn() };
    }

    async json() {
      return typeof this.body === 'string' ? JSON.parse(this.body) : this.body;
    }
  }

  return { __esModule: true, NextRequest: MockNextRequest, NextResponse: { json: jest.fn() } };
});

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAdminSession } from '@/lib/api-auth';
import { createErrorResponse } from '@/lib/error-handling';
import { resolveTournament } from '@/lib/tournament-identifier';
import { createAuditLogs } from '@/lib/audit-log';
import { createLogger } from '@/lib/logger';
import { POST, TA_BATTLE_ROYALE_ENTRY_CHUNK } from '@/app/api/tournaments/[id]/ta/battle-royale/route';

const params = { params: Promise.resolve({ id: 'tournament-1' }) };

function chunkedPlayers() {
  return Array.from({ length: TA_BATTLE_ROYALE_ENTRY_CHUNK + 1 }, (_, index) => ({
    playerId: `cl${String(index + 1).padStart(23, '0')}`,
    taHandicapSeconds: 0 as const,
  }));
}

function createRequest(players: ReturnType<typeof chunkedPlayers>) {
  return new NextRequest('http://localhost:3000/api/tournaments/tournament-1/ta/battle-royale', {
    method: 'POST',
    body: JSON.stringify({ players }),
  });
}

describe('TA battle royale rollback failure', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(requireAdminSession).mockResolvedValue({
      error: null,
      session: { user: { id: 'admin-1', role: 'admin' } },
    });
    jest.mocked(resolveTournament).mockResolvedValue({
      id: 'tournament-1',
      status: 'draft',
      taBattleRoyaleMode: true,
    });
    jest.mocked(prisma.tTEntry.count).mockResolvedValue(0);
    jest.mocked(prisma.tTPhaseRound.count).mockResolvedValue(0);
  });

  it('ロールバック失敗を記録しつつ元の作成エラーを500として返す', async () => {
    const players = chunkedPlayers();
    const creationError = new Error('second chunk failed');
    const rollbackError = new Error('rollback failed');
    const createdPlayerIds = players.slice(0, TA_BATTLE_ROYALE_ENTRY_CHUNK).map(({ playerId }) => playerId);

    jest.mocked(prisma.player.findMany).mockResolvedValue(players.map(({ playerId }) => ({ id: playerId })));
    jest
      .mocked(prisma.tTEntry.createMany)
      .mockResolvedValueOnce({ count: TA_BATTLE_ROYALE_ENTRY_CHUNK })
      .mockRejectedValueOnce(creationError);
    jest.mocked(prisma.tTEntry.deleteMany).mockRejectedValueOnce(rollbackError);

    const response = await POST(createRequest(players), params);
    const logger = jest.mocked(createLogger).mock.results[0].value;

    expect(prisma.tTEntry.deleteMany).toHaveBeenCalledWith({
      where: {
        tournamentId: 'tournament-1',
        stage: 'phase3',
        playerId: { in: createdPlayerIds },
      },
    });
    expect(logger.error).toHaveBeenNthCalledWith(1, 'Failed to rollback partial TA battle royale entries', {
      error: rollbackError,
      tournamentId: 'tournament-1',
      playerIds: createdPlayerIds,
    });
    expect(logger.error).toHaveBeenNthCalledWith(2, 'Failed to start TA battle royale', {
      error: creationError,
      tournamentId: 'tournament-1',
    });
    expect(createErrorResponse).toHaveBeenCalledWith('Failed to start TA battle royale', 500, 'INTERNAL_ERROR');
    expect(response).toEqual({
      message: 'Failed to start TA battle royale',
      status: 500,
      code: 'INTERNAL_ERROR',
    });
    expect(createAuditLogs).not.toHaveBeenCalled();
    expect(NextResponse.json).not.toHaveBeenCalled();
  });
});
