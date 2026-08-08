/**
 * @module auth.test
 *
 * Hybrid auth coverage for Discord admin login and player credentials.
 */
// @ts-nocheck

process.env.ADMIN_DISCORD_IDS = '123456789012345678,987654321098765432';
process.env.DISCORD_CLIENT_ID = 'discord-client-id';
process.env.DISCORD_CLIENT_SECRET = 'discord-client-secret';

jest.mock('next-auth');
jest.mock('next-auth/providers/discord');
jest.mock('next-auth/providers/credentials');
jest.mock('bcryptjs', () => ({
  compare: jest.fn(),
}));

import { compare as mockBcryptCompare } from 'bcryptjs';
import prisma from '@/lib/prisma';
import { authConfig, getAdminDiscordIds } from '@/lib/auth';

const bcryptCompare = mockBcryptCompare as jest.Mock;

describe('authConfig', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.ADMIN_DISCORD_IDS = '123456789012345678,987654321098765432';
    process.env.DISCORD_CLIENT_ID = 'discord-client-id';
    process.env.DISCORD_CLIENT_SECRET = 'discord-client-secret';
  });

  describe('admin Discord allowlist', () => {
    it('parses admin Discord IDs from the environment', () => {
      expect(getAdminDiscordIds()).toEqual(['123456789012345678', '987654321098765432']);
    });

    it('filters blank values from ADMIN_DISCORD_IDS', () => {
      process.env.ADMIN_DISCORD_IDS = ' 123456789012345678, , 987654321098765432 ,,';
      expect(getAdminDiscordIds()).toEqual(['123456789012345678', '987654321098765432']);
    });
  });

  describe('provider configuration', () => {
    it('registers Discord, player credentials, and QR login providers', () => {
      expect(authConfig.providers).toHaveLength(3);
      expect(authConfig.providers[0]).toMatchObject({
        id: 'discord',
      });
      expect(authConfig.providers[1]).toMatchObject({
        id: 'player-credentials',
        name: 'Player Login',
      });
      expect(authConfig.providers[2]).toMatchObject({
        id: 'player-qr-login',
        name: 'QR Login',
      });
    });
  });

  describe('credentials authorize', () => {
    const provider = authConfig.providers[1] as any;

    it('returns a player session for valid credentials', async () => {
      (prisma.player.findUnique as jest.Mock).mockResolvedValue({
        id: 'player-1',
        name: 'Test Player',
        nickname: 'test-player',
        password: 'hashed-password',
      });
      bcryptCompare.mockResolvedValue(true);

      const result = await provider.authorize({
        nickname: 'test-player',
        password: 'secret',
      });

      expect(prisma.player.findUnique).toHaveBeenCalledWith({
        where: { nickname: 'test-player', deletedAt: null },
        omit: { password: false },
      });
      expect(result).toEqual({
        id: 'player-1',
        name: 'Test Player',
        email: 'test-player@player.local',
        image: null,
        role: 'player',
        userType: 'player',
        playerId: 'player-1',
        nickname: 'test-player',
      });
    });

    it('returns null when credentials are incomplete', async () => {
      const result = await provider.authorize({ nickname: 'test-player' });
      expect(result).toBeNull();
      expect(prisma.player.findUnique).not.toHaveBeenCalled();
    });

    it('returns null when password verification fails', async () => {
      (prisma.player.findUnique as jest.Mock).mockResolvedValue({
        id: 'player-1',
        nickname: 'test-player',
        name: 'Test Player',
        password: 'hashed-password',
      });
      bcryptCompare.mockResolvedValue(false);

      const result = await provider.authorize({
        nickname: 'test-player',
        password: 'wrong',
      });

      expect(result).toBeNull();
    });

    it('excludes soft-deleted players from the lookup (issue #3061)', async () => {
      (prisma.player.findUnique as jest.Mock).mockResolvedValue(null);

      await provider.authorize({ nickname: 'deleted-player', password: 'secret' });

      expect(prisma.player.findUnique).toHaveBeenCalledWith({
        where: { nickname: 'deleted-player', deletedAt: null },
        omit: { password: false },
      });
    });
  });

  describe('QR login authorize', () => {
    const provider = authConfig.providers[2] as any;

    it('returns a player session for a valid QR token', async () => {
      (prisma.player.findUnique as jest.Mock).mockResolvedValue({
        id: 'player-1',
        name: 'Test Player',
        nickname: 'test-player',
      });

      const result = await provider.authorize({ token: 'raw-qr-token' });

      expect(prisma.player.findUnique).toHaveBeenCalledWith({
        where: { qrLoginTokenHash: expect.any(String), deletedAt: null },
      });
      expect(result).toEqual({
        id: 'player-1',
        name: 'Test Player',
        email: 'test-player@player.local',
        image: null,
        role: 'player',
        userType: 'player',
        playerId: 'player-1',
        nickname: 'test-player',
      });
    });

    it('returns null when the token is missing', async () => {
      const result = await provider.authorize({});
      expect(result).toBeNull();
      expect(prisma.player.findUnique).not.toHaveBeenCalled();
    });

    it('returns null when no player matches the token hash (revoked/invalid)', async () => {
      (prisma.player.findUnique as jest.Mock).mockResolvedValue(null);

      const result = await provider.authorize({ token: 'revoked-or-bogus-token' });

      expect(result).toBeNull();
    });

    it('returns null and logs when the database lookup throws', async () => {
      (prisma.player.findUnique as jest.Mock).mockRejectedValue(new Error('DB down'));

      const result = await provider.authorize({ token: 'raw-qr-token' });

      expect(result).toBeNull();
    });

    it('excludes soft-deleted players from the token lookup (issue #3061)', async () => {
      (prisma.player.findUnique as jest.Mock).mockResolvedValue(null);

      await provider.authorize({ token: 'raw-qr-token' });

      expect(prisma.player.findUnique).toHaveBeenCalledWith({
        where: { qrLoginTokenHash: expect.any(String), deletedAt: null },
      });
    });
  });

  describe('signIn callback', () => {
    it('allows credential-based sign-in', async () => {
      const result = await authConfig.callbacks.signIn({
        user: { id: 'player-1' },
        account: { provider: 'player-credentials' },
      });

      expect(result).toBe(true);
    });

    it('allows QR login sign-in', async () => {
      const result = await authConfig.callbacks.signIn({
        user: { id: 'player-1' },
        account: { provider: 'player-qr-login' },
      });

      expect(result).toBe(true);
    });

    it('redirects non-whitelisted Discord users to NotWhitelisted error page', async () => {
      const result = await authConfig.callbacks.signIn({
        user: { email: 'user@example.com' },
        account: { provider: 'discord', providerAccountId: 'discord-user' },
        profile: { id: '111111111111111111' },
      });

      expect(result).toBe('/auth/error?error=NotWhitelisted');
    });

    it('redirects to ServerError when DB operation fails during Discord sign-in', async () => {
      (prisma.account.findUnique as jest.Mock).mockRejectedValue(new Error('DB connection failed'));

      const result = await authConfig.callbacks.signIn({
        user: { email: 'admin@example.com' },
        account: {
          provider: 'discord',
          providerAccountId: 'discord-user',
          type: 'oauth',
        },
        profile: { id: '123456789012345678' },
      });

      expect(result).toBe('/auth/error?error=ServerError');
    });

    it('denies sign-in for unknown providers', async () => {
      const result = await authConfig.callbacks.signIn({
        user: { id: 'user-1' },
        account: { provider: 'unknown-provider' },
      });

      expect(result).toBe(false);
    });

    it('creates an admin user and account for a whitelisted Discord user', async () => {
      (prisma.account.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.user.create as jest.Mock).mockResolvedValue({
        id: 'user-1',
        email: 'admin@example.com',
        role: 'admin',
      });
      (prisma.account.create as jest.Mock).mockResolvedValue({ id: 'account-1' });

      const user = {
        email: 'admin@example.com',
        name: 'Discord Admin',
        image: 'https://cdn.example.com/avatar.png',
      };

      const result = await authConfig.callbacks.signIn({
        user,
        account: {
          provider: 'discord',
          providerAccountId: 'discord-user',
          type: 'oauth',
        },
        profile: { id: '123456789012345678' },
      });

      expect(result).toBe(true);
      expect(prisma.user.create).toHaveBeenCalled();
      expect(prisma.account.create).toHaveBeenCalled();
      expect(user.id).toBe('user-1');
      expect(user.role).toBe('admin');
      expect(user.userType).toBe('admin');
    });
  });

  describe('session callback', () => {
    it('maps token fields to the session user', async () => {
      const session = { user: {} };
      const token = {
        sub: 'user-1',
        role: 'admin',
        userType: 'admin',
        accessTokenExpires: 111,
        refreshTokenExpires: 222,
      };

      const result = await authConfig.callbacks.session({ session, token });

      expect(result.user).toEqual({
        id: 'user-1',
        role: 'admin',
        userType: 'admin',
        playerId: undefined,
        nickname: undefined,
      });
      expect(result.accessTokenExpires).toBe(111);
      expect(result.refreshTokenExpires).toBe(222);
    });
  });

  describe('jwt callback', () => {
    beforeEach(() => {
      // Issue #3065: the jwt callback revalidates the player row on a timer,
      // so every player-token test needs a live (non-deleted) player lookup.
      (prisma.player.findUnique as jest.Mock).mockResolvedValue({
        id: 'player-1',
        deletedAt: null,
      });
    });

    it('creates a token for credential logins', async () => {
      const result = await authConfig.callbacks.jwt({
        token: {},
        user: {
          id: 'player-1',
          playerId: 'player-1',
          nickname: 'test-player',
        },
        account: { provider: 'player-credentials' },
      });

      expect(result.role).toBe('player');
      expect(result.userType).toBe('player');
      expect(result.playerId).toBe('player-1');
      expect(result.nickname).toBe('test-player');
      expect(result.accessTokenExpires).toBeGreaterThan(Date.now() - 1000);
      expect(result.refreshTokenExpires).toBeGreaterThan(Date.now() - 1000);
    });

    it('creates a token for QR logins', async () => {
      const result = await authConfig.callbacks.jwt({
        token: {},
        user: {
          id: 'player-1',
          playerId: 'player-1',
          nickname: 'test-player',
        },
        account: { provider: 'player-qr-login' },
      });

      expect(result.role).toBe('player');
      expect(result.userType).toBe('player');
      expect(result.playerId).toBe('player-1');
      expect(result.nickname).toBe('test-player');
    });

    it('creates an admin token for Discord logins', async () => {
      const result = await authConfig.callbacks.jwt({
        token: {},
        user: { id: 'user-1' },
        account: { provider: 'discord' },
      });

      expect(result.role).toBe('admin');
      expect(result.userType).toBe('admin');
      expect(result.playerId).toBeUndefined();
      expect(result.nickname).toBeUndefined();
    });

    it('refreshes the access token while the refresh window is still valid', async () => {
      const now = Date.now();
      const result = await authConfig.callbacks.jwt({
        token: {
          sub: 'player-1',
          accessTokenExpires: now - 1,
          refreshTokenExpires: now + 60_000,
        },
      });

      expect(result.accessTokenExpires).toBeGreaterThan(now);
    });

    /* Issue #3065: a deleted player's existing JWT session must not keep
     * working. The jwt callback strips the player identity when the row is
     * gone or soft-deleted, on a 15-minute revalidation timer. */
    it('invalidates the session when the player row is soft-deleted', async () => {
      (prisma.player.findUnique as jest.Mock).mockResolvedValue({
        id: 'player-1',
        deletedAt: '2026-07-27T00:00:00.000Z',
      });

      const result = await authConfig.callbacks.jwt({
        token: {
          sub: 'player-1',
          role: 'player',
          userType: 'player',
          playerId: 'player-1',
          nickname: 'deleted-player',
          playerStatusCheckedAt: 0,
        },
      });

      expect(result.role).toBeUndefined();
      expect(result.userType).toBeUndefined();
      expect(result.playerId).toBeUndefined();
      expect(result.nickname).toBeUndefined();
    });

    it('invalidates the session when the player row no longer exists', async () => {
      (prisma.player.findUnique as jest.Mock).mockResolvedValue(null);

      const result = await authConfig.callbacks.jwt({
        token: {
          sub: 'player-1',
          role: 'player',
          userType: 'player',
          playerId: 'player-1',
          nickname: 'gone-player',
          playerStatusCheckedAt: 0,
        },
      });

      expect(result.playerId).toBeUndefined();
      expect(result.userType).toBeUndefined();
    });

    it('keeps the session when the player row is still active', async () => {
      const now = Date.now();
      const result = await authConfig.callbacks.jwt({
        token: {
          sub: 'player-1',
          role: 'player',
          userType: 'player',
          playerId: 'player-1',
          nickname: 'live-player',
          playerStatusCheckedAt: 0,
        },
      });

      expect(result.playerId).toBe('player-1');
      expect(result.userType).toBe('player');
      expect(result.playerStatusCheckedAt).toBeGreaterThan(now - 1000);
    });

    it('skips the DB revalidation while the timer has not elapsed', async () => {
      const now = Date.now();
      await authConfig.callbacks.jwt({
        token: {
          sub: 'player-1',
          role: 'player',
          userType: 'player',
          playerId: 'player-1',
          nickname: 'cached-player',
          playerStatusCheckedAt: now,
        },
      });

      expect(prisma.player.findUnique).not.toHaveBeenCalled();
    });
  });

  describe('pages configuration', () => {
    it('uses the custom sign-in and error pages', () => {
      expect(authConfig.pages).toEqual({
        signIn: '/auth/signin',
        error: '/auth/error',
      });
    });
  });

  describe('reverse-proxy support', () => {
    it('enables trustHost for Cloudflare deployments', () => {
      expect(authConfig.trustHost).toBe(true);
    });
  });
});
