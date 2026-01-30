/**
 * proxy.ts - Next.js Middleware (Proxy/Auth Gate)
 *
 * This file serves as the application's middleware layer, handling:
 * 1. Authentication enforcement for protected API and frontend routes
 * 2. Security header injection (CSP, X-Frame-Options, etc.)
 * 3. Audit logging of unauthorized access attempts
 *
 * Route protection strategy:
 * - API routes: Only mutating methods (POST, PUT, DELETE) require authentication.
 *   GET requests are public so anyone can view players and tournaments.
 * - Frontend routes: Only /profile requires authentication.
 *   /players and /tournaments are publicly viewable for read access.
 *
 * Security headers:
 * - Production uses strict CSP with nonce-based script execution
 * - Development uses relaxed CSP to allow hot-reload and shadcn/ui inline styles
 */
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { createAuditLog, AUDIT_ACTIONS } from '@/lib/audit-log'
import { getServerSideIdentifier } from '@/lib/rate-limit'
import { createLogger } from '@/lib/logger'

/**
 * Module-level logger for middleware operations.
 * Uses 'proxy-middleware' as the service name for log filtering.
 */
const logger = createLogger('proxy-middleware')

/**
 * Generates a cryptographically secure nonce string for CSP headers.
 * The nonce is used in Content-Security-Policy to whitelist inline scripts
 * without resorting to 'unsafe-inline', providing XSS protection.
 *
 * @returns Base64-encoded random nonce string (128-bit entropy)
 */
function generateNonce(): string {
  const array = new Uint8Array(16)
  crypto.getRandomValues(array)
  return btoa(String.fromCharCode(...array))
}

/**
 * Main middleware handler, wrapped with NextAuth's `auth()` helper.
 * The `auth()` wrapper automatically populates `req.auth` with the
 * current session if one exists, enabling session-based access control.
 */
export default auth(async (req) => {
  const { pathname } = req.nextUrl
  const method = req.method || 'GET'

  /**
   * API routes that require authentication for mutating operations.
   * GET requests to these routes remain public so that tournament
   * and player data can be viewed without logging in.
   */
  const protectedApiRoutes = [
    '/api/tournaments',
    '/api/players',
  ]

  /**
   * Frontend routes that require authentication for all access.
   * /players and /tournaments are intentionally excluded because
   * they should be viewable (GET) by anyone without authentication.
   * Only /profile requires a logged-in user session.
   */
  const protectedFrontendRoutes = [
    '/profile',
  ]

  /**
   * Only mutating HTTP methods require authentication on API routes.
   * This allows unauthenticated users to browse player lists and
   * tournament data via GET requests.
   */
  const protectedMethods = ['POST', 'PUT', 'DELETE']
  const isProtectedApi = protectedApiRoutes.some(route => pathname.startsWith(route))
  const requiresAuthApi = isProtectedApi && protectedMethods.includes(method)

  const isProtectedFrontend = protectedFrontendRoutes.some(route => pathname.startsWith(route))
  const requiresAuth = requiresAuthApi || isProtectedFrontend

  /**
   * Authentication check: If the route requires auth and no session exists,
   * log the unauthorized attempt and return an appropriate response.
   * - Frontend routes: redirect to sign-in page with callbackUrl
   * - API routes: return 401 JSON response
   */
  if (requiresAuth && !req.auth) {
    const ip = await getServerSideIdentifier()
    const userAgent = req.headers.get('user-agent') || 'unknown'

    /* Record the unauthorized access attempt for security auditing */
    try {
      await createAuditLog({
        ipAddress: ip,
        userAgent,
        action: AUDIT_ACTIONS.UNAUTHORIZED_ACCESS,
        details: {
          path: pathname,
          method,
          timestamp: new Date().toISOString(),
        },
      })
    } catch (error) {
      logger.error('Failed to log unauthorized access', error instanceof Error ? { message: error.message, stack: error.stack } : { error })
    }

    /* Redirect browser-based frontend requests to the sign-in page */
    if (isProtectedFrontend) {
      const signInUrl = new URL('/auth/signin', req.url)
      signInUrl.searchParams.set('callbackUrl', pathname)
      return NextResponse.redirect(signInUrl)
    }

    /* Return structured JSON error for API route requests */
    return new NextResponse(
      JSON.stringify({ success: false, error: 'Unauthorized' }),
      {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      }
    )
  }

  /**
   * Generate a unique nonce for this request and attach it as a header.
   * The nonce is used in the CSP script-src directive to allow
   * specific inline scripts without opening up to XSS attacks.
   */
  const nonce = generateNonce()
  const requestHeaders = new Headers(req.headers)
  requestHeaders.set('x-nonce', nonce)

  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  })

  /**
   * Content-Security-Policy configuration.
   * - Production: Strict policy using nonce-based script execution
   *   and 'strict-dynamic' for trusted script chains. External
   *   resources (Google Fonts, Analytics, OAuth providers) are
   *   explicitly whitelisted.
   * - Development: Relaxed policy allowing 'unsafe-eval' and
   *   'unsafe-inline' which are required for Next.js hot-reload
   *   and shadcn/ui component styling during development.
   */
  if (process.env.NODE_ENV === 'production') {
    response.headers.set('Content-Security-Policy', [
      "default-src 'self'",
      `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https://www.googletagmanager.com`,
      `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`,
      `font-src 'self' https://fonts.gstatic.com`,
      `img-src 'self' data: blob: https://www.google-analytics.com`,
      `connect-src 'self' https://api.github.com https://oauth2.googleapis.com`,
      "frame-src 'none'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "upgrade-insecure-requests"
    ].join('; '))
  } else {
    response.headers.set('Content-Security-Policy', [
      "default-src 'self'",
      "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "connect-src 'self'",
      "font-src 'self' data:",
      "frame-ancestors 'none'",
    ].join('; '))
  }

  /**
   * Additional security headers to harden the application:
   * - X-Frame-Options: Prevents clickjacking by disallowing iframes
   * - X-Content-Type-Options: Prevents MIME-type sniffing attacks
   * - Referrer-Policy: Controls how much referrer info is sent
   * - Permissions-Policy: Disables unnecessary browser APIs
   */
  response.headers.set('X-Frame-Options', 'DENY')
  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')

  return response
})

/**
 * Middleware route matcher configuration.
 * Only these path patterns will trigger the middleware.
 * Static assets and Next.js internal routes are excluded
 * by not being listed here, improving performance.
 */
export const config = {
  matcher: [
    '/api/:path*',
    '/auth/:path*',
    '/api/auth/:path*',
    '/players/:path*',
    '/profile/:path*',
    '/tournaments/:path*',
  ]
}
