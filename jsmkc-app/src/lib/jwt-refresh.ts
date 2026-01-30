/**
 * Client-Side JWT Refresh Utilities
 *
 * Provides hooks and functions for managing JWT token lifecycle
 * on the client side. Handles automatic session refresh, token
 * expiration detection, and authenticated API calls.
 *
 * 'use client' directive is required because these utilities use
 * React hooks and browser-side APIs.
 *
 * Token refresh flow:
 * 1. Client checks if access token is nearing expiry (5-minute buffer)
 * 2. If expiring, calls NextAuth's session update to get a new token
 * 3. If refresh token is also expired, signs out the user
 *
 * The useAutoRefresh hook provides a declarative way to manage
 * session freshness in React components, while authenticatedFetch
 * provides an imperative API for making authenticated API calls.
 *
 * Usage:
 *   // In a React component:
 *   const { ensureValidSession, isExpired } = useAutoRefresh();
 *   if (isExpired) return <LoginRequired />;
 *
 *   // For API calls:
 *   const response = await authenticatedFetch('/api/tournaments', {}, session);
 */

'use client';

import { Session } from 'next-auth';
import { signOut, useSession } from 'next-auth/react';
import { createLogger } from '@/lib/logger';
import { useCallback, useMemo } from 'react';

/** Logger scoped to JWT refresh operations */
const logger = createLogger('jwt-refresh');

// ============================================================
// Types
// ============================================================

/**
 * Extended session interface that includes custom JSMKC claims.
 *
 * NextAuth's base Session type doesn't include our custom fields
 * (role, userType, token expiry), so we extend it here.
 */
export interface ExtendedSession extends Session {
  /** User role: 'admin' or 'member' */
  role?: string;
  /** Authentication type: 'oauth' or 'player' */
  userType?: string;
  /** Access token expiry timestamp (Unix ms) */
  accessTokenExpires?: number;
  /** Refresh token expiry timestamp (Unix ms) */
  refreshTokenExpires?: number;
}

// ============================================================
// Token Expiration Checks
// ============================================================

/**
 * Checks whether the access token has expired or is about to expire.
 *
 * Uses a 5-minute buffer to proactively refresh tokens before they
 * actually expire. This prevents failed API calls due to tokens
 * expiring mid-request.
 *
 * The 5-minute buffer is chosen to accommodate:
 * - Network latency for the refresh request
 * - Clock skew between client and server
 * - Time for ongoing API calls to complete
 *
 * @param session - The current session (with custom expiry claims)
 * @returns true if the access token is expired or will expire within 5 minutes
 *
 * @example
 *   if (isAccessTokenExpired(session)) {
 *     await refreshSession();
 *   }
 */
export function isAccessTokenExpired(
  session: ExtendedSession | null
): boolean {
  // No session means the user is not authenticated at all
  if (!session) return true;

  const expiresAt = session.accessTokenExpires;
  if (!expiresAt || typeof expiresAt !== 'number') {
    // If expiry information is missing, treat as expired
    // to trigger a refresh and get proper expiry data
    return true;
  }

  // Check if current time is within 5 minutes of expiry.
  // 5 * 60 * 1000 = 300,000 milliseconds = 5 minutes buffer.
  const BUFFER_MS = 5 * 60 * 1000;
  return Date.now() > expiresAt - BUFFER_MS;
}

/**
 * Checks whether the refresh token has expired.
 *
 * When the refresh token expires, the user must re-authenticate
 * via the sign-in page. No buffer is applied because refresh tokens
 * have longer validity (24+ hours).
 *
 * @param session - The current session (with custom expiry claims)
 * @returns true if the refresh token has expired
 *
 * @example
 *   if (isRefreshTokenExpired(session)) {
 *     await handleSessionRefreshFailure();
 *   }
 */
export function isRefreshTokenExpired(
  session: ExtendedSession | null
): boolean {
  if (!session) return true;

  const expiresAt = session.refreshTokenExpires;
  if (!expiresAt || typeof expiresAt !== 'number') {
    // Missing refresh expiry data indicates an invalid session state
    return true;
  }

  return Date.now() > expiresAt;
}

// ============================================================
// Session Refresh Handlers
// ============================================================

/**
 * Handles session refresh failure by signing out and redirecting.
 *
 * Called when:
 * - Refresh token has expired
 * - Session update fails
 * - Server returns an authentication error
 *
 * Signs out the user and redirects to the sign-in page with an
 * optional error message for display.
 *
 * @param error - Optional error message to display on the sign-in page
 *
 * @example
 *   try {
 *     await refreshSession();
 *   } catch {
 *     await handleSessionRefreshFailure('Session expired. Please sign in again.');
 *   }
 */
export async function handleSessionRefreshFailure(
  error?: string
): Promise<void> {
  logger.info('Session refresh failed, signing out', { error });

  // signOut with redirect sends the user to the sign-in page.
  // The callbackUrl preserves the current page so the user
  // returns to it after re-authenticating.
  await signOut({
    callbackUrl: `/auth/signin${error ? `?error=${encodeURIComponent(error)}` : ''}`,
  });
}

// ============================================================
// React Hook: useAutoRefresh
// ============================================================

/**
 * React hook that provides automatic session refresh capabilities.
 *
 * Returns utility functions for managing session freshness and
 * boolean flags indicating the current session state.
 *
 * The hook uses NextAuth's useSession hook internally and adds
 * JSMKC-specific expiry checking on top of it.
 *
 * @returns Object with:
 *   - refreshSession: Function to manually trigger session refresh
 *   - ensureValidSession: Function that refreshes if needed
 *   - isExpired: Whether the access token has expired
 *   - isRefreshExpired: Whether the refresh token has expired
 *
 * @example
 *   function TournamentPage() {
 *     const { ensureValidSession, isExpired, isRefreshExpired } = useAutoRefresh();
 *
 *     if (isRefreshExpired) {
 *       return <p>Session expired. Please sign in again.</p>;
 *     }
 *
 *     const handleSubmit = async () => {
 *       await ensureValidSession();
 *       // Make API call with fresh token...
 *     };
 *   }
 */
export function useAutoRefresh() {
  const { data: session, update } = useSession();

  // Cast to ExtendedSession to access custom claims
  const extendedSession = session as ExtendedSession | null;

  /**
   * Manually triggers a session refresh via NextAuth.
   *
   * Calls the update() function from useSession which sends a
   * request to the /api/auth/session endpoint to get a new token.
   *
   * If the refresh token has expired, signs out instead of
   * attempting to refresh (which would fail).
   */
  const refreshSession = useCallback(async () => {
    if (isRefreshTokenExpired(extendedSession)) {
      // Refresh token expired - must re-authenticate
      await handleSessionRefreshFailure('Session expired. Please sign in again.');
      return;
    }

    try {
      // NextAuth's update() function refreshes the session
      // by calling the jwt callback with the existing token
      await update();
      logger.debug('Session refreshed successfully');
    } catch (error) {
      logger.error('Session refresh failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      await handleSessionRefreshFailure('Failed to refresh session');
    }
  }, [extendedSession, update]);

  /**
   * Ensures the session has a valid (non-expired) access token.
   *
   * If the token is expired or about to expire, triggers a refresh.
   * If the refresh token is also expired, signs out the user.
   *
   * Call this before making authenticated API requests to ensure
   * the request will succeed.
   */
  const ensureValidSession = useCallback(async () => {
    if (isRefreshTokenExpired(extendedSession)) {
      await handleSessionRefreshFailure('Session expired. Please sign in again.');
      return;
    }

    if (isAccessTokenExpired(extendedSession)) {
      await refreshSession();
    }
  }, [extendedSession, refreshSession]);

  // Compute expiry flags for UI rendering.
  // useMemo ensures these are only recalculated when the session changes.
  const isExpired = useMemo(
    () => isAccessTokenExpired(extendedSession),
    [extendedSession]
  );

  const isRefreshExpired = useMemo(
    () => isRefreshTokenExpired(extendedSession),
    [extendedSession]
  );

  return {
    refreshSession,
    ensureValidSession,
    isExpired,
    isRefreshExpired,
  };
}

// ============================================================
// Authenticated Fetch
// ============================================================

/**
 * Makes an authenticated API call with automatic token refresh.
 *
 * If the session's access token is expired, attempts to refresh
 * before making the request. If refresh fails, signs out the user.
 *
 * This function is for imperative API calls outside of React components
 * where the useAutoRefresh hook cannot be used.
 *
 * @param url - The API endpoint URL
 * @param options - Standard fetch options (method, headers, body, etc.)
 * @param session - The current session object
 * @returns The fetch Response object
 *
 * @example
 *   const response = await authenticatedFetch(
 *     '/api/tournaments',
 *     { method: 'GET' },
 *     session
 *   );
 *   const data = await response.json();
 */
export async function authenticatedFetch(
  url: string,
  options: RequestInit = {},
  session: ExtendedSession | null
): Promise<Response> {
  // Check if the session is valid before making the request
  if (!session) {
    await handleSessionRefreshFailure('Not authenticated');
    // Return a mock error response since handleSessionRefreshFailure
    // redirects the user (this code may not execute)
    return new Response(JSON.stringify({ error: 'Not authenticated' }), {
      status: 401,
    });
  }

  // If access token is expired and refresh token is also expired,
  // the user needs to re-authenticate
  if (isRefreshTokenExpired(session)) {
    await handleSessionRefreshFailure('Session expired');
    return new Response(JSON.stringify({ error: 'Session expired' }), {
      status: 401,
    });
  }

  // Make the API request with existing credentials.
  // The session cookie is automatically included by the browser.
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  return response;
}

// ============================================================
// Error Handling Utilities
// ============================================================

/**
 * Handles API error responses with user-friendly messages.
 *
 * Extracts error information from the response and provides
 * appropriate user-facing messages based on the status code.
 *
 * @param response - The fetch Response object
 * @param data - The parsed response body (may contain error details)
 * @returns A user-friendly error message string
 *
 * @example
 *   const response = await fetch('/api/...');
 *   const data = await response.json();
 *   if (!response.ok) {
 *     const message = handleApiError(response, data);
 *     showToast(message);
 *   }
 */
export function handleApiError(
  response: Response,
  data: Record<string, unknown>
): string {
  // Use the server-provided error message if available.
  // Our API always returns { success: false, error: "..." } on errors.
  if (data?.error && typeof data.error === 'string') {
    return data.error;
  }

  // Map HTTP status codes to user-friendly messages.
  // These messages are generic enough for end users while being
  // specific enough for developers to understand the issue.
  switch (response.status) {
    case 400:
      return 'Invalid request. Please check your input.';
    case 401:
      return 'Authentication required. Please sign in.';
    case 403:
      return 'You do not have permission for this action.';
    case 404:
      return 'The requested resource was not found.';
    case 409:
      return 'Conflict: the data was modified by another user. Please refresh and try again.';
    case 429:
      return 'Too many requests. Please wait a moment and try again.';
    case 500:
      return 'An unexpected server error occurred. Please try again later.';
    default:
      return `An error occurred (${response.status}). Please try again.`;
  }
}

/**
 * Converts session-related errors to user-friendly messages.
 *
 * Maps common NextAuth error codes and network errors to messages
 * that can be displayed in the UI.
 *
 * @param error - The error (Error object, string, or unknown)
 * @returns A user-friendly error message
 *
 * @example
 *   try {
 *     await signIn('discord');
 *   } catch (error) {
 *     const message = getSessionErrorMessage(error);
 *     showErrorToast(message);
 *   }
 */
export function getSessionErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    // Map common error messages to user-friendly text.
    // These messages may come from NextAuth or network failures.
    const message = error.message.toLowerCase();

    if (message.includes('fetch failed') || message.includes('network')) {
      return 'Network error. Please check your connection and try again.';
    }

    if (message.includes('session') || message.includes('token')) {
      return 'Session error. Please sign in again.';
    }

    if (message.includes('unauthorized') || message.includes('401')) {
      return 'Your session has expired. Please sign in again.';
    }

    // For unrecognized errors, return a generic message.
    // The original error is NOT exposed to prevent information leakage.
    return 'An authentication error occurred. Please try again.';
  }

  if (typeof error === 'string') {
    return error;
  }

  return 'An unexpected error occurred. Please try again.';
}
