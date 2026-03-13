/**
 * LocaleSwitcher - Language toggle switch component for the navigation header.
 *
 * Provides a toggle switch to switch between English (EN) and Japanese (JA).
 * On click, it sends a POST request to /api/locale to persist the
 * user's preference in a cookie, then refreshes to apply the new locale.
 *
 * Toggle display:
 * - Left: EN (English)
 * - Right: JA (Japanese)
 */
'use client'

import { useLocale } from 'next-intl'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { toast } from 'sonner'
import { createLogger } from '@/lib/client-logger'

/** Client-side logger for error tracking */
const logger = createLogger({ serviceName: 'locale-switcher' })

/** Valid locale types supported by the application */
type Locale = 'en' | 'ja'

/** Validates that the locale is supported */
function isValidLocale(locale: string): locale is Locale {
  return locale === 'en' || locale === 'ja'
}

export function LocaleSwitcher() {
  const locale = useLocale()
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)

  // Guard against unexpected locale values
  const currentLocale: Locale = isValidLocale(locale) ? locale : 'en'
  const isJapanese = currentLocale === 'ja'

  /**
   * Switches the locale by setting the NEXT_LOCALE cookie via API,
   * then refreshing the page to apply the new locale server-side.
   * Shows toast notification on success or error.
   */
  const switchLocale = async () => {
    if (isLoading) return

    const newLocale: Locale = currentLocale === 'en' ? 'ja' : 'en'
    setIsLoading(true)

    try {
      const response = await fetch('/api/locale', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locale: newLocale }),
      })

      if (!response.ok) {
        throw new Error(`Failed to switch locale: ${response.status}`)
      }

      // Show success toast before refreshing
      toast.success(newLocale === 'ja' ? '日本語に切り替えました' : 'Switched to English')

      // Refresh the page to apply the new locale
      router.refresh()
    } catch (error) {
      logger.error('Locale switch failed:', { error })
      toast.error(newLocale === 'ja' ? '言語の切り替えに失敗しました' : 'Failed to switch language')
    } finally {
      setIsLoading(false)
    }
  }

  // Handle keyboard interaction (Enter or Space)
  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      switchLocale()
    }
  }

  return (
    <button
      type="button"
      role="switch"
      aria-checked={isJapanese}
      aria-label={isJapanese ? 'Switch to English' : '日本語に切り替え'}
      onClick={switchLocale}
      onKeyDown={handleKeyDown}
      disabled={isLoading}
      className={`
        relative inline-grid h-8 w-[74px] shrink-0 cursor-pointer grid-cols-2 items-center rounded-full p-1
        border border-transparent transition-colors duration-200 ease-in-out
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2
        disabled:cursor-not-allowed disabled:opacity-50
        ${isJapanese ? 'bg-primary' : 'bg-muted/60 hover:bg-muted'}
      `}
    >
      {/* Sliding thumb */}
      <span
        className={`pointer-events-none absolute inset-y-1 left-1 w-8 rounded-full bg-white shadow-md ring-0 transition-transform duration-200 ease-in-out ${
          isJapanese ? 'translate-x-[34px]' : 'translate-x-0'
        }`}
      />

      {/* EN Label – h-full fills the grid cell so flex items-center
         centres text within the full 24px inner height, avoiding the
         sub-pixel misalignment caused by leading-none in a small line box. */}
      <span
        aria-hidden="true"
        className={`relative z-10 flex h-full items-center justify-center text-[11px] font-semibold uppercase transition-colors duration-200 ${
          isJapanese ? 'text-primary-foreground/65' : 'text-foreground'
        }`}
      >
        EN
      </span>

      {/* JA Label – same h-full centering approach as EN */}
      <span
        aria-hidden="true"
        className={`relative z-10 flex h-full items-center justify-center text-[11px] font-semibold uppercase transition-colors duration-200 ${
          isJapanese ? 'text-foreground' : 'text-muted-foreground'
        }`}
      >
        JA
      </span>
    </button>
  )
}
