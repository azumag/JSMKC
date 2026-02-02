/**
 * NextAuth v5 Configuration
 *
 * Configures authentication for the JSMKC tournament management system
 * using NextAuth v5 (next-auth@beta) with the App Router.
 *
 * Authentication strategy:
 * - Admin operations: OAuth via Discord, GitHub, or Google
 * - Player score entry: Credential-based login (nickname + password)
 *   Players are auto-identified from their session for score reporting.
 *
 * Session strategy: JWT (JSON Web Tokens)
 * - Stateless sessions stored in cookies (no server-side session store)
 * - Tokens include custom claims: role, userType, accessTokenExpires
 * - Refresh token rotation for seamless session extension
 *
 * Admin identification:
 * - Discord users whose IDs are listed in ADMIN_DISCORD_IDS env var
 *   are automatically assigned the 'admin' role
 * - Other OAuth users get the 'member' role
 *
 * User creation/upgrade flow (signIn callback):
 * 1. User signs in via OAuth provider
 * 2. If no User record exists, create one with 'member' role
 * 3. If user's Discord ID is in admin list, upgrade to 'admin'
 * 4. Link the OAuth account to the User record
 *
 * Usage:
 *   import { auth, signIn, signOut } from '@/lib/auth';
 *   const session = await auth(); // Server-side session check
 */

import NextAuth from 'next-auth';
import Discord from 'next-auth/providers/discord';
import GitHub from 'next-auth/providers/github';
import Google from 'next-auth/providers/google';
import Credentials from 'next-auth/providers/credentials';
import bcrypt from 'bcrypt';
import prisma from '@/lib/prisma';
import { createLogger } from '@/lib/logger';
import { REFRESH_TOKEN_EXPIRY } from '@/lib/constants';

/** Logger scoped to authentication operations */
const logger = createLogger('auth');

// ============================================================
// Transient Connection Error Detection
// ============================================================

/**
 * Determines if an error is a transient connection error that should be retried.
 *
 * This function checks for common Prisma/Data Proxy connection error patterns
 * that are temporary and can be resolved by retrying the operation.
 *
 * @param error - The error to check
 * @returns true if the error is transient and should be retried
 */
function isTransientConnectionError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes('fetch failed') ||
    message.includes("Can't reach database server") ||
    message.includes('P2024') ||
    message.includes('Connection pool timeout') ||
    message.includes('ECONNREFUSED') ||
    message.includes('ETIMEDOUT')
  );
}

// ============================================================
// OAuth Sign-In Handler
// ============================================================

/**
 * Handles OAuth sign-in by creating or updating the user record.
 *
 * This function performs the following operations:
 * 1. Checks if a user with the email already exists
 * 2. Creates a new user if they don't exist
 * 3. Upgrades the user to admin if they're in the Discord admin list
 * 4. Links the OAuth account to the user record
 *
 * @param user - The user object from the OAuth provider
 * @param account - The account object from the OAuth provider
 * @param profile - The profile object from the OAuth provider
 * @throws Error if database operations fail
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleOAuthSignIn(user: any, account: any, profile: any): Promise<void> {
  // Check if a user with this email already exists
  let dbUser = await prisma.user.findUnique({
    where: { email: user.email },
  });

  // Determine the role based on Discord admin list.
  // Only Discord accounts can have admin role because the
  // JSMKC community uses Discord as its primary platform.
  const isAdmin =
    account.provider === 'discord' &&
    profile?.id &&
    ADMIN_DISCORD_IDS_LIST.includes(String(profile.id));
  const role = isAdmin ? 'admin' : 'member';

  if (!dbUser) {
    // Create new user record for first-time sign-in
    dbUser = await prisma.user.create({
      data: {
        email: user.email,
        name: user.name || null,
        image: user.image || null,
        role,
      },
    });
    logger.info('New user created via OAuth', {
      email: user.email,
      provider: account.provider,
      role,
    });
  } else if (isAdmin && dbUser.role !== 'admin') {
    // Upgrade existing user to admin if they're in the admin list.
    // This handles the case where an existing user's Discord ID
    // is added to the admin list after their first sign-in.
    await prisma.user.update({
      where: { id: dbUser.id },
      data: { role: 'admin' },
    });
    logger.info('User upgraded to admin', {
      email: user.email,
      userId: dbUser.id,
    });
  }

  // Link the OAuth account to the user record if not already linked.
  // This allows a user to sign in with multiple providers.
  const existingAccount = await prisma.account.findUnique({
    where: {
      provider_providerAccountId: {
        provider: account.provider,
        providerAccountId: account.providerAccountId,
      },
    },
  });

  if (!existingAccount) {
    await prisma.account.create({
      data: {
        userId: dbUser.id,
        type: account.type,
        provider: account.provider,
        providerAccountId: account.providerAccountId,
        refresh_token: account.refresh_token,
        access_token: account.access_token,
        expires_at: account.expires_at,
        token_type: account.token_type,
        scope: account.scope,
        id_token: account.id_token,
        session_state: account.session_state as string | undefined,
      },
    });
    logger.info('OAuth account linked', {
      userId: dbUser.id,
      provider: account.provider,
    });
  }

  // Set the user ID to the database ID for consistent JWT claims
  user.id = dbUser.id;
}

// ============================================================
// Admin Discord ID Management
// ============================================================

/**
 * Retrieves the list of admin Discord user IDs from environment variables.
 *
 * The ADMIN_DISCORD_IDS environment variable contains a comma-separated
 * list of Discord user IDs that should have admin access.
 *
 * This function is called during the signIn callback to determine
 * whether a new user should be granted admin privileges.
 *
 * @returns Array of Discord user ID strings
 *
 * @example
 *   // .env: ADMIN_DISCORD_IDS=123456789,987654321
 *   getAdminDiscordIds() // ['123456789', '987654321']
 */
export function getAdminDiscordIds(): string[] {
  const ids = process.env.ADMIN_DISCORD_IDS || '';
  // Split by comma and trim whitespace from each ID.
  // Filter out empty strings that result from trailing commas
  // or empty environment variables.
  return ids
    .split(',')
    .map((id) => id.trim())
    .filter((id) => id.length > 0);
}

/**
 * Exported list of admin Discord IDs for use by other modules.
 * Pre-computed at module load time for efficiency.
 */
export const ADMIN_DISCORD_IDS_LIST = getAdminDiscordIds();

// ============================================================
// NextAuth Configuration
// ============================================================

/**
 * NextAuth v5 configuration object.
 *
 * Exported separately from the NextAuth instance to allow:
 * - Testing the configuration in isolation
 * - Reusing config in middleware (next.config.js)
 * - Inspecting provider setup without initializing NextAuth
 */
export const authConfig = {
  /**
   * Authentication providers.
   *
   * Three OAuth providers for admin authentication and one
   * credentials provider for player password login.
   */
  providers: [
    /**
     * Discord OAuth provider.
     * Primary admin authentication method for JSMKC.
     * Discord is the community platform used by the SMK community.
     */
    Discord({
      clientId: process.env.DISCORD_CLIENT_ID!,
      clientSecret: process.env.DISCORD_CLIENT_SECRET!,
    }),

    /**
     * GitHub OAuth provider.
     * Alternative admin authentication for developers
     * who manage the JSMKC platform.
     */
    GitHub({
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
    }),

    /**
     * Google OAuth provider with offline access.
     * Offline access enables refresh token support for
     * long-running tournament management sessions.
     */
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          // Request offline access to receive a refresh token.
          // This allows the server to refresh the Google access token
          // without requiring the user to re-authenticate.
          access_type: 'offline',
          prompt: 'consent',
        },
      },
    }),

    /**
     * Credentials provider for player authentication.
     *
     * Allows players to log in with their nickname and password
     * for score entry and viewing personal statistics.
     * This is the primary authentication method for player score entry,
     * providing persistent player accounts.
     */
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
        // Validate that both fields are provided
        if (!credentials?.nickname || !credentials?.password) {
          logger.warn('Player login attempt with missing credentials');
          return null;
        }

        const nickname = credentials.nickname as string;
        const password = credentials.password as string;

        try {
          // Look up the player by nickname (case-sensitive, unique field)
          const player = await prisma.player.findUnique({
            where: { nickname },
          });

          // Player not found or has no password set
          if (!player || !player.password) {
            logger.warn('Player login failed: player not found or no password', {
              nickname,
            });
            return null;
          }

          // Verify the password against the stored bcrypt hash.
          // bcrypt.compare is timing-safe to prevent enumeration attacks.
          const isValid = await bcrypt.compare(password, player.password);
          if (!isValid) {
            logger.warn('Player login failed: invalid password', { nickname });
            return null;
          }

          // Return the user object that NextAuth will serialize into the JWT.
          // The 'player' type distinguishes player sessions from admin sessions.
          // playerId and nickname are custom fields defined in src/types/next-auth.d.ts
          // and propagated through the jwt → session callback chain below.
          logger.info('Player login successful', { nickname, playerId: player.id });
          return {
            id: player.id,
            name: player.name,
            email: `${player.nickname}@player.local`, // Synthetic email for NextAuth compatibility
            image: null,
            playerId: player.id,       // Player's database ID for session-based score entry
            nickname: player.nickname,  // Player's display nickname for UI auto-identification
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

  /**
   * Session configuration.
   *
   * Uses JWT strategy for stateless sessions.
   * JWTs are stored in httpOnly cookies for security.
   */
  session: {
    strategy: 'jwt' as const,
  },

  /**
   * Callback functions for customizing authentication behavior.
   */
  callbacks: {
    /**
     * signIn callback: Called when a user signs in.
     *
     * For OAuth providers, this creates or updates the User record
     * in the database and links the OAuth account.
     *
     * For the credentials provider, authentication is handled in
     * the authorize function above.
     *
     * Admin role assignment:
     * - If the user signs in via Discord and their Discord ID is
     *   in the ADMIN_DISCORD_IDS list, they get the 'admin' role
     * - Otherwise, they get the 'member' role
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async signIn({ user, account, profile }: any) {
      // Credentials provider handles its own validation in authorize()
      if (account?.provider === 'player-credentials') {
        return true;
      }

      // OAuth providers: create or update the user record
      if (account && user.email) {
        const MAX_RETRIES = 2;
        const BASE_DELAY = 200;

        for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
          try {
            await handleOAuthSignIn(user, account, profile);
            return true;
          } catch (error) {
            if (attempt < MAX_RETRIES && isTransientConnectionError(error)) {
              logger.warn('Transient DB error in signIn, retrying', {
                attempt: attempt + 1,
                provider: account.provider,
              });
              await new Promise(resolve => setTimeout(resolve, BASE_DELAY * Math.pow(2, attempt)));
              continue;
            }
            logger.error('Error in signIn callback', {
              error: error instanceof Error ? error.message : String(error),
              provider: account.provider,
              attempts: attempt + 1,
            });
            return false;
          }
        }
      }

      return true;
    },

    /**
     * session callback: Called whenever a session is checked.
     *
     * Adds custom claims from the JWT token to the session object
     * that's accessible in client components and API routes.
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async session({ session, token }: any) {
      if (token && session.user) {
        // Add the database user ID to the session.
        // This is the CUID from our User table, not the provider ID.
        session.user.id = token.sub || '';

        // Add custom claims for role-based access control.
        // These are set in the jwt callback below.
        session.user.role = token.role || 'member';
        session.user.userType = token.userType || 'oauth';

        // Propagate player-specific fields for session-based score entry.
        // These are set in the jwt callback for player-credentials logins
        // and used by participant pages to auto-identify the logged-in player.
        session.user.playerId = token.playerId as string | undefined;
        session.user.nickname = token.nickname as string | undefined;

        // Add token expiry information for client-side refresh logic.
        // The client uses these timestamps to proactively refresh
        // before the token expires.
        (session as Record<string, unknown>).accessTokenExpires =
          token.accessTokenExpires;
        (session as Record<string, unknown>).refreshTokenExpires =
          token.refreshTokenExpires;
      }
      return session;
    },

    /**
     * jwt callback: Called whenever a JWT token is created or updated.
     *
     * On initial sign-in:
     * - Looks up the user's role from the database
     * - Sets token expiry timestamps
     * - Records the user type (oauth vs player)
     *
     * On subsequent requests:
     * - Checks if the access token has expired
     * - If expired, refreshes using the refresh token
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async jwt({ token, user, account }: any) {
      // Initial sign-in: populate token with custom claims
      if (user && account) {
        const now = Date.now();

        // Determine user type based on the provider used
        const userType =
          account.provider === 'player-credentials' ? 'player' : 'oauth';

        // Look up the user's role from the database.
        // This ensures the role is always current, even if it was
        // changed by another admin after the last sign-in.
        let role = 'member';
        try {
          const dbUser = await prisma.user.findUnique({
            where: { id: user.id || '' },
            select: { role: true },
          });
          if (dbUser) {
            role = dbUser.role;
          }
        } catch (error) {
          logger.warn('Failed to look up user role', {
            userId: user.id,
            error: error instanceof Error ? error.message : String(error),
          });
        }

        // Set custom token claims
        token.role = role;
        token.userType = userType;

        // For player-credentials login, propagate playerId and nickname
        // into the JWT so they're available in the session callback.
        // These are used by participant pages to auto-identify the player
        // without a manual "select yourself" step.
        if (account.provider === 'player-credentials') {
          token.playerId = (user as { playerId?: string }).playerId;
          token.nickname = (user as { nickname?: string }).nickname;
        }

        // Set access and refresh token expiry timestamps.
        // Access token expires in 24 hours.
        // Refresh token also expires in 24 hours (can be extended).
        token.accessTokenExpires = now + REFRESH_TOKEN_EXPIRY;
        token.refreshTokenExpires = now + REFRESH_TOKEN_EXPIRY;

        // Store the OAuth refresh token if provided.
        // This is used for refreshing Google OAuth tokens.
        if (account.refresh_token) {
          token.providerRefreshToken = account.refresh_token;
        }

        logger.debug('JWT token created', {
          userId: user.id,
          role,
          userType,
        });
      }

      // Token refresh: check if access token has expired.
      // If the access token is expired but the refresh token is still
      // valid, extend the session by updating the expiry.
      if (
        token.accessTokenExpires &&
        typeof token.accessTokenExpires === 'number'
      ) {
        const now = Date.now();
        if (now > token.accessTokenExpires) {
          // Access token expired - check if refresh is still valid
          if (
            token.refreshTokenExpires &&
            typeof token.refreshTokenExpires === 'number' &&
            now < token.refreshTokenExpires
          ) {
            // Refresh token is still valid - extend the session
            token.accessTokenExpires = now + REFRESH_TOKEN_EXPIRY;
            logger.debug('Access token refreshed', { userId: token.sub });
          } else {
            // Both tokens expired - user needs to re-authenticate
            logger.info('Session expired, re-authentication required', {
              userId: token.sub,
            });
          }
        }
      }

      return token;
    },
  },

  /**
   * Custom pages for authentication UI.
   *
   * Overrides the default NextAuth pages with custom JSMKC-branded pages.
   */
  pages: {
    signIn: '/auth/signin',
    error: '/auth/error',
  },
};

// ============================================================
// NextAuth Instance
// ============================================================

/**
 * Initialize NextAuth with the configuration.
 *
 * Exports:
 * - handlers: GET and POST handlers for the /api/auth/* routes
 * - signIn: Server-side sign-in function
 * - signOut: Server-side sign-out function
 * - auth: Server-side session getter function
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const { handlers, signIn, signOut, auth } = NextAuth(authConfig as any);
