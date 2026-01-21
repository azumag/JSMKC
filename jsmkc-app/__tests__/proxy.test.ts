import { NextResponse, NextRequest } from 'next/server'
import { createAuditLog, AUDIT_ACTIONS } from '@/lib/audit-log'
import { getServerSideIdentifier } from '@/lib/rate-limit'
import { auth as authLib } from '@/lib/auth'

jest.mock('@/lib/auth')
jest.mock('@/lib/audit-log')
jest.mock('@/lib/rate-limit')

const mockCreateAuditLog = createAuditLog as jest.MockedFunction<typeof createAuditLog>
const mockGetServerSideIdentifier = getServerSideIdentifier as jest.MockedFunction<typeof getServerSideIdentifier>

interface MockRequest extends Partial<NextRequest> {
  auth?: { user: { id: string } } | null
}

describe('Proxy Middleware', () => {
  let middleware: (req: NextRequest) => Promise<NextResponse>
  let proxyModule: { default: typeof middleware; config: { matcher: string[] } }

  beforeAll(async () => {
    jest.clearAllMocks()
    process.env.NODE_ENV = 'test'

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
      
      expect(response).toBeInstanceOf(NextResponse)
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
      const mockReq = {
        nextUrl: { pathname: '/api/tournaments', searchParams: new URLSearchParams() },
        method: 'GET',
        auth: null,
        url: 'http://localhost/api/tournaments',
        headers: new Headers({ 'user-agent': 'test-agent' })
      } as MockRequest

      const response = await middleware(mockReq)

      expect(response).toBeInstanceOf(NextResponse)
      expect(response.status).not.toBe(401)
    })
  })

  describe('Auth middleware - Protected frontend routes', () => {
    it('should redirect unauthenticated users from protected frontend routes', async () => {
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

      mockGetServerSideIdentifier.mockResolvedValue('127.0.0.1')
      mockCreateAuditLog.mockResolvedValue({} as Awaited<ReturnType<typeof createAuditLog>>)

      const response = await middleware(mockReq)
      
      expect(response.status).toBe(307)
      expect(response.headers.get('location')).toContain('/auth/signin')
    })

    it('should include callbackUrl in redirect', async () => {
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

      mockGetServerSideIdentifier.mockResolvedValue('127.0.0.1')
      mockCreateAuditLog.mockResolvedValue({} as Awaited<ReturnType<typeof createAuditLog>>)

      const response = await middleware(mockReq)
      
      const location = response.headers.get('location')
      expect(location).toContain('/auth/signin')
      expect(location).toContain('callbackUrl=%2Ftournaments')
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
      
      expect(response).toBeInstanceOf(NextResponse)
      expect(response.status).not.toBe(307)
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
      const mockReq = {
        nextUrl: { pathname: '/players', searchParams: new URLSearchParams() },
        method: 'GET',
        auth: null,
        url: 'http://localhost/players',
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
          path: '/players',
          method: 'GET',
          timestamp: expect.any(String)
        }
      })
    })

    it('should handle audit log errors gracefully', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation()

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
      expect(consoleSpy).toHaveBeenCalledWith('Failed to log unauthorized access:', expect.any(Error))
      consoleSpy.mockRestore()
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

      expect(response).toBeInstanceOf(NextResponse)
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

      expect(response).toBeInstanceOf(NextResponse)
      expect(response.status).not.toBe(401)
    })

    it('should handle missing user-agent header', async () => {
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

    it('should handle protected frontend routes with nested paths', async () => {
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

      mockGetServerSideIdentifier.mockResolvedValue('127.0.0.1')
      mockCreateAuditLog.mockResolvedValue({} as Awaited<ReturnType<typeof createAuditLog>>)

      const response = await middleware(mockReq)
      
      expect(response.status).toBe(307)
      expect(response.headers.get('location')).toContain('/auth/signin')
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
