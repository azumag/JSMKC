/**
 * NextAuth v5 configuration
 *
 * Authentication supports two paths:
 * - Players sign in with nickname + password
 * - Administrators sign in with Discord OAuth
 *
 * Discord access is restricted to users listed in ADMIN_DISCORD_IDS.
 */

import NextAuth from 'next-auth';
import Discord from 'next-auth/providers/discord';
import Credentials from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import { createLogger } from '@/lib/logger';
import { REFRESH_TOKEN_EXPIRY } from '@/lib/constants';

/**
 * Lazily import Prisma to avoid pulling the database client into the
 * edge middleware bundle. The middleware only uses the `auth()` wrapper
 * for session checking; Prisma is only needed during sign-in callbacks
 * which run in the server (non-edge) context.
 */
async function getPrisma() {
  const { default: prisma } = await import('@/lib/prisma');
  return prisma;
}

const logger = createLogger('auth');

export function getAdminDiscordIds(): string[] {
  const ids = process.env.ADMIN_DISCORD_IDS || '';
  return ids
    .split(',')
    .map((id) => id.trim())
    .filter((id) => id.length > 0);
}

function isAllowedDiscordAdmin(profile: { id?: string } | undefined): boolean {
  if (!profile?.id) {
    return false;
  }

  return getAdminDiscordIds().includes(String(profile.id));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleDiscordAdminSignIn(user: any, account: any): Promise<void> {
  const prisma = await getPrisma();
  const providerAccountId = String(account.providerAccountId);
  const fallbackEmail = `discord-${providerAccountId}@discord.local`;

  const existingAccount = await prisma.account.findUnique({
    where: {
      provider_providerAccountId: {
        provider: 'discord',
        providerAccountId,
      },
    },
  });

  let dbUser = existingAccount
    ? await prisma.user.findUnique({ where: { id: existingAccount.userId } })
    : null;

  if (!dbUser) {
    dbUser = await prisma.user.findUnique({
      where: { email: user.email || fallbackEmail },
    });
  }

  if (!dbUser) {
    dbUser = await prisma.user.create({
      data: {
        email: user.email || fallbackEmail,
        name: user.name || null,
        image: user.image || null,
        role: 'admin',
      },
    });
    logger.info('New admin user created via Discord', {
      email: dbUser.email,
      providerAccountId,
    });
  } else if (dbUser.role !== 'admin') {
    dbUser = await prisma.user.update({
      where: { id: dbUser.id },
      data: { role: 'admin' },
    });
    logger.info('Existing user upgraded to admin', {
      userId: dbUser.id,
      providerAccountId,
    });
  }

  if (!existingAccount) {
    await prisma.account.create({
      data: {
        userId: dbUser.id,
        type: account.type,
        provider: 'discord',
        providerAccountId,
        refresh_token: account.refresh_token,
        access_token: account.access_token,
        expires_at: account.expires_at,
        token_type: account.token_type,
        scope: account.scope,
        id_token: account.id_token,
        session_state: account.session_state as string | undefined,
      },
    });
  }

  user.id = dbUser.id;
  user.role = 'admin';
  user.userType = 'admin';
}

export const authConfig = {
  /**
   * trustHost: Required when deployed behind a reverse proxy (Cloudflare).
   * Without this, NextAuth v5 cannot determine the canonical host and
   * throws a Configuration error on every auth request.
   */
  trustHost: true,
  providers: [
    Discord({
      clientId: process.env.DISCORD_CLIENT_ID!,
      clientSecret: process.env.DISCORD_CLIENT_SECRET!,
    }),
    Credentials({
      id: 'player-credentials',
      name: 'Player Login',
      credentials: {
        nickname: {
          label: 'Nickname',
          type: 'text',
          placeholder: 'Enter your player nickname',
        },
        password: {
          label: 'Password',
          type: 'password',
          placeholder: 'Enter your password',
        },
      },
      async authorize(credentials) {
        if (!credentials?.nickname || !credentials?.password) {
          logger.warn('Player login attempt with missing credentials');
          return null;
        }

        const prisma = await getPrisma();
        const nickname = credentials.nickname as string;
        const password = credentials.password as string;

        try {
          const player = await prisma.player.findUnique({
            where: { nickname },
            omit: { password: false },
          });

          if (!player || !player.password) {
            logger.warn('Player login failed: player not found or no password', {
              nickname,
            });
            return null;
          }

          const isValid = await bcrypt.compare(password, player.password);
          if (!isValid) {
            logger.warn('Player login failed: invalid password', { nickname });
            return null;
          }

          logger.info('Player login successful', {
            nickname,
            playerId: player.id,
          });

          return {
            id: player.id,
            name: player.name,
            email: `${player.nickname}@player.local`,
            image: null,
            role: 'player',
            userType: 'player',
            playerId: player.id,
            nickname: player.nickname,
          };
        } catch (error) {
          logger.error('Player login error', {
            error: error instanceof Error ? error.message : String(error),
          });
          return null;
        }
      },
    }),
  ],

  session: {
    strategy: 'jwt' as const,
  },

  callbacks: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async signIn({ user, account, profile }: any) {
      if (account?.provider === 'player-credentials') {
        return true;
      }

      if (account?.provider === 'discord') {
        if (!isAllowedDiscordAdmin(profile)) {
          logger.warn('Discord login denied for non-admin user', {
            discordId: profile?.id,
          });
          /**
           * Return a redirect URL instead of `false` so the error page can
           * distinguish "not in whitelist" from "server error".
           * NextAuth v5 treats a returned string as a redirect target.
           */
          return '/auth/error?error=NotWhitelisted';
        }

        try {
          await handleDiscordAdminSignIn(user, account);
          return true;
        } catch (error) {
          logger.error('Discord admin sign-in failed', {
            error: error instanceof Error ? error.message : String(error),
            discordId: profile?.id,
          });
          /** Redirect with a specific error code so the user sees
           *  "server error" rather than generic "access denied". */
          return '/auth/error?error=ServerError';
        }
      }

      return false;
    },

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async session({ session, token }: any) {
      if (token && session.user) {
        session.user.id = token.sub || token.playerId || '';
        session.user.role = token.role || 'player';
        session.user.userType = token.userType || 'player';
        session.user.playerId = token.playerId as string | undefined;
        session.user.nickname = token.nickname as string | undefined;

        (session as Record<string, unknown>).accessTokenExpires =
          token.accessTokenExpires;
        (session as Record<string, unknown>).refreshTokenExpires =
          token.refreshTokenExpires;
      }

      return session;
    },

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async jwt({ token, user, account }: any) {
      if (user && account) {
        const now = Date.now();

        if (account.provider === 'player-credentials') {
          token.role = 'player';
          token.userType = 'player';
          token.playerId = (user as { playerId?: string }).playerId;
          token.nickname = (user as { nickname?: string }).nickname;
        } else if (account.provider === 'discord') {
          token.role = 'admin';
          token.userType = 'admin';
          delete token.playerId;
          delete token.nickname;
        }

        token.accessTokenExpires = now + REFRESH_TOKEN_EXPIRY;
        token.refreshTokenExpires = now + REFRESH_TOKEN_EXPIRY;

        logger.debug('JWT token created', {
          userId: user.id,
          role: token.role,
          userType: token.userType,
        });
      }

      if (
        token.accessTokenExpires &&
        typeof token.accessTokenExpires === 'number'
      ) {
        const now = Date.now();
        if (now > token.accessTokenExpires) {
          if (
            token.refreshTokenExpires &&
            typeof token.refreshTokenExpires === 'number' &&
            now < token.refreshTokenExpires
          ) {
            token.accessTokenExpires = now + REFRESH_TOKEN_EXPIRY;
            logger.debug('Access token refreshed', { userId: token.sub });
          } else {
            logger.info('Session expired, re-authentication required', {
              userId: token.sub,
            });
          }
        }
      }

      return token;
    },
  },

  pages: {
    signIn: '/auth/signin',
    error: '/auth/error',
  },
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const { handlers, signIn, signOut, auth } = NextAuth(authConfig as any);
