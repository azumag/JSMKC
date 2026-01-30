/**
 * @jest-environment jsdom
 */

/**
 * @module Proxy Middleware Tests
 *
 * Tests for the Next.js middleware that handles authentication, authorization,
 * security headers, and Content Security Policy (CSP) for the JSMKC application.
 *
 * Covers:
 * - Protected API routes: authenticated access (GET/POST/PUT/DELETE),
 *   401 responses for unauthenticated write operations, allowing
 *   unauthenticated GET requests to public API endpoints.
 * - Protected frontend routes: redirect to /auth/signin with callbackUrl
 *   for unauthenticated users accessing /profile, allowing authenticated access.
 * - Public frontend routes: /players and /tournaments are publicly viewable.
 * - Unauthorized access logging: audit log creation with IP address and
 *   user agent, graceful handling of audit log failures.
 * - Security headers: X-Frame-Options (DENY), X-Content-Type-Options (nosniff),
 *   Referrer-Policy, Permissions-Policy.
 * - CSP headers: development CSP (unsafe-eval allowed), production CSP
 *   (nonce-based, strict-dynamic, external service allowlists).
 * - Edge cases: unprotected routes, nested paths, missing user-agent header.
 * - Config export: matcher patterns for route matching.
 */
// @ts-nocheck - This test file uses complex mock types that are difficult to type correctly
import { NextResponse, NextRequest } from 'next/server'
import { createAuditLog, AUDIT_ACTIONS } from '@/lib/audit-log'
import { getServerSideIdentifier } from '@/lib/rate-limit'
import { auth as authLib } from '@/lib/auth'
import { createLogger } from '@/lib/logger'

jest.mock('@/lib/auth')
jest.mock('@/lib/audit-log')
jest.mock('@/lib/rate-limit')
jest.mock('@/lib/logger')

const mockCreateAuditLog = createAuditLog as jest.MockedFunction<typeof createAuditLog>
const mockGetServerSideIdentifier = getServerSideIdentifier as jest.MockedFunction<typeof getServerSideIdentifier>

interface MockRequest extends Partial<NextRequest> {
  auth?: { user: { id: string } } | null
}

/**
 * Helper to create a mock NextResponse with headers support.
 * Used for NextResponse.next() and NextResponse.redirect() which are
 * not provided by the global jest.setup.js mock for next/server.
 */
function createMockNextResponse(init: { status?: number; headers?: Record<string, string> } = {}) {
  const headers = new Headers(init.headers || {})
  const response = {
    status: init.status || 200,
    headers,
  }
  // Make it pass instanceof check by setting constructor
  Object.setPrototypeOf(response, NextResponse.prototype || {})
  return response
}

describe('Proxy Middleware', () => {
  let middleware: (req: NextRequest) => Promise<NextResponse>
  let proxyModule: { default: typeof middleware; config: { matcher: string[] } }
  /**
   * Reference to the mock logger instance, so tests can verify
   * that logger.error is called instead of console.error.
   */
  let mockLoggerInstance: { error: jest.Mock; warn: jest.Mock; info: jest.Mock; debug: jest.Mock }

  beforeAll(async () => {
    process.env.NODE_ENV = 'test'

    /**
     * Set up the logger mock BEFORE importing the proxy module.
     * The proxy source creates a module-level logger with
     * `const logger = createLogger('proxy-middleware')`, so the mock
     * must return a proper logger object at import time.
     *
     * We create a dedicated mock logger object and configure createLogger
     * to always return it. This must happen before jest.clearAllMocks()
     * or the import, so we configure the mock implementation explicitly.
     */
    const loggerModule = jest.requireMock('@/lib/logger') as { createLogger: jest.Mock }
    mockLoggerInstance = {
      error: jest.fn(),
      warn: jest.fn(),
      info: jest.fn(),
      debug: jest.fn(),
    }
    loggerModule.createLogger.mockReturnValue(mockLoggerInstance)

    /**
     * The proxy source calls `new NextResponse(body, init)`,
     * `NextResponse.next({ request: { headers } })`, and `NextResponse.redirect(url)`.
     * The global mock only provides `NextResponse.json()`, so we augment it here.
     */
    const nextServerModule = jest.requireMock('next/server')
    const OriginalNextResponse = nextServerModule.NextResponse

    /**
     * Replace NextResponse with a constructor function that also
     * carries over the static methods (json, next, redirect).
     */
    function MockNextResponseConstructor(body, init = {}) {
      const status = init.status || 200
      const headers = new Headers(init.headers || {})
      return {
        body,
        status,
        headers,
        async json() {
          return JSON.parse(body)
        },
        async text() {
          return body
        },
      }
    }
    // Preserve existing static methods
    MockNextResponseConstructor.json = OriginalNextResponse.json

    /**
     * NextResponse.next() returns a response that passes the request through
     * with optional modified headers. We simulate this by returning a 200
     * response with the provided headers merged onto a new Headers object.
     */
    MockNextResponseConstructor.next = jest.fn((options) => {
      const headers = new Headers()
      return {
        status: 200,
        headers,
        request: options?.request,
      }
    })

    /**
     * NextResponse.redirect() returns a 307 redirect response with a
     * Location header pointing to the provided URL.
     */
    MockNextResponseConstructor.redirect = jest.fn((url) => {
      const headers = new Headers()
      headers.set('location', url.toString())
      return {
        status: 307,
        headers,
      }
    })

    nextServerModule.NextResponse = MockNextResponseConstructor

    /**
     * Mock auth() wrapper: it takes a callback and returns a function
     * that simply invokes that callback with the request, simulating
     * NextAuth's session injection via req.auth.
     */
    authLib.mockImplementation((callback: (req: NextRequest) => Promise<NextResponse>) => {
      return async (req: NextRequest) => {
        return await callback(req)
      }
    })

    const proxy = await import('@/proxy')
    middleware = proxy.default
    proxyModule = proxy
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  afterAll(() => {
    delete process.env.NODE_ENV
  })

  describe('Auth middleware - Protected API routes', () => {
    it('should allow authenticated access to protected API routes', async () => {
      const mockReq = {
        nextUrl: { pathname: '/api/tournaments', searchParams: new URLSearchParams() },
        method: 'GET',
        auth: { user: { id: 'user-1' } },
        url: 'http://localhost/api/tournaments',
        headers: new Headers({ 'user-agent': 'test-agent' })
      } as MockRequest

      const response = await middleware(mockReq)

      /**
       * Authenticated GET request to a protected API route should pass through.
       * No 401 response expected since the user is authenticated.
       */
      expect(response.status).not.toBe(401)
    })

    it('should return 401 for unauthenticated access to protected API routes with POST', async () => {
      const mockReq = {
        nextUrl: { pathname: '/api/tournaments', searchParams: new URLSearchParams() },
        method: 'POST',
        auth: null,
        url: 'http://localhost/api/tournaments',
        headers: new Headers({ 'user-agent': 'test-agent' })
      } as MockRequest

      mockGetServerSideIdentifier.mockResolvedValue('127.0.0.1')
      mockCreateAuditLog.mockResolvedValue({} as Awaited<ReturnType<typeof createAuditLog>>)

      const response = await middleware(mockReq)

      expect(response.status).toBe(401)
      const data = await response.json()
      expect(data.success).toBe(false)
      expect(data.error).toBe('Unauthorized')
    })

    it('should return 401 for unauthenticated access to protected API routes with PUT', async () => {
      const mockReq = {
        nextUrl: { pathname: '/api/players', searchParams: new URLSearchParams() },
        method: 'PUT',
        auth: null,
        url: 'http://localhost/api/players',
        headers: new Headers({ 'user-agent': 'test-agent' })
      } as MockRequest

      mockGetServerSideIdentifier.mockResolvedValue('127.0.0.1')
      mockCreateAuditLog.mockResolvedValue({} as Awaited<ReturnType<typeof createAuditLog>>)

      const response = await middleware(mockReq)

      expect(response.status).toBe(401)
    })

    it('should return 401 for unauthenticated access to protected API routes with DELETE', async () => {
      const mockReq = {
        nextUrl: { pathname: '/api/tournaments', searchParams: new URLSearchParams() },
        method: 'DELETE',
        auth: null,
        url: 'http://localhost/api/tournaments',
        headers: new Headers({ 'user-agent': 'test-agent' })
      } as MockRequest

      mockGetServerSideIdentifier.mockResolvedValue('127.0.0.1')
      mockCreateAuditLog.mockResolvedValue({} as Awaited<ReturnType<typeof createAuditLog>>)

      const response = await middleware(mockReq)

      expect(response.status).toBe(401)
    })

    it('should allow unauthenticated GET requests to protected API routes', async () => {
      /**
       * GET requests to API routes are intentionally public so anyone
       * can view tournament and player data without logging in.
       */
      const mockReq = {
        nextUrl: { pathname: '/api/tournaments', searchParams: new URLSearchParams() },
        method: 'GET',
        auth: null,
        url: 'http://localhost/api/tournaments',
        headers: new Headers({ 'user-agent': 'test-agent' })
      } as MockRequest

      const response = await middleware(mockReq)

      expect(response.status).not.toBe(401)
    })
  })

  describe('Auth middleware - Protected frontend routes', () => {
    it('should redirect unauthenticated users from /profile', async () => {
      /**
       * /profile is the only protected frontend route. Unauthenticated
       * users should be redirected to /auth/signin with a callbackUrl.
       */
      const mockReq = {
        nextUrl: {
          pathname: '/profile',
          searchParams: new URLSearchParams()
        },
        method: 'GET',
        auth: null,
        url: 'http://localhost/profile',
        headers: new Headers({ 'user-agent': 'test-agent' })
      } as MockRequest

      mockGetServerSideIdentifier.mockResolvedValue('127.0.0.1')
      mockCreateAuditLog.mockResolvedValue({} as Awaited<ReturnType<typeof createAuditLog>>)

      const response = await middleware(mockReq)

      expect(response.status).toBe(307)
      expect(response.headers.get('location')).toContain('/auth/signin')
    })

    it('should include callbackUrl in redirect for /profile', async () => {
      const mockReq = {
        nextUrl: {
          pathname: '/profile',
          searchParams: new URLSearchParams()
        },
        method: 'GET',
        auth: null,
        url: 'http://localhost/profile',
        headers: new Headers({ 'user-agent': 'test-agent' })
      } as MockRequest

      mockGetServerSideIdentifier.mockResolvedValue('127.0.0.1')
      mockCreateAuditLog.mockResolvedValue({} as Awaited<ReturnType<typeof createAuditLog>>)

      const response = await middleware(mockReq)

      const location = response.headers.get('location')
      expect(location).toContain('/auth/signin')
      expect(location).toContain('callbackUrl=%2Fprofile')
    })

    it('should allow authenticated access to protected frontend routes', async () => {
      const mockReq = {
        nextUrl: { pathname: '/profile', searchParams: new URLSearchParams() },
        method: 'GET',
        auth: { user: { id: 'user-1' } },
        url: 'http://localhost/profile',
        headers: new Headers({ 'user-agent': 'test-agent' })
      } as MockRequest

      const response = await middleware(mockReq)

      expect(response.status).not.toBe(307)
    })

    it('should allow unauthenticated access to /players (public route)', async () => {
      /**
       * /players is NOT a protected frontend route. It is publicly viewable
       * so anyone can browse player data without authentication.
       */
      const mockReq = {
        nextUrl: {
          pathname: '/players',
          searchParams: new URLSearchParams()
        },
        method: 'GET',
        auth: null,
        url: 'http://localhost/players',
        headers: new Headers({ 'user-agent': 'test-agent' })
      } as MockRequest

      const response = await middleware(mockReq)

      expect(response.status).not.toBe(307)
      expect(response.status).not.toBe(401)
    })

    it('should allow unauthenticated access to /tournaments (public route)', async () => {
      /**
       * /tournaments is NOT a protected frontend route. It is publicly viewable
       * so anyone can browse tournament data without authentication.
       */
      const mockReq = {
        nextUrl: {
          pathname: '/tournaments',
          searchParams: new URLSearchParams()
        },
        method: 'GET',
        auth: null,
        url: 'http://localhost/tournaments',
        headers: new Headers({ 'user-agent': 'test-agent' })
      } as MockRequest

      const response = await middleware(mockReq)

      expect(response.status).not.toBe(307)
      expect(response.status).not.toBe(401)
    })
  })

  describe('Auth middleware - Unauthorized access logging', () => {
    it('should log unauthorized access attempts for API routes', async () => {
      const mockReq = {
        nextUrl: { pathname: '/api/tournaments', searchParams: new URLSearchParams() },
        method: 'POST',
        auth: null,
        url: 'http://localhost/api/tournaments',
        headers: new Headers({ 'user-agent': 'test-agent' })
      } as MockRequest

      mockGetServerSideIdentifier.mockResolvedValue('192.168.1.1')
      mockCreateAuditLog.mockResolvedValue({} as Awaited<ReturnType<typeof createAuditLog>>)

      await middleware(mockReq)

      expect(mockGetServerSideIdentifier).toHaveBeenCalled()
      expect(mockCreateAuditLog).toHaveBeenCalledWith({
        ipAddress: '192.168.1.1',
        userAgent: 'test-agent',
        action: AUDIT_ACTIONS.UNAUTHORIZED_ACCESS,
        details: {
          path: '/api/tournaments',
          method: 'POST',
          timestamp: expect.any(String)
        }
      })
    })

    it('should log unauthorized access attempts for frontend routes', async () => {
      /**
       * Only /profile is a protected frontend route, so we use /profile
       * to trigger the unauthorized access audit log.
       */
      const mockReq = {
        nextUrl: { pathname: '/profile', searchParams: new URLSearchParams() },
        method: 'GET',
        auth: null,
        url: 'http://localhost/profile',
        headers: new Headers({ 'user-agent': 'test-agent' })
      } as MockRequest

      mockGetServerSideIdentifier.mockResolvedValue('192.168.1.1')
      mockCreateAuditLog.mockResolvedValue({} as Awaited<ReturnType<typeof createAuditLog>>)

      await middleware(mockReq)

      expect(mockCreateAuditLog).toHaveBeenCalledWith({
        ipAddress: '192.168.1.1',
        userAgent: 'test-agent',
        action: AUDIT_ACTIONS.UNAUTHORIZED_ACCESS,
        details: {
          path: '/profile',
          method: 'GET',
          timestamp: expect.any(String)
        }
      })
    })

    it('should handle audit log errors gracefully', async () => {
      /**
       * When createAuditLog throws, the middleware should catch the error,
       * log it via logger.error (not console.error), and still return a
       * 401 response for the unauthorized API request.
       */
      const mockReq = {
        nextUrl: { pathname: '/api/tournaments', searchParams: new URLSearchParams() },
        method: 'POST',
        auth: null,
        url: 'http://localhost/api/tournaments',
        headers: new Headers({ 'user-agent': 'test-agent' })
      } as MockRequest

      mockGetServerSideIdentifier.mockResolvedValue('127.0.0.1')
      mockCreateAuditLog.mockRejectedValue(new Error('Database error'))

      const response = await middleware(mockReq)

      expect(response.status).toBe(401)
      /**
       * The source uses logger.error('Failed to log unauthorized access', ...)
       * which is the module-level logger from createLogger('proxy-middleware').
       */
      expect(mockLoggerInstance.error).toHaveBeenCalledWith(
        'Failed to log unauthorized access',
        expect.objectContaining({
          message: 'Database error',
        })
      )
    })
  })

  describe('Auth middleware - Security headers', () => {
    it('should set X-Frame-Options header', async () => {
      const mockReq = {
        nextUrl: { pathname: '/api/tournaments', searchParams: new URLSearchParams() },
        method: 'GET',
        auth: null,
        url: 'http://localhost/api/tournaments',
        headers: new Headers({ 'user-agent': 'test-agent' })
      } as MockRequest

      const response = await middleware(mockReq)

      expect(response.headers.get('X-Frame-Options')).toBe('DENY')
    })

    it('should set X-Content-Type-Options header', async () => {
      const mockReq = {
        nextUrl: { pathname: '/api/tournaments', searchParams: new URLSearchParams() },
        method: 'GET',
        auth: null,
        url: 'http://localhost/api/tournaments',
        headers: new Headers({ 'user-agent': 'test-agent' })
      } as MockRequest

      const response = await middleware(mockReq)

      expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff')
    })

    it('should set Referrer-Policy header', async () => {
      const mockReq = {
        nextUrl: { pathname: '/api/tournaments', searchParams: new URLSearchParams() },
        method: 'GET',
        auth: null,
        url: 'http://localhost/api/tournaments',
        headers: new Headers({ 'user-agent': 'test-agent' })
      } as MockRequest

      const response = await middleware(mockReq)

      expect(response.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin')
    })

    it('should set Permissions-Policy header', async () => {
      const mockReq = {
        nextUrl: { pathname: '/api/tournaments', searchParams: new URLSearchParams() },
        method: 'GET',
        auth: null,
        url: 'http://localhost/api/tournaments',
        headers: new Headers({ 'user-agent': 'test-agent' })
      } as MockRequest

      const response = await middleware(mockReq)

      expect(response.headers.get('Permissions-Policy')).toBe('camera=(), microphone=(), geolocation=()')
    })
  })

  describe('Auth middleware - CSP headers', () => {
    it('should set development CSP when NODE_ENV is not production', async () => {
      process.env.NODE_ENV = 'development'

      const mockReq = {
        nextUrl: { pathname: '/api/tournaments', searchParams: new URLSearchParams() },
        method: 'GET',
        auth: null,
        url: 'http://localhost/api/tournaments',
        headers: new Headers({ 'user-agent': 'test-agent' })
      } as MockRequest

      const response = await middleware(mockReq)
      const csp = response.headers.get('Content-Security-Policy')

      expect(csp).toContain("default-src 'self'")
      expect(csp).toContain("script-src 'self' 'unsafe-eval' 'unsafe-inline'")
      expect(csp).toContain("style-src 'self' 'unsafe-inline'")
      expect(csp).toContain("img-src 'self' data: blob:")
      expect(csp).toContain("connect-src 'self'")
      expect(csp).toContain("font-src 'self' data:")
      expect(csp).toContain("frame-ancestors 'none'")
    })

    it('should set production CSP when NODE_ENV is production', async () => {
      process.env.NODE_ENV = 'production'

      const mockReq = {
        nextUrl: { pathname: '/api/tournaments', searchParams: new URLSearchParams() },
        method: 'GET',
        auth: null,
        url: 'http://localhost/api/tournaments',
        headers: new Headers({ 'user-agent': 'test-agent' })
      } as MockRequest

      const response = await middleware(mockReq)
      const csp = response.headers.get('Content-Security-Policy')

      expect(csp).toContain("default-src 'self'")
      expect(csp).toContain(`script-src 'self' 'nonce-`)
      expect(csp).toContain("'strict-dynamic'")
      expect(csp).toContain('https://www.googletagmanager.com')
      expect(csp).toContain("style-src 'self' 'unsafe-inline' https://fonts.googleapis.com")
      expect(csp).toContain("font-src 'self' https://fonts.gstatic.com")
      expect(csp).toContain("img-src 'self' data: blob: https://www.google-analytics.com")
      expect(csp).toContain("connect-src 'self' https://api.github.com https://oauth2.googleapis.com")
      expect(csp).toContain("frame-src 'none'")
      expect(csp).toContain("object-src 'none'")
      expect(csp).toContain("base-uri 'self'")
      expect(csp).toContain("form-action 'self'")
      expect(csp).toContain("upgrade-insecure-requests")
    })
  })

  describe('Auth middleware - Edge cases', () => {
    it('should handle routes that are not protected', async () => {
      const mockReq = {
        nextUrl: { pathname: '/auth/signin', searchParams: new URLSearchParams() },
        method: 'GET',
        auth: null,
        url: 'http://localhost/auth/signin',
        headers: new Headers({ 'user-agent': 'test-agent' })
      } as MockRequest

      const response = await middleware(mockReq)

      expect(response.status).not.toBe(401)
      expect(response.status).not.toBe(307)
    })

    it('should handle API routes with GET method without authentication', async () => {
      const mockReq = {
        nextUrl: { pathname: '/api/players', searchParams: new URLSearchParams() },
        method: 'GET',
        auth: null,
        url: 'http://localhost/api/players',
        headers: new Headers({ 'user-agent': 'test-agent' })
      } as MockRequest

      const response = await middleware(mockReq)

      expect(response.status).not.toBe(401)
    })

    it('should handle missing user-agent header', async () => {
      /**
       * When no user-agent header is present, the source falls back to
       * 'unknown' in the audit log entry: `req.headers.get('user-agent') || 'unknown'`
       */
      const mockReq = {
        nextUrl: { pathname: '/api/tournaments', searchParams: new URLSearchParams() },
        method: 'POST',
        auth: null,
        url: 'http://localhost/api/tournaments',
        headers: new Headers({})
      } as MockRequest

      mockGetServerSideIdentifier.mockResolvedValue('127.0.0.1')
      mockCreateAuditLog.mockResolvedValue({} as Awaited<ReturnType<typeof createAuditLog>>)

      const response = await middleware(mockReq)

      expect(response.status).toBe(401)
      expect(mockCreateAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          userAgent: 'unknown'
        })
      )
    })

    it('should handle protected routes with nested paths', async () => {
      /**
       * /api/tournaments/123 starts with /api/tournaments, so POST
       * to this nested path should require authentication and return 401.
       */
      const mockReq = {
        nextUrl: { pathname: '/api/tournaments/123', searchParams: new URLSearchParams() },
        method: 'POST',
        auth: null,
        url: 'http://localhost/api/tournaments/123',
        headers: new Headers({ 'user-agent': 'test-agent' })
      } as MockRequest

      mockGetServerSideIdentifier.mockResolvedValue('127.0.0.1')
      mockCreateAuditLog.mockResolvedValue({} as Awaited<ReturnType<typeof createAuditLog>>)

      const response = await middleware(mockReq)

      expect(response.status).toBe(401)
    })

    it('should allow unauthenticated access to /tournaments/some-tournament (public frontend route)', async () => {
      /**
       * /tournaments/some-tournament is NOT a protected frontend route.
       * Only /profile is protected. Tournament pages are publicly viewable,
       * so this should pass through without redirect or 401.
       */
      const mockReq = {
        nextUrl: {
          pathname: '/tournaments/some-tournament',
          searchParams: new URLSearchParams()
        },
        method: 'GET',
        auth: null,
        url: 'http://localhost/tournaments/some-tournament',
        headers: new Headers({ 'user-agent': 'test-agent' })
      } as MockRequest

      const response = await middleware(mockReq)

      expect(response.status).not.toBe(307)
      expect(response.status).not.toBe(401)
    })
  })

  describe('Config export', () => {
    it('should export config with matcher', () => {
      expect(proxyModule.config).toBeDefined()
      expect(proxyModule.config.matcher).toBeInstanceOf(Array)
      expect(proxyModule.config.matcher).toContain('/api/:path*')
      expect(proxyModule.config.matcher).toContain('/auth/:path*')
      expect(proxyModule.config.matcher).toContain('/api/auth/:path*')
      expect(proxyModule.config.matcher).toContain('/players/:path*')
      expect(proxyModule.config.matcher).toContain('/profile/:path*')
      expect(proxyModule.config.matcher).toContain('/tournaments/:path*')
    })
  })
})
