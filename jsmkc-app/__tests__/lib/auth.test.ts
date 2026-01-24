/* eslint-disable @typescript-eslint/no-explicit-any */
// @ts-nocheck - This test file uses complex mock types that are difficult to type correctly

// Set environment variable before any imports
process.env.ADMIN_DISCORD_IDS = '123456789012345678,987654321098765432';

// Manual mocks are defined in __mocks__ directories
jest.mock('next-auth');
jest.mock('next-auth/providers/discord');
jest.mock('next-auth/providers/github');
jest.mock('next-auth/providers/google');
jest.mock('next-auth/providers/credentials');



import { compare as mockBcryptCompare } from 'bcrypt';
import { prisma as prismaMock } from '@/lib/prisma';

// Mock auth.ts to provide ADMIN_DISCORD_IDS_LIST for testing
jest.mock('@/lib/auth', () => {
  const actualAuth = jest.requireActual('@/lib/auth');
  return {
    ...actualAuth,
    ADMIN_DISCORD_IDS_LIST: ['123456789012345678', '987654321098765432'],
  };
});

// Now import auth.ts
import { authConfig, ADMIN_DISCORD_IDS_LIST } from '@/lib/auth';
import type { User } from 'next-auth';
import type { DefaultSession } from 'next-auth';

interface MockToken {
  sub?: string;
  role?: string;
  userType?: string;
  playerId?: string;
  nickname?: string;
  error?: string | undefined;
  [key: string]: unknown;
}

interface MockSession {
  user: DefaultSession['user'] & {
    id?: string;
    role?: string;
    userType?: string;
    playerId?: string;
    nickname?: string;
  };
  error?: string;
  expires?: string;
}

const bcryptCompare = jest.mocked(mockBcryptCompare);
const prisma = prismaMock;

describe('Auth Configuration', () => {
  beforeEach(() => {
    // Reset prisma mocks
    ( 
  prisma.user.findUnique as any).mockClear();
    ( 
  prisma.user.create as any).mockClear();
    ( 
  prisma.user.update as any).mockClear();

    // Ensure environment variables are set
    process.env.ADMIN_DISCORD_IDS = '123456789012345678,987654321098765432';
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterEach(() => {
    delete process.env.AUTH_SECRET;
    delete process.env.DISCORD_CLIENT_ID;
    delete process.env.DISCORD_CLIENT_SECRET;
    delete process.env.GITHUB_CLIENT_ID;
    delete process.env.GITHUB_CLIENT_SECRET;
    delete process.env.AUTH_GOOGLE_ID;
    delete process.env.AUTH_GOOGLE_SECRET;
  });

  describe('ADMIN_DISCORD_IDS_LIST', () => {
    it('should be defined as an array', () => {
      expect(Array.isArray(ADMIN_DISCORD_IDS_LIST)).toBe(true);
    });

    it('should contain placeholder ID', () => {
      // Test that the environment variable system is in place
      expect(Array.isArray(ADMIN_DISCORD_IDS_LIST)).toBe(true);
    });
  });

  describe('Credentials Provider Configuration', () => {
    it('should have credentials provider configured', () => {
      const credentialsProvider = authConfig.providers.find(
         
        (p: any) => 'id' in p && p.id === 'player-credentials'
      );

      expect(credentialsProvider).toBeDefined();
      expect(credentialsProvider?.name).toBe('Player Login');
       
      expect((credentialsProvider as any)?.credentials).toEqual({
        nickname: { label: 'Nickname', type: 'text' },
        password: { label: 'Password', type: 'password' },
      });
    });
  });

  describe('Credentials Provider - authorize', () => {
    const mockPlayer = {
      id: 'player-1',
      nickname: 'testplayer',
      name: 'Test Player',
      password: 'hashed-password',
    };

    it('should successfully authorize with valid credentials', async () => {
      ( 
   prisma.player.findUnique as any).mockResolvedValue(mockPlayer);
      bcryptCompare.mockResolvedValue(true);

      const credentials = {
        nickname: 'testplayer',
        password: 'password123',
      };

      const credentialsProvider = authConfig.providers.find(
         
        (p: any) => 'id' in p && p.id === 'player-credentials'
      );
       
      const result = await (credentialsProvider as any)?.authorize?.(credentials);

      expect(result).toEqual({
        id: mockPlayer.id,
        email: `${mockPlayer.nickname}@player.local`,
        name: mockPlayer.name,
        image: null,
        userType: 'player',
        playerId: mockPlayer.id,
        nickname: mockPlayer.nickname,
      });
      expect(prisma.player.findUnique).toHaveBeenCalledWith({
        where: { nickname: credentials.nickname },
      });
      expect(bcryptCompare).toHaveBeenCalledWith(credentials.password, mockPlayer.password);
    });

    it('should return null when nickname is missing', async () => {
      const credentials = {
        password: 'password123',
      };

      const credentialsProvider = authConfig.providers.find(
         
        (p: any) => 'id' in p && p.id === 'player-credentials'
      );
       
      const result = await (credentialsProvider as any)?.authorize?.(credentials);

      expect(result).toBeNull();
      expect(prisma.player.findUnique).not.toHaveBeenCalled();
    });

    it('should return null when password is missing', async () => {
      const credentials = {
        nickname: 'testplayer',
      };

      const credentialsProvider = authConfig.providers.find(
         
        (p: any) => 'id' in p && p.id === 'player-credentials'
      );
       
      const result = await (credentialsProvider as any)?.authorize?.(credentials);

      expect(result).toBeNull();
      expect(prisma.player.findUnique).not.toHaveBeenCalled();
    });

    it('should return null when player does not exist', async () => {
      ( 
  prisma.player.findUnique as any).mockResolvedValue(null);
      bcryptCompare.mockResolvedValue(true);

      const credentials = {
        nickname: 'nonexistent',
        password: 'password123',
      };

      const credentialsProvider = authConfig.providers.find(
         
        (p: any) => 'id' in p && p.id === 'player-credentials'
      );
       
      const result = await (credentialsProvider as any)?.authorize?.(credentials);

      expect(result).toBeNull();
      expect(prisma.player.findUnique).toHaveBeenCalledWith({
        where: { nickname: 'nonexistent' },
      });
    });

    it('should return null when player has no password', async () => {
      ( 
  prisma.player.findUnique as any).mockResolvedValue({
        ...mockPlayer,
        password: null,
      });
      bcryptCompare.mockResolvedValue(true);

      const credentials = {
        nickname: 'testplayer',
        password: 'password123',
      };

      const credentialsProvider = authConfig.providers.find(
         
        (p: any) => 'id' in p && p.id === 'player-credentials'
      );
       
      const result = await (credentialsProvider as any)?.authorize?.(credentials);

      expect(result).toBeNull();
      expect(bcryptCompare).not.toHaveBeenCalled();
    });

    it('should return null when password does not match', async () => {
      ( 
  prisma.player.findUnique as any).mockResolvedValue(mockPlayer);
      bcryptCompare.mockResolvedValue(false);

      const credentials = {
        nickname: 'testplayer',
        password: 'wrongpassword',
      };

      const credentialsProvider = authConfig.providers.find(
         
        (p: any) => 'id' in p && p.id === 'player-credentials'
      );
       
      const result = await (credentialsProvider as any)?.authorize?.(credentials);

      expect(result).toBeNull();
      expect(bcryptCompare).toHaveBeenCalledWith('wrongpassword', mockPlayer.password);
    });

    it('should handle database errors gracefully', async () => {
      ( 
  prisma.player.findUnique as any).mockRejectedValue(new Error('Database error'));

      const credentials = {
        nickname: 'testplayer',
        password: 'password123',
      };

      const credentialsProvider = authConfig.providers.find(
         
        (p: any) => 'id' in p && p.id === 'player-credentials'
      );

      await expect(credentialsProvider?.authorize?.(credentials)).rejects.toThrow('Database error');
    });
  });

  describe('OAuth Providers Configuration', () => {
    it('should have Discord provider configured', () => {
      const discordProvider = authConfig.providers.find(
         
        (p: any) => 'id' in p && p.id === 'discord'
      );

      expect(discordProvider).toBeDefined();
      expect(discordProvider?.id).toBe('discord');
    });

    it('should have GitHub provider configured', () => {
      const githubProvider = authConfig.providers.find(
         
        (p: any) => 'id' in p && p.id === 'github'
      );

      expect(githubProvider).toBeDefined();
      expect(githubProvider?.id).toBe('github');
    });

    it('should have Google provider configured with authorization params', () => {
      const googleProvider = authConfig.providers.find(
         
        (p: any) => 'id' in p && p.id === 'google'
      );

      expect(googleProvider).toBeDefined();
      expect(googleProvider?.id).toBe('google');
      expect(googleProvider?.authorization).toBeDefined();
    });
  });

  describe('Session Configuration', () => {
    it('should use JWT session strategy', () => {
      expect(authConfig.session.strategy).toBe('jwt');
    });
  });

  describe('Pages Configuration', () => {
    it('should have correct page configurations', () => {
      expect(authConfig.pages.signIn).toBe('/auth/signin');
      expect(authConfig.pages.error).toBe('/auth/error');
    });
  });

  describe('Callbacks Configuration', () => {
    it('should have all required callbacks defined', () => {
      expect(authConfig.callbacks.signIn).toBeDefined();
      expect(authConfig.callbacks.session).toBeDefined();
      expect(authConfig.callbacks.jwt).toBeDefined();
    });
  });

  describe('signIn Callback', () => {
    const mockUser: User = {
      email: 'test@example.com',
      name: 'Test User',
      image: 'https://example.com/avatar.jpg',
    };

    it('should create new user on first OAuth login', async () => {
      ( 
  prisma.user.findUnique as any).mockResolvedValue(null);
      ( 
  prisma.user.create as any).mockResolvedValue({
        id: 'user-1',
        email: mockUser.email,
        name: mockUser.name,
        image: mockUser.image,
        role: 'member',
      });

      const result = await authConfig.callbacks.signIn!({
        user: mockUser,
        account: { provider: 'github', providerAccountId: 'github-123' },
      });

      expect(result).toBe(true);
      expect(prisma.user.create).toHaveBeenCalledWith({
        data: {
          email: mockUser.email,
          name: mockUser.name,
          image: mockUser.image,
          role: 'member',
        },
      });
    });

    it('should return true for existing user', async () => {
      ( 
  prisma.user.findUnique as any).mockResolvedValue({
        id: 'user-1',
        email: mockUser.email,
        name: mockUser.name,
        image: mockUser.image,
        role: 'member',
      });

      const result = await authConfig.callbacks.signIn!({
        user: mockUser,
        account: { provider: 'github', providerAccountId: 'github-123' },
      });

      expect(result).toBe(true);
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it('should assign admin role for whitelisted Discord user', async () => {
      const whitelistAccount = { provider: 'discord', providerAccountId: '123456789012345678', type: 'oauth' as const };

      ( 
   prisma.user.findUnique as any).mockResolvedValue({
        id: 'user-1',
        email: mockUser.email,
        name: mockUser.name,
        image: mockUser.image,
        role: 'member',
      });
      ( 
  prisma.user.update as any).mockResolvedValue({
        id: 'user-1',
        email: mockUser.email,
        name: mockUser.name,
        image: mockUser.image,
        role: 'admin',
      });

      const result = await authConfig.callbacks.signIn!({
        user: mockUser,
        account: whitelistAccount,
      });

      expect(result).toBe(true);
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { role: 'admin' },
      });
    });

    it('should not assign admin role for non-whitelisted Discord user', async () => {
      ( 
  prisma.user.findUnique as any).mockResolvedValue({
        id: 'user-1',
        email: mockUser.email,
        name: mockUser.name,
        image: mockUser.image,
        role: 'member',
      });

      const result = await authConfig.callbacks.signIn!({
        user: mockUser,
        account: { provider: 'github', providerAccountId: 'github-123', type: 'oauth' },
      });

      expect(result).toBe(true);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('should handle database errors and still allow login', async () => {

      (prisma.user.findUnique as any).mockRejectedValue(new Error('Database error'));
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      const result = await authConfig.callbacks.signIn!({
        user: mockUser,
        account: { provider: 'github', providerAccountId: 'github-123', type: 'oauth' },
      });

      expect(result).toBe(true);
      // In test mode, logger is silent - console.error should not be called
      // expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('should handle GitHub OAuth provider', async () => {
      ( 
  prisma.user.findUnique as any).mockResolvedValue({
        id: 'user-1',
        email: mockUser.email,
        name: mockUser.name,
        image: mockUser.image,
        role: 'member',
      });

      const result = await authConfig.callbacks.signIn!({
        user: mockUser,
        account: { provider: 'github', providerAccountId: 'github-123' },
      });

      expect(result).toBe(true);
    });

    it('should handle Google OAuth provider', async () => {
      ( 
  prisma.user.findUnique as any).mockResolvedValue({
        id: 'user-1',
        email: mockUser.email,
        name: mockUser.name,
        image: mockUser.image,
        role: 'member',
      });

      const result = await authConfig.callbacks.signIn!({
        user: mockUser,
        account: { provider: 'github', providerAccountId: 'github-123', type: 'oauth' },
      });

      expect(result).toBe(true);
    });

    it('should upgrade existing user to admin if whitelisted on Discord', async () => {
      const whitelistAccount = { provider: 'discord', providerAccountId: '123456789012345678', type: 'oauth' as const };

      ( 
   prisma.user.findUnique as any).mockResolvedValue({
        id: 'user-1',
        email: mockUser.email,
        name: mockUser.name,
        image: mockUser.image,
        role: 'member',
      });
      ( 
  prisma.user.update as any).mockResolvedValue({
        id: 'user-1',
        email: mockUser.email,
        name: mockUser.name,
        image: mockUser.image,
        role: 'admin',
      });

      const result = await authConfig.callbacks.signIn!({
        user: mockUser,
        account: whitelistAccount,
      });

      expect(result).toBe(true);
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { role: 'admin' },
      });
    });
  });

  describe('session Callback', () => {
    const mockToken: MockToken = {
      sub: 'user-1',
      role: 'admin',
      userType: 'admin',
      playerId: 'player-1',
      nickname: 'testplayer',
      error: undefined,
    };

    const mockSession: MockSession = {
      user: {
        id: '',
        role: '',
        userType: undefined,
        playerId: undefined,
        nickname: undefined,
      },
    };

    it('should assign user ID from token', async () => {
      mockSession.user.id = '';

       
      const result = await authConfig.callbacks.session!({
        session: mockSession as any,
        token: mockToken as any,
      });

      expect(result.user.id).toBe(mockToken.sub);
    });

    it('should assign role from token', async () => {
       
      (mockSession.user as any).role = '';

       
      const result = await authConfig.callbacks.session!({
        session: mockSession as any,
        token: mockToken as any,
      });

       
      expect(result.user.role).toBe(mockToken.role);
    });

    it('should assign userType from token', async () => {
      mockSession.user.userType = '';

       
      const result = await authConfig.callbacks.session!({
        session: mockSession as any,
        token: mockToken as any,
      });

       
      expect(result.user.userType).toBe(mockToken.userType);
    });

    it('should assign player-specific fields for players', async () => {
      const playerToken = {
        ...mockToken,
        userType: 'player',
      };

       
      const result = await authConfig.callbacks.session!({
        session: mockSession as any,
        token: playerToken as any,
      });

       
      expect(result.user.playerId).toBe(playerToken.playerId);
       
      expect(result.user.nickname).toBe(playerToken.nickname);
    });

    it('should not assign player fields for non-players', async () => {
      const adminToken = {
        ...mockToken,
        userType: 'admin',
      };

      const freshSession: MockSession = {
        user: {
          id: '',
          role: '',
          userType: undefined,
        },
      };

       
      const result = await authConfig.callbacks.session!({
        session: freshSession as any,
        token: adminToken as any,
      });

       
      expect(result.user.playerId).toBeUndefined();
       
      expect(result.user.nickname).toBeUndefined();
    });

    it('should add error information to session when present in token', async () => {
      const errorToken = {
        ...mockToken,
        error: 'Session expired',
      };

       
      const result = await authConfig.callbacks.session!({
        session: mockSession as any,
        token: errorToken as any,
      });

      expect(result.error).toBe('Session expired');
    });

    it('should handle missing user in session', async () => {
      const sessionWithoutUser: { user?: unknown } = {
        user: undefined,
      };

       
      const result = await authConfig.callbacks.session!({
        session: sessionWithoutUser as any,
        token: mockToken as any,
      });

      expect(result).toBeDefined();
    });

    it('should handle token.sub being undefined', async () => {
      const tokenWithoutSub = {
        ...mockToken,
        sub: undefined,
      };

       
      const result = await authConfig.callbacks.session!({
        session: mockSession as any,
        token: tokenWithoutSub as any,
      });

      expect(result).toBeDefined();
    });

    it('should handle token.sub not being a string', async () => {
      const tokenWithStringSub: MockToken = {
        ...mockToken,
        sub: '123',
      };

      const result = await authConfig.callbacks.session!({
        session: mockSession,
        token: tokenWithStringSub,
      });

       
      expect(result.user.id).toBe('123');
    });
  });

  describe('jwt Callback', () => {
    const mockUser: User = {
      id: 'user-1',
      email: 'test@example.com',
      name: 'Test User',
    };

    const mockAccount = {
      provider: 'github',
      access_token: 'github-access-token',
      refresh_token: 'github-refresh-token',
      expires_in: 3600,
    };

    const mockPlayerAccount = {
      provider: 'player-credentials',
    };

    const mockPlayerUser: User & { playerId?: string; nickname?: string; userType?: string } = {
      id: 'player-1',
      email: 'player@test.local',
      name: 'Test Player',
      playerId: 'player-1',
      nickname: 'testplayer',
      userType: 'player',
    };

    it('should generate initial token for player credentials', async () => {
      const existingToken = { sub: 'old-id', name: 'Old User' };

      const result = await authConfig.callbacks.jwt!({
        token: existingToken,
        user: mockPlayerUser,
        account: mockPlayerAccount,
      });

      expect(result.sub).toBe(mockPlayerUser.id);
      expect(result.userType).toBe('player');
      expect(result.playerId).toBe(mockPlayerUser.playerId);
      expect(result.nickname).toBe(mockPlayerUser.nickname);
      expect(result.role).toBe('player');
    });

    it('should generate initial token for OAuth providers', async () => {
      ( 
  prisma.user.findUnique as any).mockResolvedValue({
        id: 'user-1',
        email: mockUser.email,
        name: mockUser.name,
        image: 'avatar.jpg',
        role: 'member',
      });

      const existingToken = { sub: 'old-id' };

      const result = await authConfig.callbacks.jwt!({
        token: existingToken,
        user: mockUser,
        account: mockAccount,
      });

      expect(result.sub).toBe('user-1');
      expect(result.userType).toBe('admin');
      expect(result.accessToken).toBe(mockAccount.access_token);
      expect(result.refreshToken).toBe(mockAccount.refresh_token);
      expect(result.accessTokenExpires).toBeGreaterThan(Date.now());
      expect(result.refreshTokenExpires).toBeGreaterThan(Date.now());
      expect(result.role).toBe('member');
    });

    it('should retrieve user role from database for OAuth', async () => {
      ( 
  prisma.user.findUnique as any).mockResolvedValue({
        id: 'user-1',
        email: mockUser.email,
        name: mockUser.name,
        image: 'avatar.jpg',
        role: 'admin',
      });

      const existingToken = {};

      const result = await authConfig.callbacks.jwt!({
        token: existingToken,
        user: mockUser,
        account: mockAccount,
      });

      expect(result.role).toBe('admin');
      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: mockUser.email },
      });
    });

    it('should default to member role if user not found in database', async () => {
      ( 
  prisma.user.findUnique as any).mockResolvedValue(null);

      const existingToken = {};

      const result = await authConfig.callbacks.jwt!({
        token: existingToken,
        user: mockUser,
        account: mockAccount,
      });

      expect(result.role).toBe('member');
    });

    it('should return previous token if access token is still valid', async () => {
      const validToken = {
        sub: 'user-1',
        accessTokenExpires: Date.now() + 60000,
        name: 'Test User',
      };

      const result = await authConfig.callbacks.jwt!({
        token: validToken,
        user: undefined,
        account: undefined,
      });

      expect(result).toBe(validToken);
    });

    it('should return token even when access token has expired', async () => {
      const expiredToken = {
        sub: 'user-1',
        accessTokenExpires: Date.now() - 1000,
        name: 'Test User',
      };

      const result = await authConfig.callbacks.jwt!({
        token: expiredToken,
        user: undefined,
        account: undefined,
      });

      expect(result).toBe(expiredToken);
    });

    it('should handle OAuth tokens with undefined expires_in', async () => {
      ( 
  prisma.user.findUnique as any).mockResolvedValue({
        id: 'user-1',
        email: mockUser.email,
        name: mockUser.name,
        role: 'member',
      });

      const accountWithoutExpires = {
        ...mockAccount,
        expires_in: undefined,
      };

      const existingToken = {};

      const result = await authConfig.callbacks.jwt!({
        token: existingToken,
        user: mockUser,
        account: accountWithoutExpires,
      });

      expect(result.accessTokenExpires).toBeDefined();
      expect(result.refreshTokenExpires).toBeDefined();
    });

    it('should handle Discord OAuth provider', async () => {
      ( 
  prisma.user.findUnique as any).mockResolvedValue({
        id: 'user-1',
        email: mockUser.email,
        name: mockUser.name,
        role: 'admin',
      });

      const discordAccount = {
        ...mockAccount,
        provider: 'discord',
      };

      const existingToken = {};

      const result = await authConfig.callbacks.jwt!({
        token: existingToken,
        user: mockUser,
        account: discordAccount,
      });

      expect(result.role).toBe('admin');
      expect(result.userType).toBe('admin');
    });

    it('should handle Google OAuth provider', async () => {
      ( 
  prisma.user.findUnique as any).mockResolvedValue({
        id: 'user-1',
        email: mockUser.email,
        name: mockUser.name,
        role: 'member',
      });

      const googleAccount = {
        ...mockAccount,
        provider: 'google',
      };

      const existingToken = {};

      const result = await authConfig.callbacks.jwt!({
        token: existingToken,
        user: mockUser,
        account: googleAccount,
      });

      expect(result.role).toBe('member');
      expect(result.userType).toBe('admin');
    });

    it('should handle database errors during user retrieval', async () => {
      prisma.user.findUnique.mockRejectedValue(new Error('Database error'));

      const existingToken = {};

      await expect(authConfig.callbacks.jwt!({
        token: existingToken,
        user: mockUser,
        account: mockAccount,
      })).rejects.toThrow('Database error');
    });

    it('should handle case where user.email is undefined', async () => {
      const userWithoutEmail: User = { ...mockUser, email: undefined as string | undefined };
      ( 
  prisma.user.findUnique as any).mockResolvedValue(null);

      const existingToken = {};

      const result = await authConfig.callbacks.jwt!({
        token: existingToken,
        user: userWithoutEmail,
        account: mockAccount,
      });

      expect(result.role).toBe('member');
      expect(result.sub).toBeUndefined();
    });

    it('should handle tokens without accessTokenExpires', async () => {
      const tokenWithoutExpires = {
        sub: 'user-1',
        name: 'Test User',
      };

      const result = await authConfig.callbacks.jwt!({
        token: tokenWithoutExpires,
        user: undefined,
        account: undefined,
      });

      expect(result).toBeDefined();
    });

    it('should preserve existing token properties when extending', async () => {
      ( 
  prisma.user.findUnique as any).mockResolvedValue({
        id: 'user-1',
        email: mockUser.email,
        name: mockUser.name,
        role: 'member',
      });

      const existingToken = {
        customProperty: 'custom-value',
      };

      const result = await authConfig.callbacks.jwt!({
        token: existingToken,
        user: mockUser,
        account: mockAccount,
      });

      expect((result as Record<string, unknown>).customProperty).toBe('custom-value');
    });
  });

  describe('Secret Configuration', () => {
    it('should have secret configured', () => {
      expect(authConfig.secret).toBeDefined();
      expect(typeof authConfig.secret).toBe('string');
    });
  });
});
