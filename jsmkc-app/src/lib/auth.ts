import NextAuth from 'next-auth'
import GitHub from 'next-auth/providers/github'
import Google from 'next-auth/providers/google'

import { prisma } from '@/lib/prisma'
const REFRESH_TOKEN_EXPIRY = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Get OAuth provider configuration
 * @param provider - OAuth provider ('google' | 'github')
 * @returns Provider configuration object
 */
interface OAuthConfig {
  endpoint: string;
  clientId: string;
  clientSecret: string;
  headers: Record<string, string>;
}

function getOAuthConfig(provider: 'google' | 'github'): OAuthConfig {
  switch (provider) {
    case 'google':
      return {
        endpoint: "https://oauth2.googleapis.com/token",
        clientId: process.env.AUTH_GOOGLE_ID || '',
        clientSecret: process.env.AUTH_GOOGLE_SECRET || '',
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      };
    case 'github':
      return {
        endpoint: "https://github.com/login/oauth/access_token",
        clientId: process.env.GITHUB_CLIENT_ID || '',
        clientSecret: process.env.GITHUB_CLIENT_SECRET || '',
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Accept": "application/json"
        },
      };
    default:
      throw new Error(`Unsupported OAuth provider: ${provider}`);
  }
}

/**
 * Refresh access token for OAuth provider
 * @param token - Current JWT token with refresh token
 * @param provider - OAuth provider ('google' | 'github')
 * @returns Updated token or token with error
 */
async function refreshAccessToken(
  token: import('next-auth/jwt').JWT,
  provider: 'google' | 'github'
) {
  const config = getOAuthConfig(provider);

  try {
    const response = await fetch(config.endpoint, {
      method: "POST",
      headers: config.headers,
      body: new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        grant_type: "refresh_token",
        refresh_token: token.refreshToken!,
      }),
    })

    const refreshedTokens = await response.json()

    if (!response.ok) {
      throw refreshedTokens
    }

    return {
      ...token,
      accessToken: refreshedTokens.access_token,
      accessTokenExpires: Date.now() + refreshedTokens.expires_in * 1000,
      refreshToken: refreshedTokens.refresh_token ?? token.refreshToken,
    }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    console.error(`Token refresh failed for ${provider}: [REDACTED ERROR]`);
    return {
      ...token,
      error: "RefreshAccessTokenError",
      errorDetails: errorMessage,
    }
  }
}

import Discord from 'next-auth/providers/discord'

// Admin User IDs (Discord) - Hardcoded Whitelist
const ADMIN_DISCORD_IDS = [
  'YOUR_DISCORD_USER_ID_HERE', // Placeholder, user to update
];

export const { handlers, signIn, signOut, auth } = NextAuth({
  secret: process.env.AUTH_SECRET,
  providers: [
    Discord({
      clientId: process.env.DISCORD_CLIENT_ID,
      clientSecret: process.env.DISCORD_CLIENT_SECRET,
    }),
    GitHub({
      clientId: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
    }),
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
      authorization: {
        params: {
          prompt: "consent",
          access_type: "offline",
          response_type: "code",
          scope: "openid email profile https://www.googleapis.com/auth/userinfo.email"
        }
      }
    }),
  ],
  session: {
    strategy: "jwt",
  },
  callbacks: {
    async signIn({ user, account }) {
      // Support Discord, GitHub and Google OAuth
      let role = 'member';

      if (account?.provider === 'discord') {
        if (ADMIN_DISCORD_IDS.includes(account.providerAccountId)) {
          role = 'admin';
        }
      }

      // Allow login for all providers (GitHub/Google/Discord)
      try {
        // ユーザーが存在するか確認、なければ作成
        const existingUser = await prisma.user.findUnique({
          where: { email: user.email! },
        });

        if (!existingUser) {
          await prisma.user.create({
            data: {
              email: user.email!,
              name: user.name,
              image: user.image,
              role: role,
            },
          });
        } else if (existingUser.role !== role && role === 'admin') {
          // Upgrade to admin if whitelisted
          await prisma.user.update({
            where: { id: existingUser.id },
            data: { role: 'admin' }
          });
        } else if (role === 'admin' && existingUser.role !== 'admin') {
          // Ensure database reflects admin status if whitelisted
          await prisma.user.update({
            where: { id: existingUser.id },
            data: { role: 'admin' }
          });
        }

        return true;
      } catch (err) {
        console.error(`Error during ${account?.provider} sign in:`, err);
        return true;
      }
    },
    async session({ session, token }: { session: import('next-auth').Session & { user?: { id?: string } }; token: import('next-auth/jwt').JWT }) {
      if (session.user && typeof token.sub === 'string') {
        session.user.id = token.sub;
        // @ts-expect-error role is not typed in default session
        session.user.role = token.role as string;
      }

      // Add error information to session for client-side handling
      if (token.error) {
        session.error = token.error;
      }

      return session;
    },
    async jwt({ token, user, account }: { token: import('next-auth/jwt').JWT; user?: import('next-auth').User; account?: import('next-auth').Account | null }) {
      // Initial sign in: store tokens and expiration
      if (account && user) {
        // Fetch user role from DB to be sure
        const dbUser = await prisma.user.findUnique({ where: { email: user.email! } });
        const role = dbUser?.role || 'member';

        return {
          ...token,
          sub: dbUser?.id,
          accessToken: account.access_token,
          refreshToken: account.refresh_token,
          accessTokenExpires: Date.now() + (account.expires_in || 3600) * 1000,
          refreshTokenExpires: Date.now() + REFRESH_TOKEN_EXPIRY,
          user: user,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          role: role,
        }
      }

      // Return previous token if still valid
      if (token.accessTokenExpires && Date.now() < token.accessTokenExpires) {
        return token
      }

      // Token refresh logic can be simplified or expanded as needed
      return token;
    },
  },
  pages: {
    signIn: '/auth/signin',
    error: '/auth/error',
  },
})