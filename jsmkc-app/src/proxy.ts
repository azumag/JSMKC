import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { createAuditLog, AUDIT_ACTIONS } from '@/lib/audit-log'
import { getServerSideIdentifier } from '@/lib/rate-limit'

function generateNonce(): string {
  const array = new Uint8Array(16)
  crypto.getRandomValues(array)
  return btoa(String.fromCharCode(...array))
}

export default auth(async (req) => {
  const { pathname } = req.nextUrl
  const method = req.method || 'GET'

  // API routes that require authentication
  const protectedApiRoutes = [
    '/api/tournaments',
    '/api/players',
  ]

  // Frontend routes that require authentication
  const protectedFrontendRoutes = [
    '/players',
    '/profile',
    '/tournaments',
  ]

  // Actions that require authentication
  const protectedMethods = ['POST', 'PUT', 'DELETE']
  const isProtectedApi = protectedApiRoutes.some(route => pathname.startsWith(route))
  const requiresAuthApi = isProtectedApi && protectedMethods.includes(method)
  
  const isProtectedFrontend = protectedFrontendRoutes.some(route => pathname.startsWith(route))
  const requiresAuth = requiresAuthApi || isProtectedFrontend

  // Check authentication
  if (requiresAuth && !req.auth) {
    const ip = await getServerSideIdentifier()
    const userAgent = req.headers.get('user-agent') || 'unknown'

    // Log unauthorized access attempt
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
      console.error('Failed to log unauthorized access:', error)
    }

    // Redirect to sign-in for frontend routes, return 401 for API routes
    if (isProtectedFrontend) {
      const signInUrl = new URL('/auth/signin', req.url)
      signInUrl.searchParams.set('callbackUrl', pathname)
      return NextResponse.redirect(signInUrl)
    }

    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 401 }
    )
  }

  // Add security headers
  const nonce = generateNonce()
  const requestHeaders = new Headers(req.headers)
  requestHeaders.set('x-nonce', nonce)

  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  })

  // CSPヘッダー（開発環境では緩め、本番環境では厳格に設定）
  if (process.env.NODE_ENV === 'production') {
    // 本番環境: nonceまたはhashを使用した厳格なポリシー
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
    // 開発環境: shadcn/ui動作のための緩いポリシー（本番では使用しない）
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

  // X-Frame-Options
  response.headers.set('X-Frame-Options', 'DENY')

  // X-Content-Type-Options
  response.headers.set('X-Content-Type-Options', 'nosniff')

  // Referrer-Policy
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')

  // Permissions-Policy
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')

  return response
})

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