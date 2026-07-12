// @ts-nocheck - route tests use focused Jest mocks for Next.js and Prisma

jest.mock('@/lib/prisma', () => {
  const mockPrisma = {
    tTEntry: { count: jest.fn(), createMany: jest.fn(), findMany: jest.fn() },
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

function chunkedPlayers() {
  return Array.from({ length: 15 }, (_, index) => ({
    playerId: `cl${String(index + 1).padStart(23, '0')}`,
    taHandicapSeconds: 0 as const,
  }));
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

  it('15人の参加者を14件と1件のチャンクに分割して作成する', async () => {
    const players = chunkedPlayers();
    jest.mocked(prisma.player.findMany).mockResolvedValue(players.map(({ playerId }) => ({ id: playerId })));
    jest
      .mocked(prisma.tTEntry.createMany)
      .mockResolvedValueOnce({ count: 14 })
      .mockResolvedValueOnce({ count: 1 });
    jest.mocked(prisma.tTEntry.findMany).mockResolvedValue(
      players.map(({ playerId }, index) => ({
        id: `entry-${index + 1}`,
        playerId,
        taHandicapSeconds: 0,
        player: { nickname: `Player ${index + 1}` },
      })),
    );

    await POST(createRequest(players), params);

    expect(prisma.tTEntry.createMany).toHaveBeenCalledTimes(2);
    expect(prisma.tTEntry.createMany).toHaveBeenNthCalledWith(1, {
      data: expect.arrayContaining(
        players.slice(0, 14).map(({ playerId }) => expect.objectContaining({ playerId, stage: 'phase3' })),
      ),
    });
    expect(jest.mocked(prisma.tTEntry.createMany).mock.calls[0][0].data).toHaveLength(14);
    expect(prisma.tTEntry.createMany).toHaveBeenNthCalledWith(2, {
      data: [expect.objectContaining({ playerId: players[14].playerId, stage: 'phase3' })],
    });
    expect(createAuditLogs).toHaveBeenCalledTimes(1);
    expect(NextResponse.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }), { status: 201 });
  });

  it('2チャンク目の作成に失敗した場合は監査ログや成功レスポンスを生成しない', async () => {
    const players = chunkedPlayers();
    jest.mocked(prisma.player.findMany).mockResolvedValue(players.map(({ playerId }) => ({ id: playerId })));
    jest
      .mocked(prisma.tTEntry.createMany)
      .mockResolvedValueOnce({ count: 14 })
      .mockRejectedValueOnce(new Error('second chunk failed'));

    await POST(createRequest(players), params);

    expect(prisma.tTEntry.createMany).toHaveBeenCalledTimes(2);
    expect(jest.mocked(prisma.tTEntry.createMany).mock.calls[0][0].data).toHaveLength(14);
    expect(jest.mocked(prisma.tTEntry.createMany).mock.calls[1][0].data).toHaveLength(1);
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
