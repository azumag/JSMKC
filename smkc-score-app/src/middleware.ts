/**
 * middleware.ts - Next.js Edge Middleware (Auth Gate + Security Headers)
 *
 * Uses Edge runtime for Cloudflare Workers compatibility.
 * Handles:
 * 1. Authentication enforcement for protected API and frontend routes
 * 2. Security header injection (CSP, X-Frame-Options, etc.)
 *
 * Route protection strategy:
 * - API routes: Only mutating methods (POST, PUT, DELETE) require authentication.
 *   GET requests are public so anyone can view players and tournaments.
 * - Frontend routes: Only /profile requires authentication.
 *
 * Important: auth() is only called for routes that actually need it, avoiding
 * unnecessary JWT processing on GET requests. This reduces CPU usage on
 * Cloudflare Workers where Prisma WASM + JWT verification are expensive.
 *
 * The entire middleware is wrapped in try/catch to prevent Worker crashes
 * (error code 1101) from propagating — a graceful fallback is better than
 * returning nothing and leaving the user with a broken page.
 */
import { NextResponse, type NextRequest } from 'next/server'
import { auth } from '@/lib/auth'

/** Edge runtime required for Cloudflare Workers deployment */
export const runtime = 'experimental-edge';

/**
 * Generates a cryptographically secure nonce string for CSP headers.
 * @returns Base64-encoded random nonce string (128-bit entropy)
 */
function generateNonce(): string {
  const array = new Uint8Array(16)
  crypto.getRandomValues(array)
  return btoa(String.fromCharCode(...array))
}

/**
 * Adds security headers (CSP, X-Frame-Options, etc.) to the response.
 * Extracted as a helper to keep the main middleware function focused.
 */
function addSecurityHeaders(response: NextResponse, nonce: string): void {
  if (process.env.NODE_ENV === 'production') {
    response.headers.set('Content-Security-Policy', [
      "default-src 'self'",
      `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https://www.googletagmanager.com`,
      `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`,
      `font-src 'self' https://fonts.gstatic.com`,
      `img-src 'self' data: blob: https://www.google-analytics.com`,
      `connect-src 'self'`,
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

  response.headers.set('X-Frame-Options', 'DENY')
  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
}

/**
 * Main middleware handler. Uses a regular function (not auth() wrapper)
 * so that JWT processing only happens for routes that actually need it.
 * This avoids burning CPU on Workers for every GET request.
 */
export default async function middleware(req: NextRequest) {
  try {
    const { pathname } = req.nextUrl
    const method = req.method || 'GET'

    const protectedApiRoutes = ['/api/tournaments', '/api/players']
    const protectedFrontendRoutes = ['/profile']
    const protectedMethods = ['POST', 'PUT', 'DELETE']

    const isProtectedApi = protectedApiRoutes.some(route => pathname.startsWith(route))
    const requiresAuthApi = isProtectedApi && protectedMethods.includes(method)
    const isProtectedFrontend = protectedFrontendRoutes.some(route => pathname.startsWith(route))
    const requiresAuth = requiresAuthApi || isProtectedFrontend

    // Only call auth() when the route actually requires authentication.
    // This avoids JWT verification overhead on every GET request.
    if (requiresAuth) {
      const session = await auth()
      if (!session) {
        if (isProtectedFrontend) {
          const signInUrl = new URL('/auth/signin', req.url)
          signInUrl.searchParams.set('callbackUrl', pathname)
          return NextResponse.redirect(signInUrl)
        }
        return new NextResponse(
          JSON.stringify({ success: false, error: 'Unauthorized' }),
          { status: 401, headers: { 'Content-Type': 'application/json' } }
        )
      }
    }

    // Generate nonce and add security headers
    const nonce = generateNonce()
    const requestHeaders = new Headers(req.headers)
    requestHeaders.set('x-nonce', nonce)

    const response = NextResponse.next({
      request: { headers: requestHeaders },
    })

    addSecurityHeaders(response, nonce)
    return response
  } catch {
    // Graceful degradation: if the middleware crashes (e.g., auth() throws
    // due to WASM engine failure on Workers), let the request through rather
    // than returning error code 1101. The route handler has its own auth
    // check and will enforce access control independently.
    return NextResponse.next()
  }
}

/**
 * Middleware route matcher configuration.
 *
 * IMPORTANT: /api/auth/* routes are intentionally excluded.
 * NextAuth v5 manages its own routes and running middleware on them
 * can interfere with signout cookie clearing.
 */
/**
 * Middleware route matcher.
 *
 * /api/auth/* is excluded — NextAuth manages its own routes.
 * /api/locale/* and /api/monitor/* are excluded — no auth needed, reduce overhead.
 */
export const config = {
  matcher: [
    '/',
    '/api/players/:path*',
    '/api/tournaments/:path*',
    '/auth/:path*',
    '/players/:path*',
    '/profile/:path*',
    '/tournaments/:path*',
  ]
}
