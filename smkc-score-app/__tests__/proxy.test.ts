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
 * - Protected API routes: 401 for unauthenticated POST/PUT/DELETE,
 *   allowing unauthenticated GET requests to public API endpoints.
 * - Protected frontend routes: redirect to /auth/signin with callbackUrl
 *   for unauthenticated users accessing /profile.
 * - Public frontend routes: /players and /tournaments are publicly viewable.
 * - Security headers: X-Frame-Options (DENY), X-Content-Type-Options (nosniff),
 *   Referrer-Policy, Permissions-Policy.
 * - CSP headers: development CSP (unsafe-eval allowed), production CSP
 *   (nonce-based, strict-dynamic, external service allowlists).
 * - Graceful degradation: middleware try/catch returns NextResponse.next() on error.
 * - Config export: matcher patterns for route matching.
 */
// @ts-nocheck - This test file uses complex mock types that are difficult to type correctly
import { NextResponse, NextRequest } from 'next/server'

/**
 * Mock auth() as a standalone async function that returns a session or null.
 * The new middleware calls `const session = await auth()` instead of using
 * the auth() wrapper pattern.
 */
const mockAuth = jest.fn()
jest.mock('@/lib/auth', () => ({
  auth: (...args: unknown[]) => mockAuth(...args),
}))

interface MockRequest extends Partial<NextRequest> {
  auth?: { user: { id: string } } | null
}

describe('Proxy Middleware', () => {
  let middleware: (req: NextRequest) => Promise<NextResponse>
  let proxyModule: { default: typeof middleware; config: { matcher: string[] } }

  beforeAll(async () => {
    process.env.NODE_ENV = 'test'

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

    const proxy = await import('@/middleware')
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
      // auth() returns a session for authenticated users
      mockAuth.mockResolvedValue({ user: { id: 'user-1' } })

      const mockReq = {
        nextUrl: { pathname: '/api/tournaments', searchParams: new URLSearchParams() },
        method: 'POST',
        url: 'http://localhost/api/tournaments',
        headers: new Headers({ 'user-agent': 'test-agent' })
      } as MockRequest

      const response = await middleware(mockReq)

      expect(response.status).not.toBe(401)
    })

    it('should return 401 for unauthenticated access to protected API routes with POST', async () => {
      mockAuth.mockResolvedValue(null)

      const mockReq = {
        nextUrl: { pathname: '/api/tournaments', searchParams: new URLSearchParams() },
        method: 'POST',
        url: 'http://localhost/api/tournaments',
        headers: new Headers({ 'user-agent': 'test-agent' })
      } as MockRequest

      const response = await middleware(mockReq)

      expect(response.status).toBe(401)
      const data = await response.json()
      expect(data.success).toBe(false)
      expect(data.error).toBe('Unauthorized')
    })

    it('should return 401 for unauthenticated access to protected API routes with PUT', async () => {
      mockAuth.mockResolvedValue(null)

      const mockReq = {
        nextUrl: { pathname: '/api/players', searchParams: new URLSearchParams() },
        method: 'PUT',
        url: 'http://localhost/api/players',
        headers: new Headers({ 'user-agent': 'test-agent' })
      } as MockRequest

      const response = await middleware(mockReq)

      expect(response.status).toBe(401)
    })

    it('should return 401 for unauthenticated access to protected API routes with DELETE', async () => {
      mockAuth.mockResolvedValue(null)

      const mockReq = {
        nextUrl: { pathname: '/api/tournaments', searchParams: new URLSearchParams() },
        method: 'DELETE',
        url: 'http://localhost/api/tournaments',
        headers: new Headers({ 'user-agent': 'test-agent' })
      } as MockRequest

      const response = await middleware(mockReq)

      expect(response.status).toBe(401)
    })

    it('should allow unauthenticated GET requests to protected API routes', async () => {
      /**
       * GET requests to API routes are intentionally public so anyone
       * can view tournament and player data without logging in.
       * auth() should NOT be called for GET requests.
       */
      const mockReq = {
        nextUrl: { pathname: '/api/tournaments', searchParams: new URLSearchParams() },
        method: 'GET',
        url: 'http://localhost/api/tournaments',
        headers: new Headers({ 'user-agent': 'test-agent' })
      } as MockRequest

      const response = await middleware(mockReq)

      expect(response.status).not.toBe(401)
      // auth() should not be called for GET requests (performance optimization)
      expect(mockAuth).not.toHaveBeenCalled()
    })
  })

  describe('Auth middleware - Protected frontend routes', () => {
    it('should redirect unauthenticated users from /profile', async () => {
      mockAuth.mockResolvedValue(null)

      const mockReq = {
        nextUrl: {
          pathname: '/profile',
          searchParams: new URLSearchParams()
        },
        method: 'GET',
        url: 'http://localhost/profile',
        headers: new Headers({ 'user-agent': 'test-agent' })
      } as MockRequest

      const response = await middleware(mockReq)

      expect(response.status).toBe(307)
      expect(response.headers.get('location')).toContain('/auth/signin')
    })

    it('should include callbackUrl in redirect for /profile', async () => {
      mockAuth.mockResolvedValue(null)

      const mockReq = {
        nextUrl: {
          pathname: '/profile',
          searchParams: new URLSearchParams()
        },
        method: 'GET',
        url: 'http://localhost/profile',
        headers: new Headers({ 'user-agent': 'test-agent' })
      } as MockRequest

      const response = await middleware(mockReq)

      const location = response.headers.get('location')
      expect(location).toContain('/auth/signin')
      expect(location).toContain('callbackUrl=%2Fprofile')
    })

    it('should allow authenticated access to protected frontend routes', async () => {
      mockAuth.mockResolvedValue({ user: { id: 'user-1' } })

      const mockReq = {
        nextUrl: { pathname: '/profile', searchParams: new URLSearchParams() },
        method: 'GET',
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
        url: 'http://localhost/players',
        headers: new Headers({ 'user-agent': 'test-agent' })
      } as MockRequest

      const response = await middleware(mockReq)

      expect(response.status).not.toBe(307)
      expect(response.status).not.toBe(401)
    })

    it('should allow unauthenticated access to /tournaments (public route)', async () => {
      const mockReq = {
        nextUrl: {
          pathname: '/tournaments',
          searchParams: new URLSearchParams()
        },
        method: 'GET',
        url: 'http://localhost/tournaments',
        headers: new Headers({ 'user-agent': 'test-agent' })
      } as MockRequest

      const response = await middleware(mockReq)

      expect(response.status).not.toBe(307)
      expect(response.status).not.toBe(401)
    })
  })

  describe('Auth middleware - Graceful degradation', () => {
    it('should return NextResponse.next() when auth() throws', async () => {
      /**
       * The middleware wraps everything in try/catch. If auth() throws
       * (e.g., WASM engine failure on Workers), the middleware should
       * gracefully degrade rather than crashing the Worker.
       */
      mockAuth.mockRejectedValue(new Error('WASM engine failure'))

      const mockReq = {
        nextUrl: { pathname: '/api/tournaments', searchParams: new URLSearchParams() },
        method: 'POST',
        url: 'http://localhost/api/tournaments',
        headers: new Headers({ 'user-agent': 'test-agent' })
      } as MockRequest

      const response = await middleware(mockReq)

      // Should return 200 (NextResponse.next()) instead of crashing
      expect(response.status).toBe(200)
    })
  })

  describe('Auth middleware - Security headers', () => {
    it('should set X-Frame-Options header', async () => {
      const mockReq = {
        nextUrl: { pathname: '/api/tournaments', searchParams: new URLSearchParams() },
        method: 'GET',
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
      expect(csp).toContain("connect-src 'self'")
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
        url: 'http://localhost/api/players',
        headers: new Headers({ 'user-agent': 'test-agent' })
      } as MockRequest

      const response = await middleware(mockReq)

      expect(response.status).not.toBe(401)
    })

    it('should handle protected routes with nested paths', async () => {
      /**
       * /api/tournaments/123 starts with /api/tournaments, so POST
       * to this nested path should require authentication and return 401.
       */
      mockAuth.mockResolvedValue(null)

      const mockReq = {
        nextUrl: { pathname: '/api/tournaments/123', searchParams: new URLSearchParams() },
        method: 'POST',
        url: 'http://localhost/api/tournaments/123',
        headers: new Headers({ 'user-agent': 'test-agent' })
      } as MockRequest

      const response = await middleware(mockReq)

      expect(response.status).toBe(401)
    })

    it('should allow unauthenticated access to /tournaments/some-tournament (public frontend route)', async () => {
      /**
       * /tournaments/some-tournament is NOT a protected frontend route.
       * Only /profile is protected. Tournament pages are publicly viewable.
       */
      const mockReq = {
        nextUrl: {
          pathname: '/tournaments/some-tournament',
          searchParams: new URLSearchParams()
        },
        method: 'GET',
        url: 'http://localhost/tournaments/some-tournament',
        headers: new Headers({ 'user-agent': 'test-agent' })
      } as MockRequest

      const response = await middleware(mockReq)

      expect(response.status).not.toBe(307)
      expect(response.status).not.toBe(401)
    })
  })

  describe('Config export', () => {
    it('should export config with matcher excluding /api/auth/*', () => {
      /**
       * The matcher intentionally excludes /api/auth/* so NextAuth v5
       * can manage its own routes without interference.
       */
      expect(proxyModule.config).toBeDefined()
      expect(proxyModule.config.matcher).toBeInstanceOf(Array)
      expect(proxyModule.config.matcher).toContain('/api/players/:path*')
      expect(proxyModule.config.matcher).toContain('/api/tournaments/:path*')
      expect(proxyModule.config.matcher).toContain('/auth/:path*')
      expect(proxyModule.config.matcher).toContain('/players/:path*')
      expect(proxyModule.config.matcher).toContain('/profile/:path*')
      expect(proxyModule.config.matcher).toContain('/tournaments/:path*')
      // /api/auth/* must NOT be in the matcher — NextAuth manages its own routes
      expect(proxyModule.config.matcher).not.toContain('/api/auth/:path*')
      expect(proxyModule.config.matcher).not.toContain('/api/:path*')
    })
  })
})
