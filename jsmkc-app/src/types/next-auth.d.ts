// NextAuth.js module type extensions
// Extends default NextAuth types with custom fields for JSMKC
// This enables type-safe access to custom user fields across the app

import 'next-auth';
import 'next-auth/jwt';

declare module 'next-auth' {
  interface User {
    /** 'admin' | 'player' - determines access level */
    userType?: string;
    /** Player ID for player-type users (credential login) */
    playerId?: string;
    /** Player nickname for display purposes */
    nickname?: string;
  }

  interface Session {
    user: {
      id?: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      /** User role: 'admin' | 'member' | 'player' */
      role?: string;
      /** User type: 'admin' | 'player' */
      userType?: string;
      /** Player ID for player-type users */
      playerId?: string;
      /** Player nickname */
      nickname?: string;
    };
    /** Error string from JWT callback (e.g., 'RefreshAccessTokenError') */
    error?: string;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    /** OAuth access token */
    accessToken?: string;
    /** OAuth refresh token */
    refreshToken?: string;
    /** Access token expiration timestamp in milliseconds */
    accessTokenExpires?: number;
    /** Refresh token expiration timestamp in milliseconds */
    refreshTokenExpires?: number;
    /** User role: 'admin' | 'member' | 'player' */
    role?: string;
    /** User type: 'admin' | 'player' */
    userType?: string;
    /** Player ID for credential-based player login */
    playerId?: string;
    /** Player nickname for credential-based player login */
    nickname?: string;
    /** Error identifier from token refresh failures */
    error?: string;
    /** Original user object from initial sign-in */
    user?: import('next-auth').User;
  }
}
