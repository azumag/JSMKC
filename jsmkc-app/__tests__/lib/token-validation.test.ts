/**
 * @jest-environment jsdom
 */

/**
 * @module __tests__/lib/token-validation.test.ts
 * @description Test suite for the token validation module from `@/lib/token-validation`.
 *
 * Tests four exported functions:
 *
 * - `validateToken`: Basic token format check. Delegates to `isValidTokenFormat`
 *   from token-utils (expects 32-char hex). Returns `'Tournament token is required'`
 *   for null/empty, `'Invalid token format'` for wrong format.
 *
 * - `getAccessTokenExpiry`: Returns a DURATION in milliseconds.
 *   `getAccessTokenExpiry(false)` => 86400000 (24h).
 *   `getAccessTokenExpiry(true)` => 604800000 (168h / 7 days).
 *
 * - `validateTournamentToken`: Full async validation against DB. Uses
 *   `prisma.tournament.findFirst` with `deletedAt: null` filter and `select`.
 *   Calls `checkRateLimit`, `getClientIdentifier`, and audit logging.
 *
 * - `requireTournamentToken`: Middleware wrapper. Returns 401 on failure,
 *   calls handler with TournamentContext on success.
 *
 * Dependencies are mocked explicitly. The module under test is unmocked
 * so we get the real implementation.
 */
// @ts-nocheck - Test file uses complex mock types that are difficult to type correctly

// Unmock the module under test so we get the real implementation.
jest.unmock('@/lib/token-validation');

// Explicitly mock all dependencies that token-validation.ts imports.
// Without these, the real modules would be loaded and may hang
// (e.g., rate-limit tries to connect to Redis).
jest.mock('@/lib/token-utils');
jest.mock('@/lib/rate-limit');
jest.mock('@/lib/audit-log');
// @/lib/prisma is already mocked globally in jest.setup.js

// Logger mock must use a factory because token-validation.ts calls
// createLogger() at module scope. The factory ensures the mock logger
// is returned immediately when the module loads.
// Note: jest.mock factories run before any const declarations in the file
// (due to hoisting), so the mock logger must be defined inside the factory.
jest.mock('@/lib/logger', () => {
  const logger = {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  };
  return {
    createLogger: jest.fn(() => logger),
  };
});

// Override the jest.setup.js mock of next/server to include nextUrl support.
// The source uses request.nextUrl.searchParams.get('token') which requires
// a proper URL-parsing mock NextRequest.
jest.mock('next/server', () => {
  class MockNextRequest {
    url: string;
    headers: Headers;
    method: string;
    body: unknown;
    nextUrl: URL;

    constructor(urlOrRequest: string | { url: string; headers: Headers; method: string; body: unknown }, init?: { headers?: Record<string, string> | Headers; method?: string; body?: unknown }) {
      if (typeof urlOrRequest === 'string') {
        this.url = urlOrRequest;
        this.headers = init?.headers instanceof Headers
          ? init.headers
          : new Headers(init?.headers || {});
        this.method = init?.method || 'GET';
        this.body = init?.body;
      } else {
        this.url = urlOrRequest.url;
        this.headers = urlOrRequest.headers;
        this.method = urlOrRequest.method;
        this.body = urlOrRequest.body;
      }
      // Parse the URL to provide nextUrl with searchParams
      this.nextUrl = new URL(this.url);
    }

    async json() {
      return JSON.parse(this.body as string);
    }
  }

  return {
    __esModule: true,
    NextRequest: MockNextRequest,
    NextResponse: {
      json: jest.fn((data: unknown, init?: { status?: number }) => {
        const status = init?.status || 200;
        return {
          status,
          json: async () => data,
          headers: new Headers({ 'Content-Type': 'application/json' }),
        };
      }),
    },
  };
});

import {
  validateToken,
  getAccessTokenExpiry,
  validateTournamentToken,
  requireTournamentToken,
} from '@/lib/token-validation';
import { NextRequest } from 'next/server';

// Access mock functions via jest.requireMock for proper typing
const tokenUtilsMock = jest.requireMock('@/lib/token-utils') as {
  isValidTokenFormat: jest.Mock;
  isTokenValid: jest.Mock;
};

const rateLimitMock = jest.requireMock('@/lib/rate-limit') as {
  checkRateLimit: jest.Mock;
  getClientIdentifier: jest.Mock;
  getUserAgent: jest.Mock;
};

const auditLogMock = jest.requireMock('@/lib/audit-log') as {
  createAuditLog: jest.Mock;
  AUDIT_ACTIONS: Record<string, string>;
};

// Valid 32-char hex token for testing
const VALID_TOKEN = '0123456789abcdef0123456789abcdef';

describe('Token Validation', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Default mock behavior: isValidTokenFormat checks 32-char hex pattern
    tokenUtilsMock.isValidTokenFormat.mockImplementation((token: string) => {
      return /^[0-9a-fA-F]{32}$/.test(token);
    });

    // Default: isTokenValid returns true (token not expired)
    tokenUtilsMock.isTokenValid.mockReturnValue(true);

    // Default: rate limit passes
    rateLimitMock.checkRateLimit.mockResolvedValue({ success: true, remaining: 9 });

    // Default: client identifier returns a test IP
    rateLimitMock.getClientIdentifier.mockReturnValue('127.0.0.1');
    rateLimitMock.getUserAgent.mockReturnValue('test-agent');

    // Default: audit log succeeds (fire-and-forget)
    auditLogMock.createAuditLog.mockResolvedValue(undefined);
  });

  // ============================================================
  // validateToken - basic format validation
  // ============================================================
  describe('validateToken', () => {
    it('should accept a valid 32-char hex token', () => {
      const result = validateToken(VALID_TOKEN);
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should reject empty string token', () => {
      // Empty string is falsy, so source returns "Tournament token is required"
      const result = validateToken('');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Tournament token is required');
    });

    it('should reject null token', () => {
      const result = validateToken(null as unknown as string);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Tournament token is required');
    });

    it('should reject undefined token', () => {
      const result = validateToken(undefined as unknown as string);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Tournament token is required');
    });

    it('should reject token with invalid format (special characters)', () => {
      const result = validateToken('invalid-token!@#$');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid token format');
    });

    it('should reject short token (not 32 chars)', () => {
      const result = validateToken('abcdef1234');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid token format');
    });

    it('should reject token with only dots', () => {
      const result = validateToken('....');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid token format');
    });

    it('should reject token with spaces', () => {
      const result = validateToken('test token');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid token format');
    });

    it('should accept uppercase hex token (32 chars)', () => {
      const result = validateToken('0123456789ABCDEF0123456789ABCDEF');
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });
  });

  // ============================================================
  // getAccessTokenExpiry - returns duration in milliseconds
  // ============================================================
  describe('getAccessTokenExpiry', () => {
    it('should return a positive number for access token', () => {
      const expiry = getAccessTokenExpiry();
      expect(expiry).toBeGreaterThan(0);
    });

    it('should return a positive number for refresh token', () => {
      const expiry = getAccessTokenExpiry(true);
      expect(expiry).toBeGreaterThan(0);
    });

    it('should return exactly 24 hours in ms for access token (default)', () => {
      const expiry = getAccessTokenExpiry(false);
      expect(expiry).toBe(24 * 60 * 60 * 1000); // 86400000
    });

    it('should return exactly 168 hours in ms for refresh token', () => {
      const expiry = getAccessTokenExpiry(true);
      expect(expiry).toBe(168 * 60 * 60 * 1000); // 604800000
    });

    it('should default to access token (no argument)', () => {
      const expiry = getAccessTokenExpiry();
      expect(expiry).toBe(24 * 60 * 60 * 1000);
    });

    it('should return 7x more for refresh than access', () => {
      const access = getAccessTokenExpiry(false);
      const refresh = getAccessTokenExpiry(true);
      expect(refresh).toBe(access * 7);
    });
  });

  // ============================================================
  // validateTournamentToken - full async validation
  // ============================================================
  describe('validateTournamentToken', () => {
    /**
     * Helper to create a mock NextRequest with optional tournament token header
     * and optional query token parameter.
     */
    function createRequest(options: {
      headerToken?: string;
      queryToken?: string;
    } = {}): InstanceType<typeof NextRequest> {
      const url = options.queryToken
        ? `http://localhost:3000/api/tournaments/t1/token?token=${options.queryToken}`
        : 'http://localhost:3000/api/tournaments/t1/token';

      const headers: Record<string, string> = {};
      if (options.headerToken) {
        headers['x-tournament-token'] = options.headerToken;
      }

      return new NextRequest(url, { headers });
    }

    /**
     * Helper to set up the prisma.tournament.findFirst mock
     */
    function mockTournamentFindFirst(value: unknown) {
      const mockPrisma = jest.requireMock('@/lib/prisma').default;
      mockPrisma.tournament.findFirst.mockResolvedValue(value);
    }

    it('should validate token and return tournament data on success', async () => {
      const tournament = {
        id: 'tournament-1',
        name: 'Test Tournament',
        status: 'ACTIVE',
        token: VALID_TOKEN,
        tokenExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      };
      mockTournamentFindFirst(tournament);

      const request = createRequest({ headerToken: VALID_TOKEN });
      const result = await validateTournamentToken(request, 'tournament-1');

      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
      expect(result.tournament).toBeDefined();
      expect(result.tournament?.id).toBe('tournament-1');
      expect(result.tournament?.name).toBe('Test Tournament');
      expect(result.tournament?.status).toBe('ACTIVE');
    });

    it('should return error for missing token (no header, no query)', async () => {
      const request = createRequest();
      const result = await validateTournamentToken(request, 'tournament-1');

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Tournament token is required');
    });

    it('should return error for invalid token format', async () => {
      const request = createRequest({ headerToken: 'not-a-valid-hex-token!' });
      const result = await validateTournamentToken(request, 'tournament-1');

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid token format');
    });

    it('should return error when rate limit exceeded', async () => {
      rateLimitMock.checkRateLimit.mockResolvedValue({ success: false, retryAfter: 60 });

      const request = createRequest({ headerToken: VALID_TOKEN });
      const result = await validateTournamentToken(request, 'tournament-1');

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Too many validation attempts. Please try again later.');
    });

    it('should return error when tournament not found', async () => {
      mockTournamentFindFirst(null);

      const request = createRequest({ headerToken: VALID_TOKEN });
      const result = await validateTournamentToken(request, 'tournament-1');

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Tournament not found');
    });

    it('should return error when token does not match', async () => {
      // Tournament has a different token than what was submitted
      const tournament = {
        id: 'tournament-1',
        name: 'Test Tournament',
        status: 'ACTIVE',
        token: 'aaaabbbbccccddddeeeeffffaaaabbbb', // different token
        tokenExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      };
      mockTournamentFindFirst(tournament);

      const request = createRequest({ headerToken: VALID_TOKEN });
      const result = await validateTournamentToken(request, 'tournament-1');

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid tournament token');
    });

    it('should return error when tournament has null token', async () => {
      // Tournament has token set to null
      const tournament = {
        id: 'tournament-1',
        name: 'Test Tournament',
        status: 'ACTIVE',
        token: null,
        tokenExpiresAt: null,
      };
      mockTournamentFindFirst(tournament);

      const request = createRequest({ headerToken: VALID_TOKEN });
      const result = await validateTournamentToken(request, 'tournament-1');

      expect(result.valid).toBe(false);
      // null !== VALID_TOKEN, so this is a token mismatch
      expect(result.error).toBe('Invalid tournament token');
    });

    it('should return error when token has expired', async () => {
      // Token matches but is expired
      const tournament = {
        id: 'tournament-1',
        name: 'Test Tournament',
        status: 'ACTIVE',
        token: VALID_TOKEN,
        tokenExpiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000), // expired
      };
      mockTournamentFindFirst(tournament);

      // isTokenValid should return false for expired token
      tokenUtilsMock.isTokenValid.mockReturnValue(false);

      const request = createRequest({ headerToken: VALID_TOKEN });
      const result = await validateTournamentToken(request, 'tournament-1');

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Tournament token has expired');
    });

    it('should propagate database errors (no try-catch in source)', async () => {
      // The source function does NOT have a top-level try-catch,
      // so database errors propagate as exceptions
      const mockPrisma = jest.requireMock('@/lib/prisma').default;
      mockPrisma.tournament.findFirst.mockRejectedValue(new Error('Database error'));

      const request = createRequest({ headerToken: VALID_TOKEN });

      await expect(
        validateTournamentToken(request, 'tournament-1')
      ).rejects.toThrow('Database error');
    });

    it('should accept token from query parameter as fallback', async () => {
      const tournament = {
        id: 'tournament-1',
        name: 'Test Tournament',
        status: 'ACTIVE',
        token: VALID_TOKEN,
        tokenExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      };
      mockTournamentFindFirst(tournament);

      // No header token, but token in query string
      const request = createRequest({ queryToken: VALID_TOKEN });
      const result = await validateTournamentToken(request, 'tournament-1');

      expect(result.valid).toBe(true);
      expect(result.tournament?.id).toBe('tournament-1');
    });

    it('should prefer header token over query parameter', async () => {
      const tournament = {
        id: 'tournament-1',
        name: 'Test Tournament',
        status: 'ACTIVE',
        token: VALID_TOKEN,
        tokenExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      };
      mockTournamentFindFirst(tournament);

      // Both header and query token provided; header should win (|| short-circuit)
      const request = createRequest({
        headerToken: VALID_TOKEN,
        queryToken: 'aaaabbbbccccddddeeeeffffaaaabbbb',
      });
      const result = await validateTournamentToken(request, 'tournament-1');

      expect(result.valid).toBe(true);
      expect(result.tournament?.id).toBe('tournament-1');
    });

    it('should call checkRateLimit with correct arguments', async () => {
      const tournament = {
        id: 'tournament-1',
        name: 'Test Tournament',
        status: 'ACTIVE',
        token: VALID_TOKEN,
        tokenExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      };
      mockTournamentFindFirst(tournament);

      const request = createRequest({ headerToken: VALID_TOKEN });
      await validateTournamentToken(request, 'tournament-1');

      // Source calls: checkRateLimit('tokenValidation', clientIp)
      expect(rateLimitMock.checkRateLimit).toHaveBeenCalledWith(
        'tokenValidation',
        '127.0.0.1'
      );
    });

    it('should log audit entry on successful validation', async () => {
      const tournament = {
        id: 'tournament-1',
        name: 'Test Tournament',
        status: 'ACTIVE',
        token: VALID_TOKEN,
        tokenExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      };
      mockTournamentFindFirst(tournament);

      const request = createRequest({ headerToken: VALID_TOKEN });
      await validateTournamentToken(request, 'tournament-1');

      // logTokenValidationAttempt calls createAuditLog for success
      expect(auditLogMock.createAuditLog).toHaveBeenCalled();
    });

    it('should log audit entry on failed validation (tournament not found)', async () => {
      mockTournamentFindFirst(null);

      const request = createRequest({ headerToken: VALID_TOKEN });
      await validateTournamentToken(request, 'tournament-1');

      // logTokenValidationAttempt calls createAuditLog for failure
      expect(auditLogMock.createAuditLog).toHaveBeenCalled();
    });
  });

  // ============================================================
  // requireTournamentToken middleware
  // ============================================================
  describe('requireTournamentToken middleware', () => {
    /**
     * Helper to set up the prisma.tournament.findFirst mock
     */
    function mockTournamentFindFirst(value: unknown) {
      const mockPrisma = jest.requireMock('@/lib/prisma').default;
      mockPrisma.tournament.findFirst.mockResolvedValue(value);
    }

    it('should return 401 when token validation fails (missing token)', async () => {
      const handler = jest.fn();
      const middleware = requireTournamentToken(handler);

      const request = new NextRequest('http://localhost:3000/api/tournaments/t1/token');
      const routeContext = {
        params: Promise.resolve({ id: 'tournament-1' }),
      };

      const response = await middleware(request, routeContext);

      expect(handler).not.toHaveBeenCalled();
      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.error).toBeDefined();
    });

    it('should return 401 when tournament not found', async () => {
      mockTournamentFindFirst(null);

      const handler = jest.fn();
      const middleware = requireTournamentToken(handler);

      const request = new NextRequest('http://localhost:3000/api/tournaments/t1/token', {
        headers: { 'x-tournament-token': VALID_TOKEN },
      });
      const routeContext = {
        params: Promise.resolve({ id: 'tournament-1' }),
      };

      const response = await middleware(request, routeContext);

      expect(handler).not.toHaveBeenCalled();
      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.success).toBe(false);
    });

    it('should call handler with TournamentContext when validation succeeds', async () => {
      const tournament = {
        id: 'tournament-1',
        name: 'Test Tournament',
        status: 'ACTIVE',
        token: VALID_TOKEN,
        tokenExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      };
      mockTournamentFindFirst(tournament);

      const mockResponse = {
        status: 200,
        json: async () => ({ success: true }),
      };
      const handler = jest.fn().mockResolvedValue(mockResponse);
      const middleware = requireTournamentToken(handler);

      const request = new NextRequest('http://localhost:3000/api/tournaments/t1/token', {
        headers: { 'x-tournament-token': VALID_TOKEN },
      });
      const routeContext = {
        params: Promise.resolve({ id: 'tournament-1' }),
      };

      await middleware(request, routeContext);

      expect(handler).toHaveBeenCalled();

      // Verify handler was called with request and TournamentContext
      const [calledRequest, calledContext] = handler.mock.calls[0];
      expect(calledRequest).toBe(request);

      // TournamentContext should contain tournament data, tournamentId, clientIp, userAgent
      expect(calledContext.tournament).toEqual(tournament);
      expect(calledContext.tournamentId).toBe('tournament-1');
      expect(calledContext.clientIp).toBe('127.0.0.1');
      expect(calledContext.userAgent).toBe('test-agent');
    });
  });

  // ============================================================
  // validateTournamentToken - Tournament Context shape
  // ============================================================
  describe('validateTournamentToken - Tournament Context', () => {
    it('should return full tournament object in result on success', async () => {
      const tournament = {
        id: 'tournament-1',
        name: 'Test Tournament',
        status: 'ACTIVE',
        token: VALID_TOKEN,
        tokenExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      };
      const mockPrisma = jest.requireMock('@/lib/prisma').default;
      mockPrisma.tournament.findFirst.mockResolvedValue(tournament);

      const request = new NextRequest('http://localhost:3000/api/tournaments/t1/token', {
        headers: { 'x-tournament-token': VALID_TOKEN },
      });

      const result = await validateTournamentToken(request, 'tournament-1');

      expect(result.valid).toBe(true);
      // The tournament object returned matches what prisma.findFirst returns
      expect(result.tournament).toEqual(tournament);
    });
  });
});
