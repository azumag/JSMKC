/**
 * next-intl Server Request Configuration
 *
 * This module is loaded by next-intl's plugin to resolve the locale
 * and translation messages for each server-side request.
 *
 * Locale resolution priority:
 * 1. NEXT_LOCALE cookie — user's explicit preference from the locale switcher
 * 2. Accept-Language header — browser's language preference
 * 3. Default locale (English) — ultimate fallback
 */
import { getRequestConfig } from 'next-intl/server';
import { cookies, headers } from 'next/headers';
import { type Locale, locales, defaultLocale, LOCALE_COOKIE } from './config';

export default getRequestConfig(async () => {
  /**
   * Step 1: Check for explicit user preference in cookie.
   * The cookie is set by the LocaleSwitcher component via /api/locale endpoint.
   */
  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get(LOCALE_COOKIE)?.value;

  if (cookieLocale && locales.includes(cookieLocale as Locale)) {
    return {
      locale: cookieLocale,
      messages: (await import(`../../messages/${cookieLocale}.json`)).default,
    };
  }

  /**
   * Step 2: Detect language from browser's Accept-Language header.
   * Simple detection: if the header contains 'ja', use Japanese.
   * Otherwise fall back to the default locale (English).
   */
  const headerStore = await headers();
  const acceptLang = headerStore.get('accept-language') || '';
  const browserLocale: Locale = acceptLang.includes('ja') ? 'ja' : defaultLocale;

  return {
    locale: browserLocale,
    messages: (await import(`../../messages/${browserLocale}.json`)).default,
  };
});
