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
import enBroadcast from '../../messages/broadcast/en.json';
import jaBroadcast from '../../messages/broadcast/ja.json';
import enDebugFill from '../../messages/debug-fill/en.json';
import jaDebugFill from '../../messages/debug-fill/ja.json';
import enGpCupAssignment from '../../messages/gp-cup-assignment/en.json';
import jaGpCupAssignment from '../../messages/gp-cup-assignment/ja.json';
import enLoadingOverlay from '../../messages/loading-overlay/en.json';
import jaLoadingOverlay from '../../messages/loading-overlay/ja.json';
import enLoadingSkeleton from '../../messages/loading-skeleton/en.json';
import jaLoadingSkeleton from '../../messages/loading-skeleton/ja.json';
import enLoadingSpinner from '../../messages/loading-spinner/en.json';
import jaLoadingSpinner from '../../messages/loading-spinner/ja.json';
import enLocaleSwitcher from '../../messages/locale-switcher/en.json';
import jaLocaleSwitcher from '../../messages/locale-switcher/ja.json';
import enMatchValidation from '../../messages/match-validation/en.json';
import jaMatchValidation from '../../messages/match-validation/ja.json';
import enRankCell from '../../messages/rank-cell/en.json';
import jaRankCell from '../../messages/rank-cell/ja.json';
import enTaPromotion from '../../messages/ta-promotion/en.json';
import jaTaPromotion from '../../messages/ta-promotion/ja.json';
import enTournamentLayout from '../../messages/tournament-layout/en.json';
import jaTournamentLayout from '../../messages/tournament-layout/ja.json';
import enUpdateIndicator from '../../messages/update-indicator/en.json';
import jaUpdateIndicator from '../../messages/update-indicator/ja.json';
import { type Locale, locales, defaultLocale, LOCALE_COOKIE } from './config';

const broadcastMessages = {
  en: enBroadcast,
  ja: jaBroadcast,
} satisfies Record<Locale, typeof enBroadcast>;

const debugFillMessages = {
  en: enDebugFill,
  ja: jaDebugFill,
} satisfies Record<Locale, typeof enDebugFill>;

const gpCupAssignmentMessages = {
  en: enGpCupAssignment,
  ja: jaGpCupAssignment,
} satisfies Record<Locale, typeof enGpCupAssignment>;

const loadingOverlayMessages = {
  en: enLoadingOverlay,
  ja: jaLoadingOverlay,
} satisfies Record<Locale, typeof enLoadingOverlay>;

const loadingSkeletonMessages = {
  en: enLoadingSkeleton,
  ja: jaLoadingSkeleton,
} satisfies Record<Locale, typeof enLoadingSkeleton>;

const loadingSpinnerMessages = {
  en: enLoadingSpinner,
  ja: jaLoadingSpinner,
} satisfies Record<Locale, typeof enLoadingSpinner>;

const localeSwitcherMessages = {
  en: enLocaleSwitcher,
  ja: jaLocaleSwitcher,
} satisfies Record<Locale, typeof enLocaleSwitcher>;

const matchValidationMessages = {
  en: enMatchValidation,
  ja: jaMatchValidation,
} satisfies Record<Locale, typeof enMatchValidation>;

const rankCellMessages = {
  en: enRankCell,
  ja: jaRankCell,
} satisfies Record<Locale, typeof enRankCell>;

const taPromotionMessages = {
  en: enTaPromotion,
  ja: jaTaPromotion,
} satisfies Record<Locale, typeof enTaPromotion>;

const tournamentLayoutMessages = {
  en: enTournamentLayout,
  ja: jaTournamentLayout,
} satisfies Record<Locale, typeof enTournamentLayout>;

const updateIndicatorMessages = {
  en: enUpdateIndicator,
  ja: jaUpdateIndicator,
} satisfies Record<Locale, typeof enUpdateIndicator>;

async function loadMessages(locale: Locale) {
  const messages = (await import(`../../messages/${locale}.json`)).default;

  return {
    ...messages,
    broadcast: broadcastMessages[locale],
    debugFill: debugFillMessages[locale],
    gpCupAssignment: {
      cupDetailsResolution: messages.finals.cupDetailsResolution,
      keepCupDetails: messages.finals.keepCupDetails,
      clearCupDetails: messages.finals.clearCupDetails,
      cancelCupChange: messages.finals.cancelCupChange,
      ...gpCupAssignmentMessages[locale],
    },
    loadingOverlay: loadingOverlayMessages[locale],
    loadingSkeleton: loadingSkeletonMessages[locale],
    loadingSpinner: loadingSpinnerMessages[locale],
    localeSwitcher: localeSwitcherMessages[locale],
    rankCell: rankCellMessages[locale],
    tournamentLayout: tournamentLayoutMessages[locale],
    updateIndicator: updateIndicatorMessages[locale],
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
