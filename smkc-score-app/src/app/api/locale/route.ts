/**
 * Locale Switching API Route
 *
 * POST /api/locale — Sets the user's locale preference cookie.
 *
 * Request body: { locale: "en" | "ja" }
 *
 * This endpoint is called by the LocaleSwitcher component when the
 * user toggles between languages. The cookie is then read by
 * src/i18n/request.ts on subsequent server-side renders to determine
 * which translation messages to load.
 *
 * The cookie is set with a 1-year expiry and path "/" so it applies
 * to all routes in the application.
 */
import { NextResponse } from 'next/server'
import { locales, LOCALE_COOKIE, type Locale } from '@/i18n/config'

export async function POST(request: Request) {
  const body = await request.json()
  const { locale } = body

  /* Validate that the requested locale is supported */
  if (!locale || !locales.includes(locale as Locale)) {
    return NextResponse.json(
      { error: 'Invalid locale' },
      { status: 400 }
    )
  }

  const response = NextResponse.json({ success: true })

  /**
   * Set the NEXT_LOCALE cookie with a 1-year expiry.
   * This cookie is read by src/i18n/request.ts to determine
   * the user's preferred locale on each server request.
   */
  response.cookies.set(LOCALE_COOKIE, locale, {
    path: '/',
    maxAge: 60 * 60 * 24 * 365, // 1 year
    sameSite: 'lax',
  })

  return response
}
