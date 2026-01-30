/**
 * @jest-environment jsdom
 */

/**
 * @module jwt-refresh.test
 *
 * Test suite for the JWT refresh utilities (`@/lib/jwt-refresh`).
 *
 * Covers:
 * - isAccessTokenExpired: null sessions, missing fields, expired tokens, buffer time logic
 * - isRefreshTokenExpired: null sessions, missing fields, expired vs valid refresh tokens
 * - handleSessionRefreshFailure: sign-out flow with callbackUrl containing error param
 * - useAutoRefresh hook: session status detection (expired, refresh-expired),
 *   ensureValidSession calls handleSessionRefreshFailure or refreshSession,
 *   and graceful handling of refresh token expiration
 * - authenticatedFetch: fetch call with Content-Type header, 401 response for null/expired
 *   sessions, handleSessionRefreshFailure invocation
 * - handleApiError: returns data.error string if present, or maps HTTP status to message
 * - getSessionErrorMessage: returns string errors directly, maps Error objects by message
 *   content, returns generic message for unknown errors
 */
import {
  isAccessTokenExpired,
  isRefreshTokenExpired,
  handleSessionRefreshFailure,
  useAutoRefresh,
  authenticatedFetch,
  handleApiError,
  getSessionErrorMessage,
  type ExtendedSession,
} from '@/lib/jwt-refresh';

// renderHook is required because useAutoRefresh uses React hooks
// (useCallback, useMemo) which can only be called inside a React context
import { renderHook, act } from '@testing-library/react';

// Mock next-auth/react
import { signOut as mockSignOut, useSession as mockUseSession, type SessionContextValue } from 'next-auth/react';

jest.mock('next-auth/react');

const signOut = jest.mocked(mockSignOut);
const useSession = jest.mocked(mockUseSession);

/**
 * Helper function to create proper session mock with data, update, and status.
 * The update function is used by useAutoRefresh's refreshSession to trigger
 * NextAuth session refresh.
 */
function createSessionMock<R extends boolean>(
  data: SessionContextValue<R>['data'],
  status: SessionContextValue<R>['status']
) {
  return {
    data,
    update: jest.fn(),
    status,
  } as SessionContextValue<R>;
}

// Mock fetch globally for authenticatedFetch tests
global.fetch = jest.fn();

describe('JWT Refresh Utilities', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ============================================================
  // isAccessTokenExpired
  // ============================================================
  describe('isAccessTokenExpired', () => {
    it('should return true when session is null', () => {
      // Null session means user is not authenticated
      expect(isAccessTokenExpired(null)).toBe(true);
    });

    it('should return true when session has no accessTokenExpires', () => {
      // Missing expiry data triggers refresh to get proper expiry
      const session: ExtendedSession = { expires: new Date().toISOString() };
      expect(isAccessTokenExpired(session)).toBe(true);
    });

    it('should return true when access token is expired', () => {
      // Token already past its expiry time
      const now = Date.now();
      const session: ExtendedSession = {
        accessTokenExpires: now - 1000,
        expires: new Date(now).toISOString(),
      };
      expect(isAccessTokenExpired(session)).toBe(true);
    });

    it('should return true when access token is within buffer time', () => {
      // Token expires within the 5-minute buffer window
      const now = Date.now();
      const bufferTime = 5 * 60 * 1000; // 5 minutes
      const session: ExtendedSession = {
        accessTokenExpires: now + (bufferTime / 2), // 2.5 min away, within buffer
        expires: new Date(now + (bufferTime / 2) + 3600000).toISOString(),
      };
      expect(isAccessTokenExpired(session)).toBe(true);
    });

    it('should return false when access token is valid and outside buffer', () => {
      // Token expires well beyond the 5-minute buffer
      const now = Date.now();
      const bufferTime = 5 * 60 * 1000; // 5 minutes
      const session: ExtendedSession = {
        accessTokenExpires: now + bufferTime + 10000, // Beyond buffer
        expires: new Date(now + bufferTime + 10000 + 3600000).toISOString(),
      };
      expect(isAccessTokenExpired(session)).toBe(false);
    });
  });

  // ============================================================
  // isRefreshTokenExpired
  // ============================================================
  describe('isRefreshTokenExpired', () => {
    it('should return true when session is null', () => {
      expect(isRefreshTokenExpired(null)).toBe(true);
    });

    it('should return true when session has no refreshTokenExpires', () => {
      // Missing refresh expiry indicates invalid session state
      const session: ExtendedSession = { expires: new Date().toISOString() };
      expect(isRefreshTokenExpired(session)).toBe(true);
    });

    it('should return true when refresh token is expired', () => {
      const now = Date.now();
      const session: ExtendedSession = {
        refreshTokenExpires: now - 1000,
        expires: new Date(now).toISOString(),
      };
      expect(isRefreshTokenExpired(session)).toBe(true);
    });

    it('should return false when refresh token is valid', () => {
      const now = Date.now();
      const session: ExtendedSession = {
        refreshTokenExpires: now + 100000,
        expires: new Date(now + 100000).toISOString(),
      };
      expect(isRefreshTokenExpired(session)).toBe(false);
    });
  });

  // ============================================================
  // handleSessionRefreshFailure
  // ============================================================
  describe('handleSessionRefreshFailure', () => {
    it('should call signOut with callbackUrl containing error parameter', async () => {
      // Source calls signOut({ callbackUrl: '/auth/signin?error=...' })
      signOut.mockResolvedValue({ url: '' });

      await handleSessionRefreshFailure('Session expired');

      expect(signOut).toHaveBeenCalledWith({
        callbackUrl: `/auth/signin?error=${encodeURIComponent('Session expired')}`,
      });
    });

    it('should call signOut with plain callbackUrl when no error provided', async () => {
      // When error is undefined, callbackUrl should be just '/auth/signin'
      signOut.mockResolvedValue({ url: '' });

      await handleSessionRefreshFailure();

      expect(signOut).toHaveBeenCalledWith({
        callbackUrl: '/auth/signin',
      });
    });
  });

  // ============================================================
  // useAutoRefresh
  // ============================================================
  describe('useAutoRefresh', () => {
    it('should return expired flags when no session exists', () => {
      // Null session means both access and refresh are considered expired
      useSession.mockReturnValue(createSessionMock(null, 'unauthenticated'));

      const { result } = renderHook(() => useAutoRefresh());

      expect(result.current.isExpired).toBe(true);
      expect(result.current.isRefreshExpired).toBe(true);
      expect(result.current.refreshSession).toBeDefined();
      expect(result.current.ensureValidSession).toBeDefined();
    });

    it('should return correct expiration status for valid session', () => {
      const now = Date.now();
      const session: ExtendedSession = {
        accessTokenExpires: now + 600000,  // 10 minutes in future (beyond 5-min buffer)
        refreshTokenExpires: now + 200000,
        expires: new Date(now + 600000).toISOString(),
      };
      useSession.mockReturnValue(createSessionMock(session, 'authenticated'));

      const { result } = renderHook(() => useAutoRefresh());

      expect(result.current.isExpired).toBe(false);
      expect(result.current.isRefreshExpired).toBe(false);
    });

    it('should return expired status when access token is expired', () => {
      const now = Date.now();
      const session: ExtendedSession = {
        accessTokenExpires: now - 1000,
        refreshTokenExpires: now + 200000,
        expires: new Date(now).toISOString(),
      };
      useSession.mockReturnValue(createSessionMock(session, 'authenticated'));

      const { result } = renderHook(() => useAutoRefresh());

      expect(result.current.isExpired).toBe(true);
      expect(result.current.isRefreshExpired).toBe(false);
    });

    it('should return refresh expired status when refresh token is expired', () => {
      const now = Date.now();
      const session: ExtendedSession = {
        accessTokenExpires: now + 600000,  // 10 minutes in future (beyond 5-min buffer)
        refreshTokenExpires: now - 1000,
        expires: new Date(now - 1000).toISOString(),
      };
      useSession.mockReturnValue(createSessionMock(session, 'authenticated'));

      const { result } = renderHook(() => useAutoRefresh());

      expect(result.current.isExpired).toBe(false);
      expect(result.current.isRefreshExpired).toBe(true);
    });

    it('should call handleSessionRefreshFailure when refresh token is expired on ensureValidSession', async () => {
      // When both tokens are expired, ensureValidSession calls handleSessionRefreshFailure
      // which calls signOut with a callbackUrl. ensureValidSession returns void.
      const now = Date.now();
      const session: ExtendedSession = {
        accessTokenExpires: now - 1000,
        refreshTokenExpires: now - 2000,
        expires: new Date(now - 2000).toISOString(),
      };
      signOut.mockResolvedValue({ url: '' });
      useSession.mockReturnValue(createSessionMock(session, 'authenticated'));

      const { result } = renderHook(() => useAutoRefresh());
      await act(async () => {
        await result.current.ensureValidSession();
      });

      // handleSessionRefreshFailure calls signOut with the error message
      expect(signOut).toHaveBeenCalledWith({
        callbackUrl: expect.stringContaining('/auth/signin'),
      });
    });

    it('should call update() to refresh session when access token is expired but refresh token valid', async () => {
      // When access token is expired but refresh token is valid,
      // ensureValidSession calls refreshSession which calls update()
      const now = Date.now();
      const session: ExtendedSession = {
        accessTokenExpires: now - 1000,
        refreshTokenExpires: now + 200000,
        expires: new Date(now).toISOString(),
      };
      const mockUpdate = jest.fn().mockResolvedValue(undefined);
      useSession.mockReturnValue({
        data: session,
        update: mockUpdate,
        status: 'authenticated',
      } as unknown as SessionContextValue<boolean>);

      const { result } = renderHook(() => useAutoRefresh());
      await act(async () => {
        await result.current.ensureValidSession();
      });

      // refreshSession should call the update() function from useSession
      expect(mockUpdate).toHaveBeenCalled();
    });

    it('should not call update when session is valid', async () => {
      // When both tokens are valid, ensureValidSession does nothing
      const now = Date.now();
      const session: ExtendedSession = {
        accessTokenExpires: now + 600000,
        refreshTokenExpires: now + 200000,
        expires: new Date(now + 600000).toISOString(),
      };
      const mockUpdate = jest.fn();
      useSession.mockReturnValue({
        data: session,
        update: mockUpdate,
        status: 'authenticated',
      } as unknown as SessionContextValue<boolean>);

      const { result } = renderHook(() => useAutoRefresh());
      await act(async () => {
        await result.current.ensureValidSession();
      });

      expect(mockUpdate).not.toHaveBeenCalled();
      expect(signOut).not.toHaveBeenCalled();
    });
  });

  // ============================================================
  // authenticatedFetch
  // ============================================================
  describe('authenticatedFetch', () => {
    const mockSession: ExtendedSession = {
      accessTokenExpires: Date.now() + 3600000,
      refreshTokenExpires: Date.now() + 7200000,
      expires: new Date(Date.now() + 3600000).toISOString(),
    };

    it('should call handleSessionRefreshFailure and return 401 when no session', async () => {
      // Source: null session calls handleSessionRefreshFailure('Not authenticated')
      // then returns a 401 Response with { error: 'Not authenticated' }
      signOut.mockResolvedValue({ url: '' });

      const response = await authenticatedFetch('/api/test', {}, null);

      expect(signOut).toHaveBeenCalledWith({
        callbackUrl: expect.stringContaining('/auth/signin'),
      });
      expect(response.status).toBe(401);
      const body = await response.json();
      expect(body.error).toBe('Not authenticated');
    });

    it('should call handleSessionRefreshFailure and return 401 when refresh token expired', async () => {
      // Source: expired refresh token calls handleSessionRefreshFailure('Session expired')
      // then returns a 401 Response with { error: 'Session expired' }
      const expiredRefreshSession: ExtendedSession = {
        accessTokenExpires: Date.now() + 3600000,
        refreshTokenExpires: Date.now() - 1000,
        expires: new Date(Date.now() - 1000).toISOString(),
      };
      signOut.mockResolvedValue({ url: '' });

      const response = await authenticatedFetch('/api/test', {}, expiredRefreshSession);

      expect(signOut).toHaveBeenCalledWith({
        callbackUrl: expect.stringContaining('/auth/signin'),
      });
      expect(response.status).toBe(401);
      const body = await response.json();
      expect(body.error).toBe('Session expired');
    });

    it('should make fetch call with Content-Type header for valid session', async () => {
      // Source: calls fetch(url, { ...options, headers: { 'Content-Type': 'application/json', ...options.headers } })
      (fetch as jest.Mock).mockResolvedValue(new Response('OK', { status: 200 }));

      await authenticatedFetch('/api/test', {}, mockSession);

      expect(fetch).toHaveBeenCalledWith(
        '/api/test',
        expect.objectContaining({
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
        })
      );
    });

    it('should return the fetch response for valid session', async () => {
      // Source: returns the response from fetch() directly
      const mockResponse = new Response(JSON.stringify({ data: 'test' }), { status: 200 });
      (fetch as jest.Mock).mockResolvedValue(mockResponse);

      const response = await authenticatedFetch('/api/test', {}, mockSession);

      expect(response).toBe(mockResponse);
    });

    it('should merge custom headers with Content-Type', async () => {
      // Source: { 'Content-Type': 'application/json', ...options.headers }
      (fetch as jest.Mock).mockResolvedValue(new Response('OK', { status: 200 }));

      await authenticatedFetch('/api/test', {
        headers: { 'X-Custom': 'value' },
      }, mockSession);

      expect(fetch).toHaveBeenCalledWith(
        '/api/test',
        expect.objectContaining({
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'X-Custom': 'value',
          }),
        })
      );
    });
  });

  // ============================================================
  // handleApiError
  // ============================================================
  describe('handleApiError', () => {
    it('should return data.error string when present', () => {
      // Source: if data?.error && typeof data.error === 'string', return data.error
      const response = new Response('Unauthorized', { status: 401 });
      const result = handleApiError(response, { error: 'Unauthorized' });
      expect(result).toBe('Unauthorized');
    });

    it('should return mapped message for 400 when no data.error', () => {
      const response = new Response('Bad Request', { status: 400 });
      const result = handleApiError(response, {});
      expect(result).toBe('Invalid request. Please check your input.');
    });

    it('should return mapped message for 401 when no data.error', () => {
      const response = new Response('Unauthorized', { status: 401 });
      const result = handleApiError(response, {});
      expect(result).toBe('Authentication required. Please sign in.');
    });

    it('should return mapped message for 403 when no data.error', () => {
      const response = new Response('Forbidden', { status: 403 });
      const result = handleApiError(response, {});
      expect(result).toBe('You do not have permission for this action.');
    });

    it('should return mapped message for 404 when no data.error', () => {
      const response = new Response('Not Found', { status: 404 });
      const result = handleApiError(response, {});
      expect(result).toBe('The requested resource was not found.');
    });

    it('should return mapped message for 409 when no data.error', () => {
      const response = new Response('Conflict', { status: 409 });
      const result = handleApiError(response, {});
      expect(result).toBe('Conflict: the data was modified by another user. Please refresh and try again.');
    });

    it('should return mapped message for 429 when no data.error', () => {
      const response = new Response('Too Many Requests', { status: 429 });
      const result = handleApiError(response, {});
      expect(result).toBe('Too many requests. Please wait a moment and try again.');
    });

    it('should return mapped message for 500 when no data.error', () => {
      const response = new Response('Server Error', { status: 500 });
      const result = handleApiError(response, {});
      expect(result).toBe('An unexpected server error occurred. Please try again later.');
    });

    it('should return default message with status code for unknown status', () => {
      // Source: default case returns `An error occurred (${response.status}). Please try again.`
      const response = new Response('Teapot', { status: 418 });
      const result = handleApiError(response, {});
      expect(result).toBe('An error occurred (418). Please try again.');
    });

    it('should prefer data.error over status code mapping', () => {
      // When data.error is a string, it takes priority over status mapping
      const response = new Response('Forbidden', { status: 403 });
      const result = handleApiError(response, { error: 'Access forbidden' });
      expect(result).toBe('Access forbidden');
    });
  });

  // ============================================================
  // getSessionErrorMessage
  // ============================================================
  describe('getSessionErrorMessage', () => {
    it('should return the string directly when error is a string', () => {
      // Source: typeof error === 'string' branch returns the error string as-is
      expect(getSessionErrorMessage('RefreshAccessTokenError')).toBe('RefreshAccessTokenError');
      expect(getSessionErrorMessage('SessionExpired')).toBe('SessionExpired');
      expect(getSessionErrorMessage('AccessDenied')).toBe('AccessDenied');
      expect(getSessionErrorMessage('OAuthSignin')).toBe('OAuthSignin');
      expect(getSessionErrorMessage('SessionRequired')).toBe('SessionRequired');
    });

    it('should return network error message for fetch/network errors', () => {
      // Source: error.message.toLowerCase().includes('fetch failed') or 'network'
      const fetchError = new Error('fetch failed');
      expect(getSessionErrorMessage(fetchError)).toBe(
        'Network error. Please check your connection and try again.'
      );

      const networkError = new Error('Network error occurred');
      expect(getSessionErrorMessage(networkError)).toBe(
        'Network error. Please check your connection and try again.'
      );
    });

    it('should return session error message for session/token errors', () => {
      // Source: error.message.toLowerCase().includes('session') or 'token'
      const sessionError = new Error('Session has expired');
      expect(getSessionErrorMessage(sessionError)).toBe(
        'Session error. Please sign in again.'
      );

      const tokenError = new Error('Token refresh failed');
      expect(getSessionErrorMessage(tokenError)).toBe(
        'Session error. Please sign in again.'
      );
    });

    it('should return expired message for unauthorized/401 errors', () => {
      // Source: error.message.toLowerCase().includes('unauthorized') or '401'
      const unauthorizedError = new Error('Unauthorized access');
      expect(getSessionErrorMessage(unauthorizedError)).toBe(
        'Your session has expired. Please sign in again.'
      );

      const status401Error = new Error('Request failed with 401');
      expect(getSessionErrorMessage(status401Error)).toBe(
        'Your session has expired. Please sign in again.'
      );
    });

    it('should return generic auth error for unrecognized Error objects', () => {
      // Source: fallback for Error instances with unrecognized messages
      const unknownError = new Error('Something went wrong');
      expect(getSessionErrorMessage(unknownError)).toBe(
        'An authentication error occurred. Please try again.'
      );
    });

    it('should return generic unexpected error for non-string, non-Error values', () => {
      // Source: final fallback returns generic message
      expect(getSessionErrorMessage(123)).toBe(
        'An unexpected error occurred. Please try again.'
      );
      expect(getSessionErrorMessage(null)).toBe(
        'An unexpected error occurred. Please try again.'
      );
      expect(getSessionErrorMessage(undefined)).toBe(
        'An unexpected error occurred. Please try again.'
      );
      expect(getSessionErrorMessage({ code: 'ERROR' })).toBe(
        'An unexpected error occurred. Please try again.'
      );
    });
  });
});
