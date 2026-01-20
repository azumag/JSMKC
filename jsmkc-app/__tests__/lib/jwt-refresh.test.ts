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

// Mock next-auth
jest.mock('next-auth/react', () => ({
  signOut: jest.fn(),
  useSession: jest.fn(),
}));

const { signOut, useSession } = require('next-auth/react');

// Mock window object
const mockWindow = {
  location: {
    pathname: '/dashboard',
    href: '',
  },
};

Object.defineProperty(global, 'window', {
  value: mockWindow,
  writable: true,
});

// Mock fetch
global.fetch = jest.fn();

describe('JWT Refresh Utilities', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockWindow.location.href = '';
    mockWindow.location.pathname = '/dashboard';
  });

  describe('isAccessTokenExpired', () => {
    it('should return true when session is null', () => {
      expect(isAccessTokenExpired(null)).toBe(true);
    });

    it('should return true when session has no accessTokenExpires', () => {
      const session: ExtendedSession = { error: 'Test', expires: new Date().toISOString() };
      expect(isAccessTokenExpired(session)).toBe(true);
    });

    it('should return true when access token is expired', () => {
      const now = Date.now();
      const session: ExtendedSession = {
        accessTokenExpires: now - 1000,
        expires: new Date(now).toISOString(),
      };
      expect(isAccessTokenExpired(session)).toBe(true);
    });

    it('should return true when access token is within buffer time', () => {
      const now = Date.now();
      const bufferTime = 5 * 60 * 1000; // 5 minutes
      const session: ExtendedSession = {
        accessTokenExpires: now + (bufferTime / 2),
        expires: new Date(now + (bufferTime / 2) + 3600000).toISOString(),
      };
      expect(isAccessTokenExpired(session)).toBe(true);
    });

    it('should return false when access token is valid and outside buffer', () => {
      const now = Date.now();
      const bufferTime = 5 * 60 * 1000; // 5 minutes
      const session: ExtendedSession = {
        accessTokenExpires: now + bufferTime + 10000,
        expires: new Date(now + bufferTime + 10000 + 3600000).toISOString(),
      };
      expect(isAccessTokenExpired(session)).toBe(false);
    });
  });

  describe('isRefreshTokenExpired', () => {
    it('should return true when session is null', () => {
      expect(isRefreshTokenExpired(null)).toBe(true);
    });

    it('should return true when session has no refreshTokenExpires', () => {
      const session: ExtendedSession = { error: 'Test', expires: new Date().toISOString() };
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

  describe('handleSessionRefreshFailure', () => {
    it('should clear session and redirect to sign in', async () => {
      signOut.mockResolvedValue(undefined);
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      await handleSessionRefreshFailure('Session expired');

      expect(consoleSpy).toHaveBeenCalledWith('Session refresh failed:', 'Session expired');
      expect(signOut).toHaveBeenCalledWith({ redirect: false });
      expect(mockWindow.location.href).toContain('/auth/signin');
      expect(mockWindow.location.href).toContain('error=SessionExpired');
      expect(mockWindow.location.href).toContain('message=');

      consoleSpy.mockRestore();
    });

    it('should use default error message when none provided', async () => {
      signOut.mockResolvedValue(undefined);
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      await handleSessionRefreshFailure();

      expect(consoleSpy).toHaveBeenCalledWith('Session refresh failed:', undefined);
      expect(mockWindow.location.href).toContain('Your+session+has+expired.+Please+sign+in+again.');

      consoleSpy.mockRestore();
    });
  });

  describe('useAutoRefresh', () => {
    it('should return null session status when no session exists', () => {
      useSession.mockReturnValue({ data: null, update: jest.fn() });

      const result = useAutoRefresh();

      expect(result.isExpired).toBe(true);
      expect(result.isRefreshExpired).toBe(true);
      expect(result.refreshSession).toBeDefined();
      expect(result.ensureValidSession).toBeDefined();
    });

    it('should return correct expiration status for session', () => {
      const now = Date.now();
      const session: ExtendedSession = {
        accessTokenExpires: now + 100000,
        refreshTokenExpires: now + 200000,
        expires: new Date(now + 100000).toISOString(),
      };
      useSession.mockReturnValue({ data: session, update: jest.fn() });

      const result = useAutoRefresh();

      expect(result.isExpired).toBe(false);
      expect(result.isRefreshExpired).toBe(false);
    });

    it('should return expired status when access token is expired', () => {
      const now = Date.now();
      const session: ExtendedSession = {
        accessTokenExpires: now - 1000,
        refreshTokenExpires: now + 200000,
        expires: new Date(now).toISOString(),
      };
      useSession.mockReturnValue({ data: session, update: jest.fn() });

      const result = useAutoRefresh();

      expect(result.isExpired).toBe(true);
      expect(result.isRefreshExpired).toBe(false);
    });

    it('should return refresh expired status when refresh token is expired', () => {
      const now = Date.now();
      const session: ExtendedSession = {
        accessTokenExpires: now + 100000,
        refreshTokenExpires: now - 1000,
        expires: new Date(now - 1000).toISOString(),
      };
      useSession.mockReturnValue({ data: session, update: jest.fn() });

      const result = useAutoRefresh();

      expect(result.isExpired).toBe(false);
      expect(result.isRefreshExpired).toBe(true);
    });

    it('should redirect to sign in when no session exists on ensureValidSession', async () => {
      useSession.mockReturnValue({ data: null, update: jest.fn() });

      const { ensureValidSession } = useAutoRefresh();
      const result = await ensureValidSession();

      expect(result).toBe(false);
      expect(mockWindow.location.href).toBe('/auth/signin');
    });

    it('should refresh session when access token is expired', async () => {
      const now = Date.now();
      const session: ExtendedSession = {
        accessTokenExpires: now - 1000,
        refreshTokenExpires: now + 200000,
        expires: new Date(now).toISOString(),
      };
      const update = jest.fn().mockResolvedValue({});
      useSession.mockReturnValue({ data: session, update });

      const { ensureValidSession } = useAutoRefresh();
      const result = await ensureValidSession();

      expect(update).toHaveBeenCalled();
      expect(result).toBe(true);
    });

    it('should handle refresh token expiration gracefully', async () => {
      const now = Date.now();
      const session: ExtendedSession = {
        accessTokenExpires: now - 1000,
        refreshTokenExpires: now - 2000,
        expires: new Date(now - 2000).toISOString(),
      };
      const update = jest.fn().mockResolvedValue({});
      signOut.mockResolvedValue(undefined);
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      useSession.mockReturnValue({ data: session, update });

      const { ensureValidSession } = useAutoRefresh();
      const result = await ensureValidSession();

      expect(result).toBe(false);
      expect(mockWindow.location.href).toContain('/auth/signin');

      consoleSpy.mockRestore();
    });
  });

  describe('authenticatedFetch', () => {
    const mockSession: ExtendedSession = {
      accessToken: 'test-access-token',
      accessTokenExpires: Date.now() + 3600000,
      refreshTokenExpires: Date.now() + 7200000,
      expires: new Date(Date.now() + 3600000).toISOString(),
    };

    it('should redirect to sign in when no session', async () => {
      await expect(authenticatedFetch('/api/test', {}, null)).rejects.toThrow('Session validation failed');
      expect(mockWindow.location.href).toBe('/auth/signin');
    });

    it('should add authorization header with access token', async () => {
      (fetch as jest.Mock).mockResolvedValue(new Response('OK', { status: 200 }));

      const response = await authenticatedFetch('/api/test', {}, mockSession);

      expect(fetch).toHaveBeenCalledWith(
        '/api/test',
        expect.objectContaining({
          headers: expect.any(Headers),
        })
      );

      const headers = (fetch as jest.Mock).mock.calls[0][1].headers;
      expect(headers.get('Authorization')).toBe('Bearer test-access-token');
    });

    it('should refresh session when access token is expired', async () => {
      const expiredSession: ExtendedSession = {
        ...mockSession,
        accessTokenExpires: Date.now() - 1000,
      };

      (fetch as jest.Mock)
        .mockResolvedValueOnce(new Response(JSON.stringify({}), { status: 200 }))
        .mockResolvedValueOnce(new Response('OK', { status: 200 }));

      const response = await authenticatedFetch('/api/test', {}, expiredSession);

      expect(fetch).toHaveBeenCalledWith('/api/auth/session', expect.any(Object));
    });

    it('should handle session refresh failure', async () => {
      const expiredSession: ExtendedSession = {
        ...mockSession,
        accessTokenExpires: Date.now() - 1000,
      };

      signOut.mockResolvedValue(undefined);
      (fetch as jest.Mock).mockResolvedValue(
        new Response(JSON.stringify({ error: 'RefreshAccessTokenError' }), { status: 200 })
      );

      await expect(authenticatedFetch('/api/test', {}, expiredSession)).rejects.toThrow('Session validation failed');
      expect(mockWindow.location.href).toContain('/auth/signin');
    });
  });

  describe('handleApiError', () => {
    it('should handle 401 errors with session refresh', () => {
      const response = new Response('Unauthorized', { status: 401 });
      signOut.mockResolvedValue(undefined);
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      handleApiError(response, { error: 'Unauthorized' });

      expect(signOut).toHaveBeenCalled();
      expect(mockWindow.location.href).toContain('/auth/signin');

      consoleSpy.mockRestore();
    });

    it('should throw error for 403 forbidden', () => {
      const response = new Response('Forbidden', { status: 403 });

      expect(() => handleApiError(response, { error: 'Access forbidden' })).toThrow('Access forbidden');
    });

    it('should throw error for 500 server error', () => {
      const response = new Response('Server Error', { status: 500 });

      expect(() => handleApiError(response, { error: 'Server error' })).toThrow('Server error');
    });

    it('should throw error for other non-OK responses', () => {
      const response = new Response('Bad Request', { status: 400 });

      expect(() => handleApiError(response, { error: 'Bad request' })).toThrow('Bad request');
    });

    it('should use default error message when none provided', () => {
      const response = new Response('Not Found', { status: 404 });

      expect(() => handleApiError(response, {})).toThrow('Request failed with status 404');
    });
  });

  describe('getSessionErrorMessage', () => {
    it('should return correct message for RefreshAccessTokenError', () => {
      const message = getSessionErrorMessage('RefreshAccessTokenError');
      expect(message).toBe('Your session could not be refreshed. Please sign in again.');
    });

    it('should return correct message for SessionExpired', () => {
      const message = getSessionErrorMessage('SessionExpired');
      expect(message).toBe('Your session has expired. Please sign in again.');
    });

    it('should return correct message for AccessDenied', () => {
      const message = getSessionErrorMessage('AccessDenied');
      expect(message).toBe('Access denied. You do not have permission to perform this action.');
    });

    it('should return correct message for OAuthSignin', () => {
      const message = getSessionErrorMessage('OAuthSignin');
      expect(message).toBe('Error signing in with OAuth provider. Please try again.');
    });

    it('should return correct message for OAuthCallback', () => {
      const message = getSessionErrorMessage('OAuthCallback');
      expect(message).toBe('Error during OAuth callback. Please try again.');
    });

    it('should return correct message for OAuthCreateAccount', () => {
      const message = getSessionErrorMessage('OAuthCreateAccount');
      expect(message).toBe('Could not create account. Please contact support.');
    });

    it('should return correct message for EmailCreateAccount', () => {
      const message = getSessionErrorMessage('EmailCreateAccount');
      expect(message).toBe('Could not create account with this email address.');
    });

    it('should return correct message for Callback', () => {
      const message = getSessionErrorMessage('Callback');
      expect(message).toBe('Error during authentication callback.');
    });

    it('should return correct message for OAuthAccountNotLinked', () => {
      const message = getSessionErrorMessage('OAuthAccountNotLinked');
      expect(message).toBe('This account is already linked to another provider.');
    });

    it('should return correct message for SessionRequired', () => {
      const message = getSessionErrorMessage('SessionRequired');
      expect(message).toBe('You must be signed in to access this resource.');
    });

    it('should return default message for unknown errors', () => {
      const message = getSessionErrorMessage('UnknownError');
      expect(message).toBe('An authentication error occurred. Please try again.');
    });
  });
});
