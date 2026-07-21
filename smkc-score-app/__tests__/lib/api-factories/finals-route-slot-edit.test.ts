/**
 * @module __tests__/lib/api-factories/finals-route-slot-edit.test.ts
 *
 * Test suite for the PATCH `slotEdit` operation family added by issue #3017
 * (manual bracket slot placement adjustment for CDM emergency correction):
 *   - `assign`: replace one slot's player with another qualification participant.
 *   - `swap`: swap the two slots of the same match (single-row updateMany).
 *   - `swapSlots`: atomically swap one slot each between two different
 *     matches in the same round (raw CASE-expression UPDATE, verified
 *     against real preview D1 in issue #3017 Step 0).
 *
 * Covers the validation order from the issue design: admin/rate-limit are
 * exercised by the existing PATCH tests in finals-route.test.ts and are not
 * re-tested here. This file focuses on: state guards (completed/BYE/version),
 * the TBD guard, the duplicate-placement guard, the three write shapes, the
 * audit log, and the swapSlots atomicity contract (affected must be 0 or 2).
 */
// @ts-nocheck - mirrors the @ts-nocheck convention in finals-route.test.ts

import { createFinalsHandlers } from '@/lib/api-factories/finals-route';
import { createAuditLog, AUDIT_ACTIONS } from '@/lib/audit-log';
import { NextRequest } from 'next/server';

jest.mock('@/lib/prisma');
jest.mock('@/lib/auth');
jest.mock('@/lib/double-elimination');
jest.mock('@/lib/sanitize');
jest.mock('@/lib/logger');
jest.mock('@/lib/audit-log');

import { auth } from '@/lib/auth';
import { generateBracketStructure, generatePlayoffStructure } from '@/lib/double-elimination';
import { sanitizeInput } from '@/lib/sanitize';
import { createLogger } from '@/lib/logger';
import prisma from '@/lib/prisma';

describe('Finals Route Factory — PATCH slotEdit (issue #3017)', () => {
  const createMockConfig = (overrides = {}) => ({
    eventTypeCode: 'bm' as const,
    matchModel: 'bMMatch',
    qualificationModel: 'bMQualification',
    loggerName: 'bm-finals',
    getStyle: 'paginated' as const,
    qualificationOrderBy: [{ score: 'desc' }],
    putScoreFields: { dbField1: 'score1', dbField2: 'score2' },
    getErrorMessage: 'Failed to fetch finals',
    postErrorMessage: 'Failed to create finals',
    postRequiresAuth: false,
    putRequiresAuth: false,
    ...overrides,
  });

  const makeRow = (overrides = {}) => ({
    id: `m${overrides.matchNumber ?? 1}`,
    tournamentId: 'tournament-123',
    stage: 'finals',
    round: 'winners_qf',
    matchNumber: 1,
    completed: false,
    isBye: false,
    version: 2,
    player1Id: 'p1',
    player2Id: 'p2',
    slotOverrideBy: null,
    slotOverrideAt: null,
    player1: { id: 'p1', name: 'Player 1' },
    player2: { id: 'p2', name: 'Player 2' },
    ...overrides,
  });

  const patchRequest = (body: Record<string, unknown>) =>
    new NextRequest('http://localhost:3000', { method: 'PATCH', body: JSON.stringify(body) });

  beforeEach(() => {
    jest.clearAllMocks();
    (auth as jest.Mock).mockResolvedValue({ user: { id: 'admin-1', role: 'admin' } });
    (sanitizeInput as jest.Mock).mockImplementation((input) => input);
    (createLogger as jest.Mock).mockReturnValue({
      error: jest.fn(),
      warn: jest.fn(),
      info: jest.fn(),
      debug: jest.fn(),
    });
    (createAuditLog as jest.Mock).mockResolvedValue(undefined);
    (prisma.bMMatch.count as jest.Mock).mockResolvedValue(17);
    (generateBracketStructure as jest.Mock).mockReturnValue([
      { matchNumber: 1, round: 'winners_qf', bracket: 'winners', winnerGoesTo: 5, position: 1 },
      { matchNumber: 2, round: 'winners_qf', bracket: 'winners', winnerGoesTo: 5, position: 2 },
      { matchNumber: 5, round: 'winners_sf', bracket: 'winners' },
      { matchNumber: 9, round: 'winners_qf', bracket: 'winners' },
    ]);
    (generatePlayoffStructure as jest.Mock).mockReturnValue([]);
  });

  describe('op: assign', () => {
    it('writes the new player, increments version, stamps the override, and logs an audit entry', async () => {
      const existing = makeRow({ matchNumber: 1, round: 'winners_qf', version: 2, player1Id: 'p1', player2Id: 'p2' });
      (prisma.bMMatch.findFirst as jest.Mock).mockResolvedValue(existing);
      (prisma.bMMatch.findMany as jest.Mock).mockResolvedValue([existing]);
      (prisma.bMQualification.findFirst as jest.Mock).mockResolvedValue({
        id: 'q1',
        playerId: 'p9',
        tournamentId: 'tournament-123',
      });
      (prisma.bMMatch.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
      (prisma.bMMatch.findUnique as jest.Mock).mockResolvedValue({ ...existing, player1Id: 'p9', version: 3 });

      const { PATCH } = createFinalsHandlers(createMockConfig());
      const response = await PATCH(
        patchRequest({ matchId: 'm1', slotEdit: { op: 'assign', slot: 1, playerId: 'p9', expectedVersion: 2 } }),
        { params: Promise.resolve({ id: 'tournament-123' }) },
      );
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(prisma.bMMatch.updateMany).toHaveBeenCalledWith({
        where: { id: 'm1', completed: false, version: 2 },
        data: {
          player1Id: 'p9',
          version: { increment: 1 },
          slotOverrideBy: 'admin-1',
          slotOverrideAt: expect.any(Date),
        },
      });
      expect(json.data.newVersion).toBe(3);
      expect(createAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: AUDIT_ACTIONS.OVERRIDE_FINALS_SLOT,
          targetId: 'm1',
          details: expect.objectContaining({ op: 'assign', slot: 1, beforePlayerId: 'p1', afterPlayerId: 'p9' }),
        }),
      );
    });

    it('warns via duplicatePlacementWarning when a concurrent assign wins the same player onto another slot (TOCTOU)', async () => {
      const existing = makeRow({ matchNumber: 1, round: 'winners_qf', version: 2, player1Id: 'p1', player2Id: 'p2' });
      const concurrentlyPlaced = makeRow({ matchNumber: 9, round: 'winners_qf', player1Id: 'p9', player2Id: 'p10' });
      (prisma.bMMatch.findFirst as jest.Mock).mockResolvedValue(existing);
      /* First findMany call is the pre-write check (no conflict yet); the
       * second is the post-write re-check, simulating a concurrent assign
       * that placed the same player (p9) into match 9 in between. */
      (prisma.bMMatch.findMany as jest.Mock)
        .mockResolvedValueOnce([existing])
        .mockResolvedValueOnce([existing, concurrentlyPlaced]);
      (prisma.bMQualification.findFirst as jest.Mock).mockResolvedValue({ id: 'q9', playerId: 'p9' });
      (prisma.bMMatch.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
      (prisma.bMMatch.findUnique as jest.Mock).mockResolvedValue({ ...existing, player1Id: 'p9', version: 3 });

      const { PATCH } = createFinalsHandlers(createMockConfig());
      const response = await PATCH(
        patchRequest({ matchId: 'm1', slotEdit: { op: 'assign', slot: 1, playerId: 'p9', expectedVersion: 2 } }),
        { params: Promise.resolve({ id: 'tournament-123' }) },
      );
      const json = await response.json();

      /* Our own write still succeeded — losing this race doesn't corrupt
       * either row, it just leaves two matches pointing at the same player,
       * which the response must surface rather than stay silent about. */
      expect(response.status).toBe(200);
      expect(json.data.duplicatePlacementWarning).toEqual({ matchNumber: 9 });
    });

    it('omits duplicatePlacementWarning when no concurrent conflict is found post-write', async () => {
      const existing = makeRow({ matchNumber: 1, round: 'winners_qf', version: 2, player1Id: 'p1', player2Id: 'p2' });
      (prisma.bMMatch.findFirst as jest.Mock).mockResolvedValue(existing);
      (prisma.bMMatch.findMany as jest.Mock).mockResolvedValue([existing]);
      (prisma.bMQualification.findFirst as jest.Mock).mockResolvedValue({ id: 'q9', playerId: 'p9' });
      (prisma.bMMatch.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
      (prisma.bMMatch.findUnique as jest.Mock).mockResolvedValue({ ...existing, player1Id: 'p9', version: 3 });

      const { PATCH } = createFinalsHandlers(createMockConfig());
      const response = await PATCH(
        patchRequest({ matchId: 'm1', slotEdit: { op: 'assign', slot: 1, playerId: 'p9', expectedVersion: 2 } }),
        { params: Promise.resolve({ id: 'tournament-123' }) },
      );
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.data.duplicatePlacementWarning).toBeUndefined();
    });

    it('rejects a TBD slot with 422', async () => {
      /* Match 5 (winners_sf) receives from QF1(pos1)/QF2(pos2); neither has
       * completed, so both its slots are still TBD. */
      const existing = makeRow({ matchNumber: 5, round: 'winners_sf', version: 0 });
      (prisma.bMMatch.findFirst as jest.Mock).mockResolvedValue(existing);
      (prisma.bMMatch.findMany as jest.Mock).mockResolvedValue([
        makeRow({ matchNumber: 1, round: 'winners_qf', completed: false }),
        makeRow({ matchNumber: 2, round: 'winners_qf', completed: false }),
        existing,
      ]);

      const { PATCH } = createFinalsHandlers(createMockConfig());
      const response = await PATCH(
        patchRequest({ matchId: 'm5', slotEdit: { op: 'assign', slot: 1, playerId: 'p9', expectedVersion: 0 } }),
        { params: Promise.resolve({ id: 'tournament-123' }) },
      );

      expect(response.status).toBe(422);
      const json = await response.json();
      expect(json.code).toBe('SLOT_TBD');
      expect(prisma.bMMatch.updateMany).not.toHaveBeenCalled();
    });

    it('rejects a playerId that is not a qualification participant with 400', async () => {
      const existing = makeRow({ matchNumber: 1 });
      (prisma.bMMatch.findFirst as jest.Mock).mockResolvedValue(existing);
      (prisma.bMMatch.findMany as jest.Mock).mockResolvedValue([existing]);
      (prisma.bMQualification.findFirst as jest.Mock).mockResolvedValue(null);

      const { PATCH } = createFinalsHandlers(createMockConfig());
      const response = await PATCH(
        patchRequest({
          matchId: 'm1',
          slotEdit: { op: 'assign', slot: 1, playerId: 'not-a-participant', expectedVersion: 2 },
        }),
        { params: Promise.resolve({ id: 'tournament-123' }) },
      );

      expect(response.status).toBe(400);
      expect(prisma.bMMatch.updateMany).not.toHaveBeenCalled();
    });

    it('rejects assigning a player already confirmed in another slot with 409 DUPLICATE_PLACEMENT', async () => {
      const existing = makeRow({ matchNumber: 1, round: 'winners_qf', player1Id: 'p1', player2Id: 'p2' });
      const other = makeRow({ matchNumber: 9, round: 'winners_qf', player1Id: 'p9', player2Id: 'p10' });
      (prisma.bMMatch.findFirst as jest.Mock).mockResolvedValue(existing);
      (prisma.bMMatch.findMany as jest.Mock).mockResolvedValue([existing, other]);
      (prisma.bMQualification.findFirst as jest.Mock).mockResolvedValue({ id: 'q9', playerId: 'p9' });

      const { PATCH } = createFinalsHandlers(createMockConfig());
      const response = await PATCH(
        patchRequest({ matchId: 'm1', slotEdit: { op: 'assign', slot: 2, playerId: 'p9', expectedVersion: 2 } }),
        { params: Promise.resolve({ id: 'tournament-123' }) },
      );

      expect(response.status).toBe(409);
      const json = await response.json();
      expect(json.code).toBe('DUPLICATE_PLACEMENT');
      expect(json.details.matchNumber).toBe(9);
      expect(prisma.bMMatch.updateMany).not.toHaveBeenCalled();
    });

    it("does not false-positive the duplicate guard on the same match's other (different-player) slot", async () => {
      const existing = makeRow({ matchNumber: 1, round: 'winners_qf', player1Id: 'p1', player2Id: 'p2' });
      (prisma.bMMatch.findFirst as jest.Mock).mockResolvedValue(existing);
      (prisma.bMMatch.findMany as jest.Mock).mockResolvedValue([existing]);
      (prisma.bMQualification.findFirst as jest.Mock).mockResolvedValue({ id: 'q9', playerId: 'p9' });
      (prisma.bMMatch.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
      (prisma.bMMatch.findUnique as jest.Mock).mockResolvedValue({ ...existing, player2Id: 'p9', version: 3 });

      const { PATCH } = createFinalsHandlers(createMockConfig());
      const response = await PATCH(
        patchRequest({ matchId: 'm1', slotEdit: { op: 'assign', slot: 2, playerId: 'p9', expectedVersion: 2 } }),
        { params: Promise.resolve({ id: 'tournament-123' }) },
      );

      expect(response.status).toBe(200);
    });

    it('rejects a completed match with 409 MATCH_COMPLETED', async () => {
      const existing = makeRow({ matchNumber: 1, completed: true });
      (prisma.bMMatch.findFirst as jest.Mock).mockResolvedValue(existing);

      const { PATCH } = createFinalsHandlers(createMockConfig());
      const response = await PATCH(
        patchRequest({ matchId: 'm1', slotEdit: { op: 'assign', slot: 1, playerId: 'p9', expectedVersion: 2 } }),
        { params: Promise.resolve({ id: 'tournament-123' }) },
      );

      expect(response.status).toBe(409);
      const json = await response.json();
      expect(json.code).toBe('MATCH_COMPLETED');
    });

    it('rejects a BYE match with 422', async () => {
      const existing = makeRow({ matchNumber: 1, isBye: true });
      (prisma.bMMatch.findFirst as jest.Mock).mockResolvedValue(existing);

      const { PATCH } = createFinalsHandlers(createMockConfig());
      const response = await PATCH(
        patchRequest({ matchId: 'm1', slotEdit: { op: 'assign', slot: 1, playerId: 'p9', expectedVersion: 2 } }),
        { params: Promise.resolve({ id: 'tournament-123' }) },
      );

      expect(response.status).toBe(422);
      const json = await response.json();
      expect(json.code).toBe('BYE_MATCH');
    });

    it('rejects a stale expectedVersion (pre-write check) with 409 VERSION_CONFLICT', async () => {
      const existing = makeRow({ matchNumber: 1, version: 5 });
      (prisma.bMMatch.findFirst as jest.Mock).mockResolvedValue(existing);

      const { PATCH } = createFinalsHandlers(createMockConfig());
      const response = await PATCH(
        patchRequest({ matchId: 'm1', slotEdit: { op: 'assign', slot: 1, playerId: 'p9', expectedVersion: 2 } }),
        { params: Promise.resolve({ id: 'tournament-123' }) },
      );

      expect(response.status).toBe(409);
      const json = await response.json();
      expect(json.code).toBe('VERSION_CONFLICT');
      expect(json.details.currentVersion).toBe(5);
      expect(prisma.bMMatch.updateMany).not.toHaveBeenCalled();
    });

    it('rejects when the write races (updateMany affects 0 rows) with 409 VERSION_CONFLICT', async () => {
      const existing = makeRow({ matchNumber: 1, version: 2 });
      (prisma.bMMatch.findFirst as jest.Mock).mockResolvedValue(existing);
      (prisma.bMMatch.findMany as jest.Mock).mockResolvedValue([existing]);
      (prisma.bMQualification.findFirst as jest.Mock).mockResolvedValue({ id: 'q9', playerId: 'p9' });
      (prisma.bMMatch.updateMany as jest.Mock).mockResolvedValue({ count: 0 });
      (prisma.bMMatch.findUnique as jest.Mock).mockResolvedValue({ ...existing, version: 3 });

      const { PATCH } = createFinalsHandlers(createMockConfig());
      const response = await PATCH(
        patchRequest({ matchId: 'm1', slotEdit: { op: 'assign', slot: 1, playerId: 'p9', expectedVersion: 2 } }),
        { params: Promise.resolve({ id: 'tournament-123' }) },
      );

      expect(response.status).toBe(409);
      const json = await response.json();
      expect(json.code).toBe('VERSION_CONFLICT');
      expect(json.details.currentVersion).toBe(3);
    });
  });

  describe('op: swap (same match)', () => {
    it('swaps player1Id/player2Id in a single updateMany with one version increment', async () => {
      const existing = makeRow({ matchNumber: 1, round: 'winners_qf', player1Id: 'p1', player2Id: 'p2', version: 4 });
      (prisma.bMMatch.findFirst as jest.Mock).mockResolvedValue(existing);
      (prisma.bMMatch.findMany as jest.Mock).mockResolvedValue([existing]);
      (prisma.bMMatch.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
      (prisma.bMMatch.findUnique as jest.Mock).mockResolvedValue({
        ...existing,
        player1Id: 'p2',
        player2Id: 'p1',
        version: 5,
      });

      const { PATCH } = createFinalsHandlers(createMockConfig());
      const response = await PATCH(patchRequest({ matchId: 'm1', slotEdit: { op: 'swap', expectedVersion: 4 } }), {
        params: Promise.resolve({ id: 'tournament-123' }),
      });

      expect(response.status).toBe(200);
      expect(prisma.bMMatch.updateMany).toHaveBeenCalledTimes(1);
      expect(prisma.bMMatch.updateMany).toHaveBeenCalledWith({
        where: { id: 'm1', completed: false, version: 4 },
        data: {
          player1Id: 'p2',
          player2Id: 'p1',
          version: { increment: 1 },
          slotOverrideBy: 'admin-1',
          slotOverrideAt: expect.any(Date),
        },
      });
      expect(prisma.$executeRaw).not.toHaveBeenCalled();
    });

    it('rejects when either slot is still TBD with 422', async () => {
      const existing = makeRow({ matchNumber: 5, round: 'winners_sf', version: 0 });
      (prisma.bMMatch.findFirst as jest.Mock).mockResolvedValue(existing);
      (prisma.bMMatch.findMany as jest.Mock).mockResolvedValue([
        makeRow({ matchNumber: 1, round: 'winners_qf', completed: true }),
        makeRow({ matchNumber: 2, round: 'winners_qf', completed: false }),
        existing,
      ]);

      const { PATCH } = createFinalsHandlers(createMockConfig());
      const response = await PATCH(patchRequest({ matchId: 'm5', slotEdit: { op: 'swap', expectedVersion: 0 } }), {
        params: Promise.resolve({ id: 'tournament-123' }),
      });

      expect(response.status).toBe(422);
      expect(prisma.bMMatch.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('op: swapSlots (different matches, same round)', () => {
    it('runs a single $executeRaw and returns both updated matches on success (affected=2)', async () => {
      const existing = makeRow({
        matchNumber: 1,
        round: 'winners_qf',
        id: 'm1',
        player1Id: 'p1',
        player2Id: 'p2',
        version: 1,
      });
      const target = makeRow({
        matchNumber: 9,
        round: 'winners_qf',
        id: 'm9',
        player1Id: 'p9',
        player2Id: 'p10',
        version: 0,
      });
      (prisma.bMMatch.findFirst as jest.Mock).mockImplementation(({ where }) =>
        Promise.resolve(where.id === 'm1' ? existing : where.id === 'm9' ? target : null),
      );
      (prisma.bMMatch.findMany as jest.Mock).mockResolvedValue([existing, target]);
      (prisma.$executeRaw as jest.Mock).mockResolvedValue(2);
      (prisma.bMMatch.findUnique as jest.Mock).mockImplementation(({ where }) =>
        Promise.resolve(
          where.id === 'm1' ? { ...existing, player1Id: 'p9', version: 2 } : { ...target, player1Id: 'p1', version: 1 },
        ),
      );

      const { PATCH } = createFinalsHandlers(createMockConfig());
      const response = await PATCH(
        patchRequest({
          matchId: 'm1',
          slotEdit: {
            op: 'swapSlots',
            slot: 1,
            targetMatchId: 'm9',
            targetSlot: 1,
            expectedVersion: 1,
            targetExpectedVersion: 0,
          },
        }),
        { params: Promise.resolve({ id: 'tournament-123' }) },
      );
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
      expect(prisma.bMMatch.updateMany).not.toHaveBeenCalled();
      expect(json.data.matches).toHaveLength(2);
      expect(createAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          details: expect.objectContaining({
            op: 'swapSlots',
            changes: [
              { matchNumber: 1, slot: 1, beforePlayerId: 'p1', afterPlayerId: 'p9' },
              { matchNumber: 9, slot: 1, beforePlayerId: 'p9', afterPlayerId: 'p1' },
            ],
          }),
        }),
      );
    });

    it('rejects two matches in different rounds with 400 ROUND_MISMATCH', async () => {
      const existing = makeRow({ matchNumber: 1, round: 'winners_qf', id: 'm1' });
      const target = makeRow({ matchNumber: 5, round: 'winners_sf', id: 'm5' });
      (prisma.bMMatch.findFirst as jest.Mock).mockImplementation(({ where }) =>
        Promise.resolve(where.id === 'm1' ? existing : where.id === 'm5' ? target : null),
      );

      const { PATCH } = createFinalsHandlers(createMockConfig());
      const response = await PATCH(
        patchRequest({
          matchId: 'm1',
          slotEdit: {
            op: 'swapSlots',
            slot: 1,
            targetMatchId: 'm5',
            targetSlot: 1,
            expectedVersion: 2,
            targetExpectedVersion: 0,
          },
        }),
        { params: Promise.resolve({ id: 'tournament-123' }) },
      );

      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.code).toBe('ROUND_MISMATCH');
      expect(prisma.$executeRaw).not.toHaveBeenCalled();
    });

    it('rejects targetMatchId equal to matchId with 400', async () => {
      const existing = makeRow({ matchNumber: 1, id: 'm1' });
      (prisma.bMMatch.findFirst as jest.Mock).mockResolvedValue(existing);

      const { PATCH } = createFinalsHandlers(createMockConfig());
      const response = await PATCH(
        patchRequest({
          matchId: 'm1',
          slotEdit: {
            op: 'swapSlots',
            slot: 1,
            targetMatchId: 'm1',
            targetSlot: 2,
            expectedVersion: 2,
            targetExpectedVersion: 2,
          },
        }),
        { params: Promise.resolve({ id: 'tournament-123' }) },
      );

      expect(response.status).toBe(400);
      expect(prisma.$executeRaw).not.toHaveBeenCalled();
    });

    it('returns 409 VERSION_CONFLICT and leaves both matches untouched when affected=0', async () => {
      const existing = makeRow({ matchNumber: 1, round: 'winners_qf', id: 'm1', version: 1 });
      const target = makeRow({ matchNumber: 9, round: 'winners_qf', id: 'm9', version: 0 });
      (prisma.bMMatch.findFirst as jest.Mock).mockImplementation(({ where }) =>
        Promise.resolve(where.id === 'm1' ? existing : where.id === 'm9' ? target : null),
      );
      (prisma.bMMatch.findMany as jest.Mock).mockResolvedValue([existing, target]);
      (prisma.$executeRaw as jest.Mock).mockResolvedValue(0);
      (prisma.bMMatch.findUnique as jest.Mock).mockImplementation(({ where }) =>
        Promise.resolve(where.id === 'm1' ? existing : target),
      );

      const { PATCH } = createFinalsHandlers(createMockConfig());
      const response = await PATCH(
        patchRequest({
          matchId: 'm1',
          slotEdit: {
            op: 'swapSlots',
            slot: 1,
            targetMatchId: 'm9',
            targetSlot: 1,
            expectedVersion: 1,
            targetExpectedVersion: 0,
          },
        }),
        { params: Promise.resolve({ id: 'tournament-123' }) },
      );

      expect(response.status).toBe(409);
      const json = await response.json();
      expect(json.code).toBe('VERSION_CONFLICT');
      expect(createAuditLog).not.toHaveBeenCalled();
    });

    it('returns 500 when $executeRaw reports an affected count other than 0 or 2 (invariant violation)', async () => {
      const existing = makeRow({ matchNumber: 1, round: 'winners_qf', id: 'm1', version: 1 });
      const target = makeRow({ matchNumber: 9, round: 'winners_qf', id: 'm9', version: 0 });
      (prisma.bMMatch.findFirst as jest.Mock).mockImplementation(({ where }) =>
        Promise.resolve(where.id === 'm1' ? existing : where.id === 'm9' ? target : null),
      );
      (prisma.bMMatch.findMany as jest.Mock).mockResolvedValue([existing, target]);
      (prisma.$executeRaw as jest.Mock).mockResolvedValue(1);

      const { PATCH } = createFinalsHandlers(createMockConfig());
      const response = await PATCH(
        patchRequest({
          matchId: 'm1',
          slotEdit: {
            op: 'swapSlots',
            slot: 1,
            targetMatchId: 'm9',
            targetSlot: 1,
            expectedVersion: 1,
            targetExpectedVersion: 0,
          },
        }),
        { params: Promise.resolve({ id: 'tournament-123' }) },
      );

      expect(response.status).toBe(500);
      expect(createAuditLog).not.toHaveBeenCalled();
    });
  });

  describe('top24 group count detection (playoff support, issue #3017 follow-up)', () => {
    /* generatePlayoffStructure()/generateBracketStructure(16, ...) both branch
     * on the Top24 barrage group count (2 or 3 groups → different seed→slot
     * maps). The TBD guard below must build bracketStructure with the same
     * group count the GET response used, or a slotEdit on a 2-group
     * tournament's playoff/16-bracket match could be wrongly accepted or
     * rejected relative to what the admin sees on screen as confirmed. */
    it('detects a 2-group tournament and passes groupCount=2 to generatePlayoffStructure for a playoff-stage match', async () => {
      const existing = makeRow({ stage: 'playoff', matchNumber: 1, round: 'playoff_r1', version: 0 });
      (prisma.bMMatch.findFirst as jest.Mock).mockResolvedValue(existing);
      (prisma.bMMatch.findMany as jest.Mock).mockResolvedValue([existing]);
      (prisma.bMQualification.findMany as jest.Mock).mockResolvedValue([{ group: 'A' }, { group: 'B' }]);

      const { PATCH } = createFinalsHandlers(createMockConfig());
      await PATCH(patchRequest({ matchId: 'm1', slotEdit: { op: 'swap', expectedVersion: 0 } }), {
        params: Promise.resolve({ id: 'tournament-123' }),
      });

      expect(generatePlayoffStructure).toHaveBeenCalledWith(12, 2);
    });

    it('defaults to groupCount=3 when the qualification group query fails', async () => {
      const existing = makeRow({ stage: 'playoff', matchNumber: 1, round: 'playoff_r1', version: 0 });
      (prisma.bMMatch.findFirst as jest.Mock).mockResolvedValue(existing);
      (prisma.bMMatch.findMany as jest.Mock).mockResolvedValue([existing]);
      (prisma.bMQualification.findMany as jest.Mock).mockRejectedValue(new Error('db unavailable'));

      const { PATCH } = createFinalsHandlers(createMockConfig());
      await PATCH(patchRequest({ matchId: 'm1', slotEdit: { op: 'swap', expectedVersion: 0 } }), {
        params: Promise.resolve({ id: 'tournament-123' }),
      });

      expect(generatePlayoffStructure).toHaveBeenCalledWith(12, 3);
    });

    it('passes the detected groupCount to generateBracketStructure for a 16-bracket finals-stage match', async () => {
      const existing = makeRow({ stage: 'finals', matchNumber: 1, round: 'winners_r1', version: 0 });
      (prisma.bMMatch.findFirst as jest.Mock).mockResolvedValue(existing);
      (prisma.bMMatch.findMany as jest.Mock).mockResolvedValue([existing]);
      (prisma.bMMatch.count as jest.Mock).mockResolvedValue(31);
      (prisma.bMQualification.findMany as jest.Mock).mockResolvedValue([{ group: 'A' }, { group: 'B' }]);

      const { PATCH } = createFinalsHandlers(createMockConfig());
      await PATCH(patchRequest({ matchId: 'm1', slotEdit: { op: 'swap', expectedVersion: 0 } }), {
        params: Promise.resolve({ id: 'tournament-123' }),
      });

      expect(generateBracketStructure).toHaveBeenCalledWith(16, 2);
    });

    it('skips the qualification-group query for the common 8-bracket finals-stage case (cost)', async () => {
      /* prisma.bMMatch.count defaults to 17 in beforeEach → 8-bracket, which
       * ignores groupCount entirely (generateBracketStructure only branches
       * on it for playerCount===16). Querying qualification groups here would
       * be a wasted lookup on every slotEdit for the overwhelmingly common
       * non-Top24 tournament. */
      const existing = makeRow({ stage: 'finals', matchNumber: 1, round: 'winners_qf', version: 0 });
      (prisma.bMMatch.findFirst as jest.Mock).mockResolvedValue(existing);
      (prisma.bMMatch.findMany as jest.Mock).mockResolvedValue([existing]);

      const { PATCH } = createFinalsHandlers(createMockConfig());
      await PATCH(patchRequest({ matchId: 'm1', slotEdit: { op: 'swap', expectedVersion: 0 } }), {
        params: Promise.resolve({ id: 'tournament-123' }),
      });

      expect(generateBracketStructure).toHaveBeenCalledWith(8, 3);
      expect(prisma.bMQualification.findMany).not.toHaveBeenCalled();
    });
  });

  describe('validation', () => {
    it('rejects slotEdit combined with tvNumber with 400', async () => {
      const { PATCH } = createFinalsHandlers(createMockConfig());
      const response = await PATCH(
        patchRequest({ matchId: 'm1', tvNumber: 2, slotEdit: { op: 'swap', expectedVersion: 0 } }),
        { params: Promise.resolve({ id: 'tournament-123' }) },
      );

      expect(response.status).toBe(400);
    });

    it('rejects an unknown op with 400', async () => {
      const existing = makeRow({ matchNumber: 1 });
      (prisma.bMMatch.findFirst as jest.Mock).mockResolvedValue(existing);

      const { PATCH } = createFinalsHandlers(createMockConfig());
      const response = await PATCH(patchRequest({ matchId: 'm1', slotEdit: { op: 'delete', expectedVersion: 2 } }), {
        params: Promise.resolve({ id: 'tournament-123' }),
      });

      expect(response.status).toBe(400);
    });

    it('returns 403 for a non-admin caller before any match lookup', async () => {
      (auth as jest.Mock).mockResolvedValue({ user: { id: 'user-1', role: 'member' } });

      const { PATCH } = createFinalsHandlers(createMockConfig());
      const response = await PATCH(patchRequest({ matchId: 'm1', slotEdit: { op: 'swap', expectedVersion: 0 } }), {
        params: Promise.resolve({ id: 'tournament-123' }),
      });

      expect(response.status).toBe(403);
      expect(prisma.bMMatch.findFirst).not.toHaveBeenCalled();
    });
  });
});
