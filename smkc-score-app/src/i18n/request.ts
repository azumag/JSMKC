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
import enLoadingOverlay from '../../messages/loading-overlay/en.json';
import jaLoadingOverlay from '../../messages/loading-overlay/ja.json';
import enLoadingSkeleton from '../../messages/loading-skeleton/en.json';
import jaLoadingSkeleton from '../../messages/loading-skeleton/ja.json';
import enMatchValidation from '../../messages/match-validation/en.json';
import jaMatchValidation from '../../messages/match-validation/ja.json';
import enTaPromotion from '../../messages/ta-promotion/en.json';
import jaTaPromotion from '../../messages/ta-promotion/ja.json';
import { type Locale, locales, defaultLocale, LOCALE_COOKIE } from './config';

const loadingOverlayMessages = {
  en: enLoadingOverlay,
  ja: jaLoadingOverlay,
} satisfies Record<Locale, typeof enLoadingOverlay>;

const loadingSkeletonMessages = {
  en: enLoadingSkeleton,
  ja: jaLoadingSkeleton,
} satisfies Record<Locale, typeof enLoadingSkeleton>;

const matchValidationMessages = {
  en: enMatchValidation,
  ja: jaMatchValidation,
} satisfies Record<Locale, typeof enMatchValidation>;

const taPromotionMessages = {
  en: enTaPromotion,
  ja: jaTaPromotion,
} satisfies Record<Locale, typeof enTaPromotion>;

async function loadMessages(locale: Locale) {
  const messages = (await import(`../../messages/${locale}.json`)).default;

  return {
    ...messages,
    loadingOverlay: loadingOverlayMessages[locale],
    loadingSkeleton: loadingSkeletonMessages[locale],
    match: {
      ...messages.match,
      ...matchValidationMessages[locale],
    },
    ta: {
      ...messages.ta,
      ...taPromotionMessages[locale],
    },
  };
}

export default getRequestConfig(async () => {
  /**
   * Step 1: Check for explicit user preference in cookie.
   * The cookie is set by the LocaleSwitcher component via /api/locale endpoint.
   */
  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get(LOCALE_COOKIE)?.value;

  if (cookieLocale && locales.includes(cookieLocale as Locale)) {
    const locale = cookieLocale as Locale;
    return {
      locale,
      messages: await loadMessages(locale),
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
    messages: await loadMessages(browserLocale),
  };
});
