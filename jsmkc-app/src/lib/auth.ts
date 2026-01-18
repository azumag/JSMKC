import NextAuth from 'next-auth'
import GitHub from 'next-auth/providers/github'
import Google from 'next-auth/providers/google'
import { prisma } from '@/lib/prisma'

// Refresh token function for Google OAuth as specified in ARCHITECTURE.md section 6.2
async function refreshGoogleAccessToken(token: { refreshToken?: string | null; accessTokenExpires?: number }) {
  try {
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.AUTH_GOOGLE_ID!,
        client_secret: process.env.AUTH_GOOGLE_SECRET!,
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
    } catch {
    console.warn('Token refresh failed');
    return {
      ...token,
      error: "RefreshAccessTokenError",
    }
  }
}

// Refresh token function for GitHub OAuth as specified in ARCHITECTURE.md section 6.2
async function refreshGitHubAccessToken(token: { refreshToken?: string | null; accessTokenExpires?: number }) {
  try {
    const response = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: { 
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept": "application/json"
      },
      body: new URLSearchParams({
        client_id: process.env.GITHUB_CLIENT_ID!,
        client_secret: process.env.GITHUB_CLIENT_SECRET!,
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
    } catch {
    console.warn('Token refresh failed');
    return {
      ...token,
      error: "RefreshAccessTokenError",
    }
  }
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
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
      // Support both GitHub and Google OAuth
      if (account?.provider === 'github') {
        try {
          if (!account.access_token) {
            console.error('No access token provided by GitHub');
            return false;
          }

          // GitHub APIを使ってOrganizationメンバーかどうかを確認
          const response = await fetch('https://api.github.com/user/orgs', {
            headers: {
              Authorization: `Bearer ${account.access_token}`,
              Accept: 'application/vnd.github.v3+json',
            },
          });

          if (!response.ok) {
            console.error('Failed to fetch GitHub orgs:', response.status, response.statusText);
            return false;
          }

          const orgs = await response.json();
          const isMember = orgs.some((org: { login: string }) => org.login === 'jsmkc-org');

          if (!isMember) {
            console.warn(`User ${user.email} is not a member of jsmkc-org`);
            return false;
          }

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
              },
            });
          }

          return true;
        } catch (err) {
          console.error('Error during GitHub organization verification:', err);
          return false;
        }
      }

      // For Google OAuth, we'll implement organization verification later
      if (account?.provider === 'google') {
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
              },
            });
          }

          return true;
        } catch (err) {
          console.error('Error during Google user creation:', err);
          return false;
        }
      }

      return false;
    },
    async session({ session, token }: { session: import('next-auth').Session & { user?: { id?: string } }; token: Record<string, unknown> }) {
      if (session.user && token.sub) {
        session.user.id = token.sub;
      }
      
      // Add error information to session for client-side handling
      if (token.error) {
        (session as Record<string, unknown>).error = token.error;
      }
      
      return session;
    },
    async jwt({ token, user, account }: { token: Record<string, unknown>; user?: unknown; account?: Record<string, unknown> | undefined }) {
      // Initial sign in: store tokens and expiration
      if (account && user) {
        if (account.provider === 'google') {
          return {
            ...token,
            accessToken: account.access_token,
            refreshToken: account.refresh_token,
            accessTokenExpires: Date.now() + account.expires_in! * 1000,
            refreshTokenExpires: Date.now() + 24 * 60 * 60 * 1000, // 24時間
            user: user,
          }
        }
        
        // For GitHub, keep existing behavior but with token structure
        if (account.provider === 'github') {
          return {
            ...token,
            accessToken: account.access_token,
            refreshToken: account.refresh_token,
            accessTokenExpires: Date.now() + (account.expires_in || 3600) * 1000, // Default 1 hour
            refreshTokenExpires: Date.now() + 24 * 60 * 60 * 1000, // 24時間
            user: user,
          }
        }
      }

      // Return previous token if still valid
      if (Date.now() < ((token.accessTokenExpires as number) || 0)) {
        return token
      }

      // Access token has expired, try to refresh it
      if (account?.provider === 'google' && token.refreshToken) {
        return refreshGoogleAccessToken(token)
      }

      // Access token has expired, try to refresh it for GitHub
      if (account?.provider === 'github' && token.refreshToken) {
        return refreshGitHubAccessToken(token)
      }

      // Unable to refresh token
      return {
        ...token,
        error: "RefreshAccessTokenError",
      }
    },
  },
  pages: {
    signIn: '/auth/signin',
    error: '/auth/error',
  },
})