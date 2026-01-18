import 'next-auth'

declare module 'next-auth' {
  interface Session {
    error?: string;
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
  }
}