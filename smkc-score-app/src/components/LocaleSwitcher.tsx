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
      console.error('Locale switch failed:', error)
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
        relative inline-flex h-8 w-[72px] shrink-0 cursor-pointer items-center rounded-full 
        border-2 border-transparent transition-colors duration-200 ease-in-out
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2
        disabled:cursor-not-allowed disabled:opacity-50
        ${isJapanese ? 'bg-primary' : 'bg-muted/60 hover:bg-muted'}
      `}
    >
      {/* EN Label */}
      <span
        aria-hidden="true"
        className={`absolute left-2 text-[11px] font-semibold uppercase tracking-wider transition-all duration-200 ${
          isJapanese ? 'opacity-40 scale-90' : 'opacity-100 scale-100'
        }`}
      >
        EN
      </span>

      {/* Sliding thumb */}
      <span
        className={`pointer-events-none inline-block h-6 w-6 rounded-full bg-white shadow-md ring-0 transition-transform duration-200 ease-in-out ${
          isJapanese ? 'translate-x-[38px]' : 'translate-x-0.5'
        }`}
      />

      {/* JA Label */}
      <span
        aria-hidden="true"
        className={`absolute right-2 text-[11px] font-semibold uppercase tracking-wider transition-all duration-200 ${
          isJapanese ? 'opacity-100 scale-100' : 'opacity-40 scale-90'
        }`}
      >
        JA
      </span>
    </button>
  )
}
