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

import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAdminSession } from '@/lib/api-auth';
import { createErrorResponse } from '@/lib/error-handling';
import { resolveTournament } from '@/lib/tournament-identifier';
import { createAuditLogs } from '@/lib/audit-log';
import { TA_BATTLE_ROYALE_ENTRY_CHUNK } from '@/lib/ta/battle-royale-constants';
import { POST } from '@/app/api/tournaments/[id]/ta/battle-royale/route';

const params = { params: Promise.resolve({ id: 'tournament-1' }) };

function createP2002Error() {
  return new PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
  });
}

function mockSuccessfulPreconditions(players: Array<{ playerId: string; taHandicapSeconds: 0 }>) {
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
  jest.mocked(prisma.player.findMany).mockResolvedValue(players.map(({ playerId }) => ({ id: playerId })));
}

function createRequest(players: Array<{ playerId: string; taHandicapSeconds: 0 }>) {
  return new NextRequest('http://localhost:3000/api/tournaments/tournament-1/ta/battle-royale', {
    method: 'POST',
    body: JSON.stringify({ players }),
  });
}

it('createManyが2チャンク目でP2002になった場合は作成済み分をロールバックして409を返す', async () => {
  const players = Array.from({ length: TA_BATTLE_ROYALE_ENTRY_CHUNK + 1 }, (_, index) => ({
    playerId: `cl${String(index + 1).padStart(23, '0')}`,
    taHandicapSeconds: 0 as const,
  }));
  const createdPlayerIds = players.slice(0, TA_BATTLE_ROYALE_ENTRY_CHUNK).map(({ playerId }) => playerId);

  mockSuccessfulPreconditions(players);
  jest
    .mocked(prisma.tTEntry.createMany)
    .mockResolvedValueOnce({ count: TA_BATTLE_ROYALE_ENTRY_CHUNK })
    .mockRejectedValueOnce(createP2002Error());
  jest.mocked(prisma.tTEntry.deleteMany).mockResolvedValue({ count: TA_BATTLE_ROYALE_ENTRY_CHUNK });

  const response = await POST(createRequest(players), params);

  expect(prisma.tTEntry.deleteMany).toHaveBeenCalledWith({
    where: {
      tournamentId: 'tournament-1',
      stage: 'phase3',
      playerId: { in: createdPlayerIds },
    },
  });
  expect(createErrorResponse).toHaveBeenCalledWith(
    'TA battle royale has already started',
    409,
    'BATTLE_ROYALE_ALREADY_STARTED',
  );
  expect(response).toEqual({
    message: 'TA battle royale has already started',
    status: 409,
    code: 'BATTLE_ROYALE_ALREADY_STARTED',
  });
  expect(createAuditLogs).not.toHaveBeenCalled();
  expect(NextResponse.json).not.toHaveBeenCalled();
});

it('createManyが1チャンク目でP2002になった場合はロールバックせず409を返す', async () => {
  const players = [{ playerId: 'cl00000000000000000000001', taHandicapSeconds: 0 as const }];

  mockSuccessfulPreconditions(players);
  jest.mocked(prisma.tTEntry.createMany).mockRejectedValueOnce(createP2002Error());

  const response = await POST(createRequest(players), params);

  expect(prisma.tTEntry.deleteMany).not.toHaveBeenCalled();
  expect(createErrorResponse).toHaveBeenCalledWith(
    'TA battle royale has already started',
    409,
    'BATTLE_ROYALE_ALREADY_STARTED',
  );
  expect(response).toEqual({
    message: 'TA battle royale has already started',
    status: 409,
    code: 'BATTLE_ROYALE_ALREADY_STARTED',
  });
  expect(createAuditLogs).not.toHaveBeenCalled();
  expect(NextResponse.json).not.toHaveBeenCalled();
});
