'use client';

import { Session } from 'next-auth';
import { signOut, useSession } from 'next-auth/react';
import { createLogger } from './logger'

/**
 * Client-side JWT refresh utilities
 * Handles automatic token refresh and graceful session expiration
 */

export interface ExtendedSession extends Session {
  error?: string;
  accessToken?: string;
  accessTokenExpires?: number;
  refreshToken?: string;
  refreshTokenExpires?: number;
  data?: Record<string, unknown>;
}

/**
 * Check if the access token is expired or will expire within the buffer time
 */
export function isAccessTokenExpired(session: ExtendedSession | null): boolean {
  if (!session?.accessTokenExpires) return true;
  
  // Add 5-minute buffer to refresh before actual expiration
  const bufferTime = 5 * 60 * 1000; // 5 minutes
  return Date.now() >= (session.accessTokenExpires - bufferTime);
}

/**
 * Check if the refresh token is expired
 */
export function isRefreshTokenExpired(session: ExtendedSession | null): boolean {
  if (!session?.refreshTokenExpires) return true;
  return Date.now() >= session.refreshTokenExpires;
}

/**
 * Handle session refresh failure gracefully
 * Redirects to sign in page with appropriate message
 */
export async function handleSessionRefreshFailure(error?: string) {
  const log = createLogger('jwt-refresh')
  log.error('Session refresh failed:', { error });
  
  // Clear the current session
  await signOut({ redirect: false });
  
  // Redirect to sign in with error message
  const returnUrl = encodeURIComponent(window.location.pathname);
  window.location.href = `/auth/signin?error=SessionExpired&returnUrl=${returnUrl}&message=${encodeURIComponent(
    error || 'Your session has expired. Please sign in again.'
  )}`;
}

/**
 * Automatic session refresh hook
 * Returns a function to manually trigger refresh if needed
 */
export function useAutoRefresh() {
  const { data: session, update } = useSession();

  const refreshSession = async (): Promise<boolean> => {
    if (!session) return false;

    try {
      // Trigger session update which will invoke JWT callback
      const result = await update();
      
      if ((result as ExtendedSession)?.error === 'RefreshAccessTokenError') {
        await handleSessionRefreshFailure('Unable to refresh your session. Please sign in again.');
        return false;
      }
      
      return true;
    } catch {
      const log = createLogger('jwt-refresh')
      log.error('Manual session refresh failed');
      await handleSessionRefreshFailure('Session refresh failed. Please sign in again.');
      return false;
    }
  };

  // Auto-refresh check (called before critical operations)
  const ensureValidSession = async (): Promise<boolean> => {
    if (!session) {
      window.location.href = '/auth/signin';
      return false;
    }

    // Check if refresh token is expired first (force re-auth)
    if (isRefreshTokenExpired(session)) {
      await handleSessionRefreshFailure('Your session has expired. Please sign in again.');
      return false;
    }

    // Check if access token needs refresh
    if (isAccessTokenExpired(session)) {
      return await refreshSession();
    }

    return true;
  };

  return {
    refreshSession,
    ensureValidSession,
    isExpired: isAccessTokenExpired(session),
    isRefreshExpired: isRefreshTokenExpired(session),
  };
}

/**
 * Wrapper for fetch requests with automatic token refresh
 */
export async function authenticatedFetch(
  url: string,
  options: RequestInit = {},
  session: ExtendedSession | null
): Promise<Response> {
  const ensureValidSession = async () => {
    if (!session) {
      window.location.href = '/auth/signin';
      return false;
    }

    if (isAccessTokenExpired(session)) {
      // Trigger session refresh via NextAuth's session endpoint
      try {
        const response = await fetch('/api/auth/session');
        if (!response.ok) throw new Error('Failed to refresh session');
        
        const refreshedSession = await response.json();
        if (refreshedSession?.error === 'RefreshAccessTokenError') {
          await handleSessionRefreshFailure();
          return false;
        }
        
        // Update the session object with refreshed data
        Object.assign(session, refreshedSession);
        return true;
      } catch {
        await handleSessionRefreshFailure();
        return false;
      }
    }

    return true;
  };

  // Ensure valid session before making request
  const isValid = await ensureValidSession();
  if (!isValid) {
    throw new Error('Session validation failed');
  }

  // Add authorization header if we have an access token
  const headers = new Headers(options.headers);
  if (session?.accessToken) {
    headers.set('Authorization', `Bearer ${session.accessToken}`);
  }

  return fetch(url, {
    ...options,
    headers,
  });
}

/**
 * Client-side error handling for API responses
 */
export function handleApiError(response: Response, data: unknown) {
  const errorData = data as { error?: string };
  
  if (response.status === 401) {
    handleSessionRefreshFailure(errorData?.error || 'Authentication failed');
    return;
  }
  
  if (response.status === 403) {
    throw new Error(errorData?.error || 'Access forbidden');
  }
  
  if (response.status >= 500) {
    throw new Error(errorData?.error || 'Server error');
  }
  
  if (!response.ok) {
    throw new Error(errorData?.error || `Request failed with status ${response.status}`);
  }
}

/**
 * Get user-friendly error messages for common session issues
 */
export function getSessionErrorMessage(error: string): string {
  switch (error) {
    case 'RefreshAccessTokenError':
      return 'Your session could not be refreshed. Please sign in again.';
    case 'SessionExpired':
      return 'Your session has expired. Please sign in again.';
    case 'AccessDenied':
      return 'Access denied. You do not have permission to perform this action.';
    case 'OAuthSignin':
      return 'Error signing in with OAuth provider. Please try again.';
    case 'OAuthCallback':
      return 'Error during OAuth callback. Please try again.';
    case 'OAuthCreateAccount':
      return 'Could not create account. Please contact support.';
    case 'EmailCreateAccount':
      return 'Could not create account with this email address.';
    case 'Callback':
      return 'Error during authentication callback.';
    case 'OAuthAccountNotLinked':
      return 'This account is already linked to another provider.';
    case 'SessionRequired':
      return 'You must be signed in to access this resource.';
    default:
      return 'An authentication error occurred. Please try again.';
  }
}