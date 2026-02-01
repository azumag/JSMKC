/**
 * auth/error/page.tsx - Authentication Error Page
 *
 * This page handles and displays authentication errors from NextAuth.
 * It is shown when an OAuth or credential authentication flow fails,
 * providing user-friendly error messages in Japanese.
 *
 * NextAuth redirects to this page with an `error` query parameter
 * containing a standardized error code. This page maps each code
 * to a human-readable Japanese error message.
 *
 * Supported error codes:
 * - OAuthSignin: Error during OAuth provider redirect
 * - OAuthCallback: Error processing OAuth callback
 * - OAuthCreateAccount: Failed to create account from OAuth data
 * - EmailCreateAccount: Failed to create account from email
 * - Callback: Generic callback processing error
 * - OAuthAccountNotLinked: Email already linked to another provider
 * - SessionRequired: Attempted access without valid session
 * - Default: Catch-all for unrecognized error codes
 *
 * The page provides two navigation options:
 * 1. Retry login (back to sign-in page)
 * 2. Return to home page
 */
'use client'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { AlertCircle } from 'lucide-react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'

/**
 * ErrorPage - Displays authentication error with recovery options.
 *
 * Retrieves the error code using useSearchParams() hook from NextAuth's error
 * redirect flow. Maps the code to a Japanese error message and
 * shows contextual help for specific error types.
 */
export default function ErrorPage() {
  const searchParams = useSearchParams()
  const error = searchParams.get('error')

  /**
   * Maps NextAuth error codes to Japanese user-friendly messages.
   * Each error code corresponds to a specific failure point in the
   * authentication flow, helping users understand what went wrong.
   *
   * @param error - The NextAuth error code string
   * @returns Human-readable error description in Japanese
   */
  const getErrorMessage = (error: string | null) => {
    switch (error) {
      case 'OAuthSignin':
        return 'OAuthサインインでエラーが発生しました。'
      case 'OAuthCallback':
        return 'OAuthコールバックでエラーが発生しました。'
      case 'OAuthCreateAccount':
        return 'アカウント作成でエラーが発生しました。'
      case 'EmailCreateAccount':
        return 'メールアドレスでのアカウント作成でエラーが発生しました。'
      case 'Callback':
        return 'コールバックでエラーが発生しました。'
      case 'OAuthAccountNotLinked':
        /* This occurs when the user's email is already associated with
         * a different OAuth provider (e.g., logged in with GitHub before,
         * now trying Discord with the same email address). */
        return 'このメールアドレスは既に他のプロバイダーにリンクされています。'
      case 'SessionRequired':
        return 'この操作にはセッションが必要です。'
      case 'Default':
        return '認証でエラーが発生しました。'
      default:
        return '認証で不明なエラーが発生しました。'
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          {/* Error title with alert icon in destructive (red) color */}
          <CardTitle className="text-2xl flex items-center justify-center text-destructive">
            <AlertCircle className="mr-2 h-6 w-6" />
            認証エラー
          </CardTitle>
          <CardDescription>
            {getErrorMessage(error)}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/*
           * Contextual help text for the OAuthAccountNotLinked error.
           * This specific error commonly occurs when users try to log in
           * with a different provider than the one they originally used.
           * The message reminds them to verify their jsmdc-org membership.
           */}
          <div className="text-sm text-muted-foreground text-center">
            {error === 'OAuthAccountNotLinked' && (
              <p>
                jsmdc-orgのメンバーであることを確認してください。
              </p>
            )}
          </div>
          {/* Recovery action buttons */}
          <div className="flex flex-col gap-2">
            <Button asChild>
              <Link href="/auth/signin">
                再度ログイン
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/">
                トップページに戻る
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
