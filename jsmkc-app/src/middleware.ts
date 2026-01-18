import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { createAuditLog, AUDIT_ACTIONS } from '@/lib/audit-log'
import { getServerSideIdentifier } from '@/lib/rate-limit'

export default auth(async (req) => {
  const { pathname } = req.nextUrl
  const method = req.method || 'GET'

  // API routes that require authentication
  const protectedApiRoutes = [
    '/api/tournaments',
    '/api/players',
  ]

  // Actions that require authentication
  const protectedMethods = ['POST', 'PUT', 'DELETE']
  const isProtectedApi = protectedApiRoutes.some(route => pathname.startsWith(route))
  const requiresAuth = isProtectedApi && protectedMethods.includes(method)

  // Check authentication
  if (requiresAuth && !req.auth) {
    const ip = getServerSideIdentifier()
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

    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 401 }
    )
  }

  // Add security headers
  const response = NextResponse.next()

  // CSPヘッダー（開発環境では緩め、本番環境では厳格に設定）
  if (process.env.NODE_ENV === 'production') {
    // 本番環境: nonceまたはhashを使用した厳格なポリシー
    const nonce = crypto.randomBytes(16).toString('base64')
    response.headers.set('Content-Security-Policy', [
      "default-src 'self'",
      `script-src 'self' 'nonce-${nonce}'`,
      `style-src 'self' 'nonce-${nonce}'`,
      "img-src 'self' data: blob:",
      "connect-src 'self'",
      "font-src 'self' data:",
      "frame-ancestors 'none'",
    ].join('; '))
  } else {
    // 開発環境: shadcn/ui動作のための緩いポリシー（本番では使用しない）
    response.headers.set('Content-Security-Policy', [
      "default-src 'self'",
      "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "connect-src 'self'",
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
  matcher: ['/api/:path*', '/auth/:path*']
}