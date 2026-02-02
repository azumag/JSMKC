/**
 * @module __tests__/lib/api-factories/finals-matches-route.test.ts
 *
 * Tests for the finals matches route factory (finals-matches-route.ts).
 *
 * Covers:
 * POST handler:
 * - Admin authentication (401 for non-admin, 401 for unauthenticated)
 * - Zod schema validation (invalid UUID, missing required field, invalid enum)
 * - Player existence check (404 when player1 or player2 not found)
 * - Match number auto-increment from last finals match
 * - Match number defaults to 1 when no existing matches
 * - Successful match creation (201 with match data)
 * - Player1/player2 relations included in response
 * - Body sanitization when sanitizeBody=true
 * - No sanitization when sanitizeBody=false
 * - Audit log resilience (succeeds when audit log fails)
 * - Database error handling (500)
 */

jest.mock('@/lib/auth', () => ({ auth: jest.fn() }));
jest.mock('@/lib/audit-log', () => ({
  createAuditLog: jest.fn(),
  AUDIT_ACTIONS: { CREATE_BM_MATCH: 'CREATE_BM_MATCH' },
}));
jest.mock('@/lib/sanitize', () => ({
  sanitizeInput: jest.fn((data: unknown) => data),
}));
jest.mock('@/lib/logger', () => ({
  createLogger: jest.fn(() => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() })),
}));

import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { createAuditLog } from '@/lib/audit-log';
import { sanitizeInput } from '@/lib/sanitize';
import { createFinalsMatchesHandlers } from '@/lib/api-factories/finals-matches-route';

/** Valid UUID for test player IDs */
const PLAYER1_ID = '11111111-1111-4111-a111-111111111111';
const PLAYER2_ID = '22222222-2222-4222-a222-222222222222';

/** Factory for creating test config with optional overrides */
const createMockConfig = (overrides = {}) => ({
  matchModel: 'bMMatch',
  loggerName: 'test-finals-matches-api',
  auditAction: 'CREATE_BM_MATCH',
  auditTargetType: 'BMMatch',
  sanitizeBody: false,
  ...overrides,
});

/** Admin session mock */
const adminSession = { user: { id: 'admin-1', role: 'admin' } };

/** Valid request body with all required fields */
const validBody = {
  player1Id: PLAYER1_ID,
  player2Id: PLAYER2_ID,
  bracket: 'winners',
};

/** Mock player records */
const mockPlayer1 = { id: PLAYER1_ID, name: 'Player 1', nickname: 'P1' };
const mockPlayer2 = { id: PLAYER2_ID, name: 'Player 2', nickname: 'P2' };

/** Mock created match returned by prisma.create */
const mockCreatedMatch = {
  id: 'match-1',
  tournamentId: 't1',
  matchNumber: 1,
  stage: 'finals',
  player1Id: PLAYER1_ID,
  player2Id: PLAYER2_ID,
  player1: mockPlayer1,
  player2: mockPlayer2,
};

/** Helper to create a NextRequest with JSON body */
const createPostRequest = (body: unknown, headers?: Record<string, string>) =>
  new NextRequest('http://localhost:3000/api/tournaments/t1/bm/finals/matches', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'user-agent': 'TestAgent', ...headers },
  });

describe('Finals Matches Route Factory', () => {
  const config = createMockConfig();
  const { POST } = createFinalsMatchesHandlers(config);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // === AUTH TESTS ===

  // Auth: Returns 401 when not authenticated
  it('should return 401 when not authenticated', async () => {
    (auth as jest.Mock).mockResolvedValue(null);

    const request = createPostRequest(validBody);
    const params = Promise.resolve({ id: 't1' });
    const response = await POST(request, { params });

    expect(response.status).toBe(401);
    const json = await response.json();
    expect(json.error).toBe('Unauthorized: Admin access required');
  });

  // Auth: Returns 401 when user is not admin
  it('should return 401 when user is not admin', async () => {
    (auth as jest.Mock).mockResolvedValue({ user: { id: 'u1', role: 'member' } });

    const request = createPostRequest(validBody);
    const params = Promise.resolve({ id: 't1' });
    const response = await POST(request, { params });

    expect(response.status).toBe(401);
  });

  // === ZOD VALIDATION TESTS ===

  // Validation: Returns 400 for invalid player1Id (not a UUID)
  it('should return 400 for invalid player1Id (not a UUID)', async () => {
    (auth as jest.Mock).mockResolvedValue(adminSession);

    const request = createPostRequest({ ...validBody, player1Id: 'not-a-uuid' });
    const params = Promise.resolve({ id: 't1' });
    const response = await POST(request, { params });

    expect(response.status).toBe(400);
    const json = await response.json();
    /* Zod UUID validation returns "Invalid uuid" error message */
    expect(json.error).toMatch(/uuid/i);
  });

  // Validation: Returns 400 when player2Id is missing
  it('should return 400 when player2Id is missing', async () => {
    (auth as jest.Mock).mockResolvedValue(adminSession);

    const request = createPostRequest({ player1Id: PLAYER1_ID });
    const params = Promise.resolve({ id: 't1' });
    const response = await POST(request, { params });

    expect(response.status).toBe(400);
    const json = await response.json();
    /* Zod string type validation returns error for undefined field */
    expect(json.error).toMatch(/expected string|required/i);
  });

  // Validation: Returns 400 for invalid bracket enum value
  it('should return 400 for invalid bracket value', async () => {
    (auth as jest.Mock).mockResolvedValue(adminSession);

    const request = createPostRequest({ ...validBody, bracket: 'invalid_bracket' });
    const params = Promise.resolve({ id: 't1' });
    const response = await POST(request, { params });

    expect(response.status).toBe(400);
    const json = await response.json();
    /* Zod enum validation returns message listing valid options */
    expect(json.error).toBeTruthy();
  });

  // === PLAYER LOOKUP TESTS ===

  // Player lookup: Returns 404 when player1 not found
  it('should return 404 when player1 not found', async () => {
    (auth as jest.Mock).mockResolvedValue(adminSession);
    /* player1 not found, player2 found */
    (prisma.player.findUnique as jest.Mock)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(mockPlayer2);

    const request = createPostRequest(validBody);
    const params = Promise.resolve({ id: 't1' });
    const response = await POST(request, { params });

    expect(response.status).toBe(404);
    const json = await response.json();
    expect(json.error).toBe('One or both players not found');
  });

  // Player lookup: Returns 404 when player2 not found
  it('should return 404 when player2 not found', async () => {
    (auth as jest.Mock).mockResolvedValue(adminSession);
    /* player1 found, player2 not found */
    (prisma.player.findUnique as jest.Mock)
      .mockResolvedValueOnce(mockPlayer1)
      .mockResolvedValueOnce(null);

    const request = createPostRequest(validBody);
    const params = Promise.resolve({ id: 't1' });
    const response = await POST(request, { params });

    expect(response.status).toBe(404);
    const json = await response.json();
    expect(json.error).toBe('One or both players not found');
  });

  // === AUTO-INCREMENT TESTS ===

  // Auto-increment: Sets matchNumber from last finals match + 1
  it('should auto-increment matchNumber from last finals match', async () => {
    (auth as jest.Mock).mockResolvedValue(adminSession);
    (prisma.player.findUnique as jest.Mock)
      .mockResolvedValueOnce(mockPlayer1)
      .mockResolvedValueOnce(mockPlayer2);
    /* Last match has matchNumber 5, so new one should be 6 */
    (prisma.bMMatch.findFirst as jest.Mock).mockResolvedValue({ matchNumber: 5 });
    (prisma.bMMatch.create as jest.Mock).mockResolvedValue({ ...mockCreatedMatch, matchNumber: 6 });

    const request = createPostRequest(validBody);
    const params = Promise.resolve({ id: 't1' });
    await POST(request, { params });

    /* Verify create was called with matchNumber = 6 */
    expect(prisma.bMMatch.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ matchNumber: 6 }),
      }),
    );
  });

  // Auto-increment: Sets matchNumber to 1 when no existing matches
  it('should set matchNumber to 1 when no existing finals matches', async () => {
    (auth as jest.Mock).mockResolvedValue(adminSession);
    (prisma.player.findUnique as jest.Mock)
      .mockResolvedValueOnce(mockPlayer1)
      .mockResolvedValueOnce(mockPlayer2);
    /* No existing finals matches */
    (prisma.bMMatch.findFirst as jest.Mock).mockResolvedValue(null);
    (prisma.bMMatch.create as jest.Mock).mockResolvedValue(mockCreatedMatch);

    const request = createPostRequest(validBody);
    const params = Promise.resolve({ id: 't1' });
    await POST(request, { params });

    /* Verify create was called with matchNumber = 1 */
    expect(prisma.bMMatch.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ matchNumber: 1 }),
      }),
    );
  });

  // === SUCCESS TESTS ===

  // Success: Creates match and returns 201 with match data
  it('should create match and return 201 with match data', async () => {
    (auth as jest.Mock).mockResolvedValue(adminSession);
    (prisma.player.findUnique as jest.Mock)
      .mockResolvedValueOnce(mockPlayer1)
      .mockResolvedValueOnce(mockPlayer2);
    (prisma.bMMatch.findFirst as jest.Mock).mockResolvedValue(null);
    (prisma.bMMatch.create as jest.Mock).mockResolvedValue(mockCreatedMatch);

    const request = createPostRequest(validBody);
    const params = Promise.resolve({ id: 't1' });
    const response = await POST(request, { params });

    expect(response.status).toBe(201);
    const json = await response.json();
    expect(json.message).toBe('Match created successfully');
    expect(json.match).toEqual(mockCreatedMatch);
  });

  // Include: Player1 and player2 relations are included in create query
  it('should include player1 and player2 relations in create query', async () => {
    (auth as jest.Mock).mockResolvedValue(adminSession);
    (prisma.player.findUnique as jest.Mock)
      .mockResolvedValueOnce(mockPlayer1)
      .mockResolvedValueOnce(mockPlayer2);
    (prisma.bMMatch.findFirst as jest.Mock).mockResolvedValue(null);
    (prisma.bMMatch.create as jest.Mock).mockResolvedValue(mockCreatedMatch);

    const request = createPostRequest(validBody);
    const params = Promise.resolve({ id: 't1' });
    await POST(request, { params });

    /* Verify include has player1: true and player2: true */
    expect(prisma.bMMatch.create).toHaveBeenCalledWith(
      expect.objectContaining({
        include: { player1: true, player2: true },
      }),
    );
  });

  // === SANITIZATION TESTS ===

  // Sanitize: Calls sanitizeInput when sanitizeBody=true
  it('should call sanitizeInput when sanitizeBody=true', async () => {
    const sanitizeConfig = createMockConfig({ sanitizeBody: true });
    const { POST: sanitizedPOST } = createFinalsMatchesHandlers(sanitizeConfig);

    (auth as jest.Mock).mockResolvedValue(adminSession);
    (prisma.player.findUnique as jest.Mock)
      .mockResolvedValueOnce(mockPlayer1)
      .mockResolvedValueOnce(mockPlayer2);
    (prisma.bMMatch.findFirst as jest.Mock).mockResolvedValue(null);
    (prisma.bMMatch.create as jest.Mock).mockResolvedValue(mockCreatedMatch);

    const request = createPostRequest(validBody);
    const params = Promise.resolve({ id: 't1' });
    await sanitizedPOST(request, { params });

    /* sanitizeInput should be called with the parsed body */
    expect(sanitizeInput).toHaveBeenCalledTimes(1);
    expect(sanitizeInput).toHaveBeenCalledWith(validBody);
  });

  // No sanitize: Does not call sanitizeInput when sanitizeBody=false
  it('should not call sanitizeInput when sanitizeBody=false', async () => {
    (auth as jest.Mock).mockResolvedValue(adminSession);
    (prisma.player.findUnique as jest.Mock)
      .mockResolvedValueOnce(mockPlayer1)
      .mockResolvedValueOnce(mockPlayer2);
    (prisma.bMMatch.findFirst as jest.Mock).mockResolvedValue(null);
    (prisma.bMMatch.create as jest.Mock).mockResolvedValue(mockCreatedMatch);

    const request = createPostRequest(validBody);
    const params = Promise.resolve({ id: 't1' });
    await POST(request, { params });

    /* sanitizeInput should NOT be called */
    expect(sanitizeInput).not.toHaveBeenCalled();
  });

  // === AUDIT RESILIENCE ===

  // Audit: Succeeds even when audit log creation fails
  it('should succeed even when audit log creation fails', async () => {
    (auth as jest.Mock).mockResolvedValue(adminSession);
    (prisma.player.findUnique as jest.Mock)
      .mockResolvedValueOnce(mockPlayer1)
      .mockResolvedValueOnce(mockPlayer2);
    (prisma.bMMatch.findFirst as jest.Mock).mockResolvedValue(null);
    (prisma.bMMatch.create as jest.Mock).mockResolvedValue(mockCreatedMatch);
    /* Audit log throws but should not break the main flow */
    (createAuditLog as jest.Mock).mockRejectedValue(new Error('Audit log failed'));

    const request = createPostRequest(validBody);
    const params = Promise.resolve({ id: 't1' });
    const response = await POST(request, { params });

    /* Should still return 201 despite audit log failure */
    expect(response.status).toBe(201);
    const json = await response.json();
    expect(json.match).toEqual(mockCreatedMatch);
  });

  // === ERROR HANDLING ===

  // Error: Returns 500 on database failure
  it('should return 500 on database failure', async () => {
    (auth as jest.Mock).mockResolvedValue(adminSession);
    /* Simulate database error during request.json() processing flow */
    (prisma.player.findUnique as jest.Mock).mockRejectedValue(new Error('DB error'));

    const request = createPostRequest(validBody);
    const params = Promise.resolve({ id: 't1' });
    const response = await POST(request, { params });

    expect(response.status).toBe(500);
    const json = await response.json();
    expect(json.error).toBe('Failed to create match');
  });
});
