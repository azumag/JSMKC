import NextAuth from 'next-auth'
import type { JWT } from 'next-auth/jwt'
import GitHub from 'next-auth/providers/github'
import Google from 'next-auth/providers/google'
import Discord from 'next-auth/providers/discord'
import Credentials from 'next-auth/providers/credentials'
import bcrypt from 'bcrypt'

import { prisma } from '@/lib/prisma'
const REFRESH_TOKEN_EXPIRY = 24 * 60 * 60 * 1000; // 24 hours

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
    Credentials({
      id: 'player-credentials',
      name: 'Player Login',
      credentials: {
        nickname: { label: "Nickname", type: "text" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials): Promise<import('next-auth').User | null> {
        if (!credentials?.nickname || !credentials?.password) {
          return null;
        }

        const player = await prisma.player.findUnique({
          where: { nickname: credentials.nickname as string }
        });

        if (!player || !player.password) {
          return null;
        }

        const isValid = await bcrypt.compare(credentials.password as string, player.password);
        if (!isValid) {
          return null;
        }

        return {
          id: player.id,
          email: `${player.nickname}@player.local`,
          name: player.name,
          image: null,
          userType: 'player',
          playerId: player.id,
          nickname: player.nickname
        };
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
        session.user.role = token.role;
        session.user.userType = token.userType;

        // Add player-specific fields if user is a player
        if (token.userType === 'player') {
          session.user.playerId = token.playerId;
          session.user.nickname = token.nickname;
        }
      }

      // Add error information to session for client-side handling
      if (token.error) {
        session.error = token.error;
      }

      return session;
    },
    async jwt({ token, user, account }): Promise<JWT> {
      // Initial sign in: store tokens and expiration
      if (account && user) {
        // Handle player credentials (password-based login)
        if (account.provider === 'player-credentials') {
          return {
            ...token,
            sub: user.id,
            userType: 'player',
            playerId: user.playerId,
            nickname: user.nickname,
            role: 'player'
          } as JWT;
        }

        // Handle OAuth providers (Discord, GitHub, Google)
        // Fetch user role from DB to be sure
        const dbUser = await prisma.user.findUnique({ where: { email: user.email! } });
        const role = dbUser?.role || 'member';

        return {
          ...token,
          sub: dbUser?.id,
          userType: 'admin',
          accessToken: account.access_token,
          refreshToken: account.refresh_token,
          accessTokenExpires: Date.now() + (account.expires_in || 3600) * 1000,
          refreshTokenExpires: Date.now() + REFRESH_TOKEN_EXPIRY,
          user: user,
          role: role,
        } as JWT;
      }

      // Return previous token if still valid
      if (token.accessTokenExpires && Date.now() < token.accessTokenExpires) {
        return token as JWT;
      }

      // Token refresh logic can be simplified or expanded as needed
      return token as JWT;
    },
  },
  pages: {
    signIn: '/auth/signin',
    error: '/auth/error',
  },
})