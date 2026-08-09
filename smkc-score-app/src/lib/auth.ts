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
import type { User } from 'next-auth';
import Discord from 'next-auth/providers/discord';
import Credentials from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import { createLogger } from '@/lib/logger';
import { REFRESH_TOKEN_EXPIRY } from '@/lib/constants';
import { hashQrLoginToken } from '@/lib/qr-login-token';

/**
 * Provider IDs that authenticate directly as a player (as opposed to
 * Discord admin OAuth). Both grant an identical player session shape —
 * QR login (issue #3055) is an additional sign-in method, not a
 * replacement for nickname+password, so it must be treated the same way
 * everywhere a "player-credentials" check exists today.
 */
const PLAYER_PROVIDER_IDS = ['player-credentials', 'player-qr-login'] as const;
function isPlayerProvider(providerId: string | undefined): boolean {
  return !!providerId && (PLAYER_PROVIDER_IDS as readonly string[]).includes(providerId);
}

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

/** How often a player JWT session re-checks that the player row still exists
 * and is not soft-deleted (issue #3065). */
const PLAYER_SESSION_REVALIDATE_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes

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
async function handleDiscordAdminSignIn(user: any, account: any, profile: any): Promise<void> {
  // Defense-in-depth: verify whitelist even if outer callback already checked.
  // This prevents privilege escalation if the function is ever called directly
  // without the outer guard.
  if (!isAllowedDiscordAdmin(profile)) {
    throw new Error('Discord admin sign-in attempted by non-whitelisted user');
  }

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

  let dbUser = existingAccount ? await prisma.user.findUnique({ where: { id: existingAccount.userId } }) : null;

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
    // Only promote to admin if already verified as Discord admin via whitelist
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
          // deletedAt: null excludes soft-deleted players (issue #3061) — without
          // it, a player removed by an admin could still sign in with their old
          // password indefinitely.
          const player = await prisma.player.findUnique({
            where: { nickname, deletedAt: null },
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
    Credentials({
      id: 'player-qr-login',
      name: 'QR Login',
      credentials: {
        token: { label: 'Token', type: 'text' },
      },
      async authorize(credentials) {
        if (!credentials?.token || typeof credentials.token !== 'string') {
          logger.warn('QR login attempt with missing token');
          return null;
        }

        const prisma = await getPrisma();
        const token = credentials.token;

        try {
          const tokenHash = await hashQrLoginToken(token);
          // deletedAt: null excludes soft-deleted players (issue #3061) — see
          // the matching comment on the player-credentials provider above.
          const player = await prisma.player.findUnique({
            where: { qrLoginTokenHash: tokenHash, deletedAt: null },
          });

          if (!player) {
            logger.warn('QR login failed: token not recognized or revoked');
            return null;
          }

          logger.info('QR login successful', {
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
          logger.error('QR login error', {
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
      if (isPlayerProvider(account?.provider)) {
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
          await handleDiscordAdminSignIn(user, account, profile);
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
        // Issue #3087: when a deleted player's session was invalidated,
        // token.role/token.userType are absent — do NOT fall back to 'player',
        // which would resurrect a half-valid identity.
        session.user.role = token.role;
        session.user.userType = token.userType;
        session.user.playerId = token.playerId as string | undefined;
        session.user.nickname = token.nickname as string | undefined;

        (session as Record<string, unknown>).accessTokenExpires = token.accessTokenExpires;
        (session as Record<string, unknown>).refreshTokenExpires = token.refreshTokenExpires;
      }

      return session;
    },

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async jwt({ token, user, account }: any) {
      if (user && account) {
        const now = Date.now();

        if (isPlayerProvider(account.provider)) {
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

      /* Issue #3065: a JWT session is stateless, so a player who is
       * soft-deleted (or hard-deleted) after signing in would otherwise keep
       * operating until the token expires. Re-check the player row at most
       * once per PLAYER_SESSION_REVALIDATE_INTERVAL_MS (a cheap indexed read)
       * and strip the player identity from the token when the row is gone or
       * soft-deleted. Falls back to keeping the session on a transient DB
       * error rather than logging the player out mid-tournament. */
      if (token.userType === 'player' && typeof token.playerId === 'string') {
        const lastChecked = typeof token.playerStatusCheckedAt === 'number' ? token.playerStatusCheckedAt : 0;
        const now = Date.now();
        if (now - lastChecked > PLAYER_SESSION_REVALIDATE_INTERVAL_MS) {
          let revalidateSucceeded = false;
          try {
            const prisma = await getPrisma();
            const player = await prisma.player.findUnique({
              where: { id: token.playerId },
              select: { id: true, deletedAt: true },
            });
            if (!player || player.deletedAt) {
              const invalidatedPlayerId = token.playerId;
              delete token.role;
              delete token.userType;
              delete token.playerId;
              delete token.nickname;
              // Issue #3078: NextAuth auto-populates token.sub with the sign-in
              // user id; the session callback falls back to it for
              // session.user.id, so a deleted player would otherwise keep a
              // live user id in the session. Drop it together with the rest.
              delete token.sub;
              logger.info('Player session invalidated because the player was deleted', {
                playerId: invalidatedPlayerId,
              });
              return token;
            }
            revalidateSucceeded = true;
          } catch (error) {
            // Issue #3079: on a transient DB error, do NOT advance the timer —
            // otherwise a deleted player's session stays valid for another
            // full interval. We also must NOT return early here so the
            // access-token refresh block below still runs (issue #3086).
            logger.warn('Failed to revalidate player session status; keeping session', {
              error: error instanceof Error ? error.message : String(error),
              playerId: token.playerId,
            });
          }
          if (revalidateSucceeded) {
            token.playerStatusCheckedAt = now;
          }
        }
      }

      if (token.accessTokenExpires && typeof token.accessTokenExpires === 'number') {
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

// Destructure with explicit type for `auth` so jest.mocked(auth) infers the correct type in test files.
// NextAuth(config as any) causes TypeScript to lose type information, making jest.mocked(auth) infer 'never'.
// We use { user?: User } | null instead of Session | null because Session.expires is a required field
// that would force all 100+ test fixtures to include it — YAGNI. User has all-optional fields so
// mock objects like { user: { id, role } } remain valid without modification.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _nextAuth = NextAuth(authConfig as any);
export const handlers = _nextAuth.handlers;
export const signIn = _nextAuth.signIn;
export const signOut = _nextAuth.signOut;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const auth: (...args: any[]) => Promise<{ user?: User } | null> = _nextAuth.auth;
