/**
 * auth/error/page.tsx - Authentication Error Page
 *
 * This page handles and displays authentication errors from NextAuth.
 * It is shown when a credential or Discord authentication flow fails,
 * providing user-friendly error messages in Japanese.
 *
 * NextAuth redirects to this page with an `error` query parameter
 * containing a standardized error code. This page maps each code
 * to a human-readable Japanese error message.
 *
 * Supported error codes:
 * - OAuthSignin: Error during Discord provider redirect
 * - OAuthCallback: Error processing Discord callback
 * - OAuthCreateAccount: Failed to create account from OAuth data
 * - CredentialsSignin: Invalid nickname/password credentials
 * - EmailCreateAccount: Failed to create account from email
 * - NotWhitelisted: Discord user is not in ADMIN_DISCORD_IDS whitelist
 * - ServerError: Database or server error during sign-in processing
 * - Callback: Generic callback processing error
 * - SessionRequired: Attempted access without valid session
 * - Default: Catch-all for unrecognized error codes
 *
 * The page provides two navigation options:
 * 1. Retry login (back to sign-in page)
 * 2. Return to home page
 *
 * useSearchParams() requires a Suspense boundary (Next.js 16 requirement),
 * so the page is split into a wrapper (ErrorPage) and an inner component
 * (ErrorPageContent) that reads the query params.
 */
'use client'

import { Suspense } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
/* i18n: useTranslations hook for internationalized strings */
import { useTranslations } from 'next-intl'
import { AlertCircle } from 'lucide-react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'

/**
 * Maps NextAuth error codes to translated user-friendly messages.
 * Each error code corresponds to a specific failure point in the
 * authentication flow, helping users understand what went wrong.
 * Translation keys are defined in the 'auth' namespace of messages/*.json.
 *
 * @param error - The NextAuth error code string
 * @param t - Translation function from useTranslations('auth')
 * @returns Translated error description
 */
function getErrorMessage(error: string | null, t: (key: string) => string) {
  switch (error) {
    case 'OAuthSignin':
      return t('oauthSigninError')
    case 'OAuthCallback':
      return t('oauthCallbackError')
    case 'OAuthCreateAccount':
      return t('oauthCreateAccountError')
    case 'CredentialsSignin':
      return t('credentialsSigninError')
    case 'EmailCreateAccount':
      return t('emailCreateAccountError')
    case 'AccessDenied':
      /* Generic access denied — kept for backward compatibility. */
      return t('accessDeniedError')
    case 'NotWhitelisted':
      /* Discord user is not registered in ADMIN_DISCORD_IDS. */
      return t('notWhitelistedError')
    case 'ServerError':
      /* Database or server error during sign-in processing. */
      return t('serverError')
    case 'Callback':
      return t('callbackError')
    case 'SessionRequired':
      return t('sessionRequiredError')
    case 'Default':
      return t('genericAuthError')
    default:
      return t('unknownAuthError')
  }
}

/**
 * ErrorPageContent - Inner component that reads searchParams and renders
 * the error UI. Separated from ErrorPage so the Suspense boundary can
 * wrap the useSearchParams() call.
 */
function ErrorPageContent() {
  const searchParams = useSearchParams()
  const error = searchParams.get('error')
  /* i18n: 'auth' namespace for all authentication-related strings */
  const t = useTranslations('auth')

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          {/* Error title with alert icon in destructive (red) color */}
          <CardTitle className="text-2xl flex items-center justify-center text-destructive">
            <AlertCircle className="mr-2 h-6 w-6" />
            {t('errorTitle')}
          </CardTitle>
          <CardDescription>
            {getErrorMessage(error, t)}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Contextual help text for specific error types */}
          <div className="text-sm text-muted-foreground text-center">
            {error === 'AccessDenied' && (
              <p>{t('accessDeniedHelp')}</p>
            )}
            {error === 'NotWhitelisted' && (
              <p>{t('notWhitelistedHelp')}</p>
            )}
            {error === 'ServerError' && (
              <p>{t('serverErrorHelp')}</p>
            )}
          </div>
          {/* Recovery action buttons */}
          <div className="flex flex-col gap-2">
            <Button asChild>
              <Link href="/auth/signin">
                {t('retryLogin')}
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/">
                {t('goHome')}
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

/**
 * ErrorPage - Wraps ErrorPageContent in Suspense.
 * Next.js 16 requires a Suspense boundary around components using
 * useSearchParams() to avoid opting the entire page into client rendering.
 */
export default function ErrorPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Card className="w-full max-w-md">
          <CardContent className="p-8 text-center text-muted-foreground">
            Loading...
          </CardContent>
        </Card>
      </div>
    }>
      <ErrorPageContent />
    </Suspense>
  )
}
