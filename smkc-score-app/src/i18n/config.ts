/**
 * i18n Configuration Constants
 *
 * Defines the supported locales and default locale for the application.
 * Language is determined by:
 * 1. User preference stored in NEXT_LOCALE cookie (set via locale switcher)
 * 2. Browser Accept-Language header as fallback
 *
 * No URL-based locale routing is used — all URLs remain locale-free.
 */

/** Supported locale identifiers */
export const locales = ['en', 'ja'] as const;

/** Type-safe locale type derived from the locales array */
export type Locale = (typeof locales)[number];

/** Default locale used when no preference is detected */
export const defaultLocale: Locale = 'en';

/** Cookie name for persisting the user's locale preference */
export const LOCALE_COOKIE = 'NEXT_LOCALE';
