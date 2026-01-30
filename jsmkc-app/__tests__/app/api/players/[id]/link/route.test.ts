/**
 * @module Player Link Route Tests
 *
 * Test suite for the POST /api/players/[id]/link endpoint.
 * This route allows authenticated users to link their OAuth account to a player profile.
 *
 * The link operation establishes a 1:1 mapping between an OAuth user and a player:
 *   1. User must be authenticated (any role, returns 401 for unauthenticated)
 *   2. Target player must exist (returns 404 if not found)
 *   3. Target player must not already be linked to another user (returns 409)
 *   4. The requesting user must not already be linked to a different player (returns 409)
 *
 * Covers:
 * - Authorization: Requires authentication (401 for unauthenticated)
 * - Validation: Target player existence (404), player already linked (409), user already linked (409)
 * - Success cases: Linking user to player via prisma.player.update
 * - Error handling: Graceful handling of database errors with 500 status
 *
 * IMPORTANT: Uses @ts-nocheck and global jest (not @jest/globals).
 * jest.mock factory functions run in the global jest context due to hoisting.
 * Using global jest throughout avoids mock identity mismatches.
 */
// @ts-nocheck - This test file uses complex mock types for Next.js API routes

jest.mock('@/lib/auth', () => ({
  auth: jest.fn(),
}));

// Logger mock: stable reference to shared logger instance so tests can
// verify logger calls even after clearAllMocks resets call history.
const mockLoggerInstance = {
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
};

jest.mock('@/lib/logger', () => ({
  createLogger: jest.fn(() => mockLoggerInstance),
}));

// Custom next/server mock matching the pattern used in working tournament tests.
jest.mock('next/server', () => {
  const mockJson = jest.fn();
  class MockNextRequest {
    constructor(url, init = {}) {
      this.url = url;
      this.method = init.method || 'GET';
      this._body = init.body;
      const h = init.headers || {};
      this.headers = {
        get: (key) => {
          if (h instanceof Headers) return h.get(key);
          if (h instanceof Map) return h.get(key);
          return h[key] || null;
        },
        forEach: (cb) => {
          if (h instanceof Headers) { h.forEach(cb); return; }
          Object.entries(h).forEach(([k, v]) => cb(v, k));
        },
      };
    }
    async json() {
      if (typeof this._body === 'string') return JSON.parse(this._body);
      return this._body;
    }
  }
  return {
    NextRequest: MockNextRequest,
    NextResponse: {
      json: mockJson,
    },
    __esModule: true,
  };
});

import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { auth } from '@/lib/auth';
import * as linkRoute from '@/app/api/players/[id]/link/route';

const loggerMock = jest.requireMock('@/lib/logger');

describe('POST /api/players/[id]/link', () => {
  const { NextResponse } = jest.requireMock('next/server');

  beforeEach(() => {
    jest.clearAllMocks();
    // Re-wire createLogger after clearAllMocks clears call history
    loggerMock.createLogger.mockReturnValue(mockLoggerInstance);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Authorization', () => {
    it('should return 401 when not authenticated', async () => {
      auth.mockResolvedValue(null);

      await linkRoute.POST(
        new NextRequest('http://localhost:3000/api/players/player-1/link', {
          method: 'POST',
          body: JSON.stringify({}),
        }),
        { params: Promise.resolve({ id: 'player-1' }) }
      );

      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Unauthorized',
        }),
        { status: 401 }
      );
    });

    it('should allow authenticated users to link players', async () => {
      // The link route requires any authenticated user (not just admin).
      // Set up a regular user session.
      auth.mockResolvedValue({
        user: { id: 'user-1', role: 'user' },
      });

      // Step 1: Player exists and is not linked
      const mockPlayer = {
        id: 'player-1',
        name: 'Player 1',
        nickname: 'player1',
        userId: null,
      };
      // First findUnique call: find the player by id
      // Second findUnique call: check if user is already linked to another player
      prisma.player.findUnique
        .mockResolvedValueOnce(mockPlayer)     // Player lookup by id
        .mockResolvedValueOnce(null);           // No existing link for user

      const updatedPlayer = { ...mockPlayer, userId: 'user-1' };
      prisma.player.update.mockResolvedValue(updatedPlayer);

      await linkRoute.POST(
        new NextRequest('http://localhost:3000/api/players/player-1/link', {
          method: 'POST',
          body: JSON.stringify({}),
        }),
        { params: Promise.resolve({ id: 'player-1' }) }
      );

      // Should return the updated player (not an error)
      expect(NextResponse.json).toHaveBeenCalledWith(updatedPlayer);
    });
  });

  describe('Validation', () => {
    it('should return 404 when player does not exist', async () => {
      auth.mockResolvedValue({
        user: { id: 'user-1', role: 'user' },
      });

      // Player not found
      prisma.player.findUnique.mockResolvedValue(null);

      await linkRoute.POST(
        new NextRequest('http://localhost:3000/api/players/player-1/link', {
          method: 'POST',
          body: JSON.stringify({}),
        }),
        { params: Promise.resolve({ id: 'player-1' }) }
      );

      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Player not found',
        }),
        { status: 404 }
      );
    });

    it('should return 409 when player is already linked to a user', async () => {
      auth.mockResolvedValue({
        user: { id: 'user-1', role: 'user' },
      });

      // Player exists but is already linked to another user
      const linkedPlayer = {
        id: 'player-1',
        name: 'Player 1',
        nickname: 'player1',
        userId: 'other-user',
      };
      prisma.player.findUnique.mockResolvedValueOnce(linkedPlayer);

      await linkRoute.POST(
        new NextRequest('http://localhost:3000/api/players/player-1/link', {
          method: 'POST',
          body: JSON.stringify({}),
        }),
        { params: Promise.resolve({ id: 'player-1' }) }
      );

      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Player already linked to a user',
        }),
        { status: 409 }
      );
    });

    it('should return 409 when user is already linked to another player', async () => {
      auth.mockResolvedValue({
        user: { id: 'user-1', role: 'user' },
      });

      // Target player exists and is not linked
      const unlinkedPlayer = {
        id: 'player-1',
        name: 'Player 1',
        nickname: 'player1',
        userId: null,
      };
      // Existing link: user is already linked to a different player
      const existingLinkedPlayer = {
        id: 'player-2',
        name: 'Player 2',
        nickname: 'player2',
        userId: 'user-1',
      };
      prisma.player.findUnique
        .mockResolvedValueOnce(unlinkedPlayer)       // Player lookup by id
        .mockResolvedValueOnce(existingLinkedPlayer); // User already linked check

      await linkRoute.POST(
        new NextRequest('http://localhost:3000/api/players/player-1/link', {
          method: 'POST',
          body: JSON.stringify({}),
        }),
        { params: Promise.resolve({ id: 'player-1' }) }
      );

      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'You are already linked to a player profile',
        }),
        { status: 409 }
      );
    });
  });

  describe('Success Cases', () => {
    it('should link user to player successfully', async () => {
      auth.mockResolvedValue({
        user: { id: 'user-1', role: 'user' },
      });

      const mockPlayer = {
        id: 'player-1',
        name: 'Player 1',
        nickname: 'player1',
        userId: null,
      };

      // First findUnique: player lookup by id (exists, not linked)
      // Second findUnique: check if user is already linked (not linked)
      prisma.player.findUnique
        .mockResolvedValueOnce(mockPlayer)  // Player found, no userId
        .mockResolvedValueOnce(null);       // User not linked to any player

      const updatedPlayer = { ...mockPlayer, userId: 'user-1' };
      prisma.player.update.mockResolvedValue(updatedPlayer);

      await linkRoute.POST(
        new NextRequest('http://localhost:3000/api/players/player-1/link', {
          method: 'POST',
          body: JSON.stringify({}),
        }),
        { params: Promise.resolve({ id: 'player-1' }) }
      );

      // Verify the player lookup
      expect(prisma.player.findUnique).toHaveBeenCalledWith({
        where: { id: 'player-1' },
      });

      // Verify the user-link check
      expect(prisma.player.findUnique).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
      });

      // Verify the update call sets userId on the player
      expect(prisma.player.update).toHaveBeenCalledWith({
        where: { id: 'player-1' },
        data: { userId: 'user-1' },
      });

      // Verify the response returns the updated player
      expect(NextResponse.json).toHaveBeenCalledWith(updatedPlayer);
    });
  });

  describe('Error Handling', () => {
    it('should handle database errors gracefully', async () => {
      auth.mockResolvedValue({
        user: { id: 'user-1', role: 'user' },
      });

      prisma.player.findUnique.mockRejectedValue(new Error('Database error'));

      await linkRoute.POST(
        new NextRequest('http://localhost:3000/api/players/player-1/link', {
          method: 'POST',
          body: JSON.stringify({}),
        }),
        { params: Promise.resolve({ id: 'player-1' }) }
      );

      // The source returns "Failed to link player" on errors
      expect(NextResponse.json).toHaveBeenCalledWith(
        { error: 'Failed to link player' },
        { status: 500 }
      );
    });
  });
});
