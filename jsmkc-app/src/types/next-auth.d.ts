import 'next-auth'

declare module 'next-auth' {
  interface User {
    userType?: 'admin' | 'player';
    playerId?: string;
    nickname?: string;
  }

  interface Session {
    error?: string;
    user?: User & {
      id: string;
      role?: 'admin' | 'member' | 'player';
    };
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    sub?: string;
    accessToken?: string;
    refreshToken?: string;
    accessTokenExpires?: number;
    refreshTokenExpires?: number;
    error?: string;
    errorDetails?: string;
    userType?: 'admin' | 'player';
    playerId?: string;
    nickname?: string;
    role?: 'admin' | 'member' | 'player';
  }
}