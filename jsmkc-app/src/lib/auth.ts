import NextAuth from 'next-auth'
import GitHub from 'next-auth/providers/github'
import { prisma } from '@/lib/prisma'

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    GitHub({
      clientId: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
    }),
  ],
  session: {
    strategy: 'jwt',
    maxAge: 24 * 60 * 60, // 24 hours in seconds
  },
  callbacks: {
    async signIn({ user, account }) {
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
        } catch (error) {
          console.error('Error during GitHub organization verification:', error);
          return false;
        }
      }
      return false;
    },
    async session({ session, token }) {
      if (session.user && token.sub) {
        session.user.id = token.sub;
      }
      return session;
    },
    async jwt({ token, user }) {
      if (user) {
        token.sub = user.id;
      }
      return token;
    },
  },
  pages: {
    signIn: '/auth/signin',
    error: '/auth/error',
  },
})