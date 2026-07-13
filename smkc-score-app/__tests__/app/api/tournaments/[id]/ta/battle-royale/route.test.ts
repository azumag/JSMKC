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
  const json = jest.fn((body, init) => ({ body, init }));
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
  return { __esModule: true, NextRequest: MockNextRequest, NextResponse: { json } };
});

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAdminSession } from '@/lib/api-auth';
import { createErrorResponse } from '@/lib/error-handling';
import { resolveTournament } from '@/lib/tournament-identifier';
import { createAuditLogs } from '@/lib/audit-log';
import { createLogger } from '@/lib/logger';
import { TA_BATTLE_ROYALE_ENTRY_CHUNK, TA_BATTLE_ROYALE_MAX_PLAYERS } from '@/lib/ta/battle-royale-constants';
import { POST } from '@/app/api/tournaments/[id]/ta/battle-royale/route';

const PLAYER_1 = 'cl00000000000000000000001';
const PLAYER_2 = 'cl00000000000000000000002';
const params = { params: Promise.resolve({ id: 'tournament-1' }) };

function createRequest(players: Array<{ playerId: string; taHandicapSeconds: 0 | -1 | -3 | -5 }>) {
  return new NextRequest('http://localhost:3000/api/tournaments/tournament-1/ta/battle-royale', {
    method: 'POST',
    body: JSON.stringify({ players }),
  });
}

function validPlayers() {
  return [
    { playerId: PLAYER_1, taHandicapSeconds: 0 as const },
    { playerId: PLAYER_2, taHandicapSeconds: -3 as const },
  ];
}

function chunkedPlayers(count = TA_BATTLE_ROYALE_ENTRY_CHUNK + 1) {
  return Array.from({ length: count }, (_, index) => ({
    playerId: `cl${String(index + 1).padStart(23, '0')}`,
    taHandicapSeconds: 0 as const,
  }));
}

function mockPlayersForSuccessfulStart(players: ReturnType<typeof chunkedPlayers>) {
  jest.mocked(prisma.player.findMany).mockResolvedValue(players.map(({ playerId }) => ({ id: playerId })));
  jest.mocked(prisma.tTEntry.findMany).mockResolvedValue(
    players.map(({ playerId }, index) => ({
      id: `entry-${index + 1}`,
      playerId,
      taHandicapSeconds: 0,
      player: { nickname: `Player ${index + 1}` },
    })),
  );
}

describe('POST /api/tournaments/[id]/ta/battle-royale', () => {
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
    jest.mocked(prisma.player.findMany).mockResolvedValue([{ id: PLAYER_1 }, { id: PLAYER_2 }]);
    jest.mocked(prisma.tTEntry.createMany).mockResolvedValue({ count: 2 });
    jest.mocked(prisma.tTEntry.deleteMany).mockResolvedValue({ count: 0 });
    jest.mocked(prisma.tTEntry.findMany).mockResolvedValue([
      { id: 'entry-1', playerId: PLAYER_1, taHandicapSeconds: 0, player: { nickname: 'Player 1' } },
      { id: 'entry-2', playerId: PLAYER_2, taHandicapSeconds: -3, player: { nickname: 'Player 2' } },
    ]);
  });

  it('管理者でない場合は処理を開始しない', async () => {
    const authError = { status: 403 };
    jest.mocked(requireAdminSession).mockResolvedValue({ error: authError, session: null });
    expect(await POST(createRequest([]), params)).toBe(authError);
    expect(resolveTournament).not.toHaveBeenCalled();
  });

  it('大会が存在しない場合は404を返す', async () => {
    jest.mocked(resolveTournament).mockResolvedValue(null);
    await POST(createRequest([]), params);
    expect(createErrorResponse).toHaveBeenCalledWith('Tournament not found', 404, 'NOT_FOUND');
  });

  it('通常TA大会では開始を拒否する', async () => {
    jest.mocked(resolveTournament).mockResolvedValue({
      id: 'tournament-1',
      status: 'draft',
      taBattleRoyaleMode: false,
    });
    await POST(createRequest([]), params);
    expect(createErrorResponse).toHaveBeenCalledWith(
      'Tournament is not configured for TA battle royale',
      400,
      'INVALID_TA_MODE',
    );
  });

  it('draft以外の大会では開始を拒否する', async () => {
    jest.mocked(resolveTournament).mockResolvedValue({
      id: 'tournament-1',
      status: 'active',
      taBattleRoyaleMode: true,
    });
    await POST(createRequest(validPlayers()), params);
    expect(createErrorResponse).toHaveBeenCalledWith('Tournament must be in draft status', 409, 'TOURNAMENT_NOT_DRAFT');
  });

  it('参加者が2人未満の場合はバリデーションエラーを返す', async () => {
    await POST(createRequest([{ playerId: PLAYER_1, taHandicapSeconds: 0 }]), params);
    expect(createErrorResponse).toHaveBeenCalledWith(expect.any(String), 400, 'VALIDATION_ERROR');
    expect(prisma.tTEntry.count).not.toHaveBeenCalled();
  });

  it('同じ参加者が重複している場合は拒否する', async () => {
    await POST(
      createRequest([
        { playerId: PLAYER_1, taHandicapSeconds: 0 },
        { playerId: PLAYER_1, taHandicapSeconds: -1 },
      ]),
      params,
    );
    expect(createErrorResponse).toHaveBeenCalledWith('Duplicate players are not allowed', 400, 'VALIDATION_ERROR');
  });

  it('Phase 3が開始済みの場合は409を返す', async () => {
    jest.mocked(prisma.tTEntry.count).mockResolvedValue(1);
    await POST(createRequest(validPlayers()), params);
    expect(createErrorResponse).toHaveBeenCalledWith(
      'TA battle royale has already started',
      409,
      'BATTLE_ROYALE_ALREADY_STARTED',
    );
    expect(prisma.tTEntry.createMany).not.toHaveBeenCalled();
  });

  it('存在しない参加者IDが含まれる場合は拒否する', async () => {
    jest.mocked(prisma.player.findMany).mockResolvedValue([{ id: PLAYER_1 }]);
    await POST(createRequest(validPlayers()), params);
    expect(createErrorResponse).toHaveBeenCalledWith('One or more players were not found', 400, 'PLAYER_NOT_FOUND');
  });

  it('選択した参加者をPhase 3へ直接作成する', async () => {
    await POST(createRequest(validPlayers()), params);
    expect(prisma.tTEntry.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          tournamentId: 'tournament-1',
          playerId: PLAYER_1,
          stage: 'phase3',
          lives: 3,
          taHandicapSeconds: 0,
        }),
        expect.objectContaining({
          tournamentId: 'tournament-1',
          playerId: PLAYER_2,
          stage: 'phase3',
          lives: 3,
          taHandicapSeconds: -3,
        }),
      ],
    });
    expect(createAuditLogs).toHaveBeenCalledWith([
      expect.objectContaining({
        action: 'CREATE_TA_ENTRY',
        targetId: 'entry-1',
        details: expect.objectContaining({
          tournamentId: 'tournament-1',
          playerId: PLAYER_1,
          playerNickname: 'Player 1',
          initialLives: 3,
          taHandicapSeconds: 0,
        }),
      }),
      expect.objectContaining({
        action: 'CREATE_TA_ENTRY',
        targetId: 'entry-2',
        details: expect.objectContaining({
          tournamentId: 'tournament-1',
          playerId: PLAYER_2,
          playerNickname: 'Player 2',
          initialLives: 3,
          taHandicapSeconds: -3,
        }),
      }),
    ]);
    expect(NextResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({ phase: 'phase3', initialLives: 3 }),
      }),
      { status: 201 },
    );
  });

  it('ENTRY_CHUNK人の参加者を1チャンクで作成する', async () => {
    const players = chunkedPlayers(TA_BATTLE_ROYALE_ENTRY_CHUNK);
    mockPlayersForSuccessfulStart(players);
    jest.mocked(prisma.tTEntry.createMany).mockResolvedValueOnce({ count: TA_BATTLE_ROYALE_ENTRY_CHUNK });

    await POST(createRequest(players), params);

    expect(prisma.tTEntry.createMany).toHaveBeenCalledTimes(1);
    expect(jest.mocked(prisma.tTEntry.createMany).mock.calls[0][0].data).toEqual(
      players.map(({ playerId }) => expect.objectContaining({ playerId, stage: 'phase3' })),
    );
    expect(createAuditLogs).toHaveBeenCalledTimes(1);
    expect(NextResponse.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }), { status: 201 });
  });

  it('ENTRY_CHUNK+1人の参加者を2チャンクに分割して作成する', async () => {
    const players = chunkedPlayers();
    mockPlayersForSuccessfulStart(players);
    jest
      .mocked(prisma.tTEntry.createMany)
      .mockResolvedValueOnce({ count: TA_BATTLE_ROYALE_ENTRY_CHUNK })
      .mockResolvedValueOnce({ count: 1 });

    await POST(createRequest(players), params);

    expect(prisma.tTEntry.createMany).toHaveBeenCalledTimes(2);
    expect(prisma.tTEntry.createMany).toHaveBeenNthCalledWith(1, {
      data: expect.arrayContaining(
        players
          .slice(0, TA_BATTLE_ROYALE_ENTRY_CHUNK)
          .map(({ playerId }) => expect.objectContaining({ playerId, stage: 'phase3' })),
      ),
    });
    expect(jest.mocked(prisma.tTEntry.createMany).mock.calls[0][0].data).toHaveLength(
      TA_BATTLE_ROYALE_ENTRY_CHUNK,
    );
    expect(prisma.tTEntry.createMany).toHaveBeenNthCalledWith(2, {
      data: [
        expect.objectContaining({
          playerId: players[TA_BATTLE_ROYALE_ENTRY_CHUNK].playerId,
          stage: 'phase3',
        }),
      ],
    });
    expect(createAuditLogs).toHaveBeenCalledTimes(1);
    expect(NextResponse.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }), { status: 201 });
  });

  it('参加者上限をENTRY_CHUNK単位のチャンクに分割して作成する', async () => {
    const players = chunkedPlayers(TA_BATTLE_ROYALE_MAX_PLAYERS);
    const expectedChunkCount = Math.ceil(TA_BATTLE_ROYALE_MAX_PLAYERS / TA_BATTLE_ROYALE_ENTRY_CHUNK);
    mockPlayersForSuccessfulStart(players);
    jest.mocked(prisma.tTEntry.createMany).mockResolvedValue({ count: TA_BATTLE_ROYALE_ENTRY_CHUNK });

    await POST(createRequest(players), params);

    expect(prisma.tTEntry.createMany).toHaveBeenCalledTimes(expectedChunkCount);
    const chunkSizes = jest.mocked(prisma.tTEntry.createMany).mock.calls.map(([argument]) => argument.data.length);
    const expectedChunkSizes = Array.from({ length: expectedChunkCount }, (_, chunkIndex) => {
      const start = chunkIndex * TA_BATTLE_ROYALE_ENTRY_CHUNK;
      return Math.min(TA_BATTLE_ROYALE_ENTRY_CHUNK, TA_BATTLE_ROYALE_MAX_PLAYERS - start);
    });
    expect(chunkSizes).toEqual(expectedChunkSizes);

    for (let chunkIndex = 0; chunkIndex < expectedChunkCount; chunkIndex += 1) {
      const start = chunkIndex * TA_BATTLE_ROYALE_ENTRY_CHUNK;
      const end = Math.min(start + TA_BATTLE_ROYALE_ENTRY_CHUNK, players.length);
      expect(prisma.tTEntry.createMany).toHaveBeenNthCalledWith(chunkIndex + 1, {
        data: players
          .slice(start, end)
          .map(({ playerId }) => expect.objectContaining({ playerId, stage: 'phase3' })),
      });
    }

    expect(createAuditLogs).toHaveBeenCalledTimes(1);
    expect(NextResponse.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }), { status: 201 });
  });

  it('2チャンク目の作成に失敗した場合は1チャンク目のエントリーをロールバックする', async () => {
    const players = chunkedPlayers();
    mockPlayersForSuccessfulStart(players);
    jest
      .mocked(prisma.tTEntry.createMany)
      .mockResolvedValueOnce({ count: TA_BATTLE_ROYALE_ENTRY_CHUNK })
      .mockRejectedValueOnce(new Error('second chunk failed'));

    await POST(createRequest(players), params);

    expect(prisma.tTEntry.createMany).toHaveBeenCalledTimes(2);
    expect(jest.mocked(prisma.tTEntry.createMany).mock.calls[0][0].data).toHaveLength(
      TA_BATTLE_ROYALE_ENTRY_CHUNK,
    );
    expect(jest.mocked(prisma.tTEntry.createMany).mock.calls[1][0].data).toHaveLength(1);
    expect(prisma.tTEntry.deleteMany).toHaveBeenCalledWith({
      where: {
        tournamentId: 'tournament-1',
        stage: 'phase3',
        playerId: { in: players.slice(0, TA_BATTLE_ROYALE_ENTRY_CHUNK).map(({ playerId }) => playerId) },
      },
    });
    expect(createErrorResponse).toHaveBeenCalledWith('Failed to start TA battle royale', 500, 'INTERNAL_ERROR');
    expect(createAuditLogs).not.toHaveBeenCalled();
    expect(NextResponse.json).not.toHaveBeenCalled();
  });

  it('ロールバック失敗を記録しつつ元の作成エラーを500として返す', async () => {
    const players = chunkedPlayers();
    const creationError = new Error('second chunk failed');
    const rollbackError = new Error('rollback failed');
    const createdPlayerIds = players.slice(0, TA_BATTLE_ROYALE_ENTRY_CHUNK).map(({ playerId }) => playerId);
    mockPlayersForSuccessfulStart(players);
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

  it('1チャンク目の作成に失敗した場合はロールバックを実行しない', async () => {
    const players = chunkedPlayers();
    mockPlayersForSuccessfulStart(players);
    jest.mocked(prisma.tTEntry.createMany).mockRejectedValueOnce(new Error('first chunk failed'));

    await POST(createRequest(players), params);

    expect(prisma.tTEntry.createMany).toHaveBeenCalledTimes(1);
    expect(prisma.tTEntry.deleteMany).not.toHaveBeenCalled();
    expect(createErrorResponse).toHaveBeenCalledWith('Failed to start TA battle royale', 500, 'INTERNAL_ERROR');
    expect(createAuditLogs).not.toHaveBeenCalled();
    expect(NextResponse.json).not.toHaveBeenCalled();
  });

  it('DB書き込みが失敗した場合は500を返す', async () => {
    jest.mocked(prisma.tTEntry.createMany).mockRejectedValue(new Error('database unavailable'));

    await POST(createRequest(validPlayers()), params);

    expect(createErrorResponse).toHaveBeenCalledWith('Failed to start TA battle royale', 500, 'INTERNAL_ERROR');
    expect(createAuditLogs).not.toHaveBeenCalled();
    expect(NextResponse.json).not.toHaveBeenCalled();
  });
});
