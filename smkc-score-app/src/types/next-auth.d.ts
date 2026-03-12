/**
 * TypeScript Module Augmentation for NextAuth.js
 *
 * Extends the default NextAuth User, Session, and JWT interfaces with
 * JSMKC-specific fields so that custom properties (userType, playerId,
 * nickname, role) are available with full type safety throughout the app.
 *
 * The application supports:
 * - Discord OAuth for administrator logins
 * - Credential-based player logins using nickname + password
 *
 * Usage:
 *   import { Session } from 'next-auth';
 *   // session.user.role, session.user.playerId, etc. are now typed
 */

import 'next-auth';
import 'next-auth/jwt';

declare module 'next-auth' {
  interface User {
    /** 'admin' | 'player' - determines access level */
    role?: string;
    /** 'admin' | 'player' - session source */
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
      /** User role: 'admin' | 'player' */
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
    /** Session expiration timestamp in milliseconds */
    accessTokenExpires?: number;
    /** Extended session expiration timestamp in milliseconds */
    refreshTokenExpires?: number;
    /** User role: 'admin' | 'player' */
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
