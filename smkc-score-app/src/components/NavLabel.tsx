/**
 * NavLabel - Client component for translated navigation labels.
 *
 * Used by the root layout (Server Component) to render translated
 * nav strings. The layout cannot use useTranslations() directly
 * because it's a Server Component, so this thin client wrapper
 * accesses the 'common' namespace translations.
 */
'use client'

import { useTranslations } from 'next-intl'

export function NavLabelClient({ messageKey }: { messageKey: string }) {
  const t = useTranslations('common')
  return <>{t(messageKey)}</>
}
