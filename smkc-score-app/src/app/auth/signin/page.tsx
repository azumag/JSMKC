/**
 * auth/signin/page.tsx - Sign In Page
 *
 * This page provides dual authentication paths for the JSMKC system:
 * 1. Player login: Nickname + password credentials authentication
 * 2. Admin login: Discord OAuth for tournament administrators
 *
 * Authentication architecture:
 * - Players are registered by admins and receive a temporary password.
 *   They log in with their nickname and password using the
 *   'player-credentials' NextAuth provider.
 * - Admins authenticate via Discord OAuth, which provides role-based
 *   access control. Only members of the jsmdc-org Discord server
 *   are granted admin privileges.
 *
 * UI design decisions:
 * - Player tab is shown by default (#131) because most users logging
 *   in during tournaments are players, not administrators.
 * - Japanese language is used for the login UI since this is primarily
 *   for the JSMKC (Japan SMK Championship) community.
 * - Discord brand colors (#5865F2) are used for the admin login button
 *   to provide familiar OAuth provider branding.
 *
 * The page is a client component because it uses:
 * - useRouter for post-login navigation
 * - signIn from next-auth/react for both credential and OAuth flows
 * - useState for form state and loading/error management
 */
'use client'

import { useState } from 'react'
import { signIn } from 'next-auth/react'
/* i18n: useTranslations hook for internationalized strings */
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useRouter } from 'next/navigation'
import { createLogger } from '@/lib/client-logger'

/**
 * Client-side logger for authentication events.
 * Captures login errors for debugging without exposing
 * sensitive credentials in log output.
 */
const logger = createLogger({ serviceName: 'auth-signin' })

/**
 * SignInPage - Dual-path authentication interface.
 *
 * Renders a tabbed card with player credential login and
 * admin Discord OAuth login. Handles form submission,
 * loading states, and error display for the player flow.
 */
export default function SignInPage() {
  const router = useRouter()
  /* i18n: 'auth' namespace for all authentication-related strings */
  const t = useTranslations('auth')

  /* Player login form state */
  const [playerForm, setPlayerForm] = useState({ nickname: '', password: '' })
  const [playerError, setPlayerError] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  /**
   * Handles player credential login form submission.
   * Uses NextAuth's signIn() with redirect: false to handle
   * errors locally rather than redirecting to an error page.
   * On success, navigates to the tournaments page.
   */
  const handlePlayerLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setPlayerError('')
    setIsLoading(true)

    try {
      const result = await signIn('player-credentials', {
        nickname: playerForm.nickname,
        password: playerForm.password,
        /* redirect: false allows client-side error handling */
        redirect: false,
      })

      if (result?.error) {
        /* Generic error message to avoid leaking auth details */
        setPlayerError(t('invalidCredentials'))
      } else if (result?.ok) {
        /* Navigate to tournaments page after successful login */
        router.push('/tournaments')
      }
    } catch (error) {
      /* Log structured error for debugging while showing generic message to user */
      const metadata = error instanceof Error ? { message: error.message, stack: error.stack } : { error };
      logger.error('Player login error', metadata)
      setPlayerError(t('loginError'))
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">{t('loginTitle')}</CardTitle>
          <CardDescription>
            {t('subtitle')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/*
           * Tab structure with player tab as default (#131).
           * During live tournaments, players need quick access to the
           * login form, so the player tab is shown first.
           */}
          <Tabs defaultValue="player" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="player">{t('playerTab')}</TabsTrigger>
              <TabsTrigger value="admin">{t('adminTab')}</TabsTrigger>
            </TabsList>

            {/* Player login tab: nickname + password credentials */}
            <TabsContent value="player" className="space-y-4">
              <form onSubmit={handlePlayerLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="nickname">{t('nickname')}</Label>
                  <Input
                    id="nickname"
                    type="text"
                    placeholder="your_nickname"
                    value={playerForm.nickname}
                    onChange={(e) => setPlayerForm({ ...playerForm, nickname: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">{t('password')}</Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="••••••••"
                    value={playerForm.password}
                    onChange={(e) => setPlayerForm({ ...playerForm, password: e.target.value })}
                    required
                  />
                </div>
                {/* Error message displayed below the form fields */}
                {playerError && (
                  <p className="text-sm text-red-600">{playerError}</p>
                )}
                <Button type="submit" className="w-full" size="lg" disabled={isLoading}>
                  {isLoading ? t('loggingIn') : t('loginButton')}
                </Button>
              </form>
              <p className="text-sm text-center text-muted-foreground">
                {t('playerLoginHelp')}
              </p>
            </TabsContent>

            {/*
             * Admin login tab: Discord OAuth.
             * Clicking the button initiates the OAuth flow via NextAuth,
             * redirecting to Discord for authentication and then back
             * to /tournaments on success.
             */}
            <TabsContent value="admin" className="space-y-4">
              <Button
                onClick={() => signIn('discord', { callbackUrl: '/tournaments' })}
                className="w-full bg-[#5865F2] hover:bg-[#4752C4]"
                size="lg"
              >
                <div className="flex items-center">
                  {/* Discord logo SVG for brand recognition */}
                  <svg className="mr-2 h-5 w-5" viewBox="0 0 127 96" xmlns="http://www.w3.org/2000/svg" fill="currentColor">
                    <path d="M107.7 8.07A105.15 105.15 0 0 0 81.47 0a.05.05 0 0 0-.03.02C79.6 4.39 77.4 8.78 75.87 12.5a96.51 96.51 0 0 0-24.8 0C49.53 8.78 47.33 4.39 45.47.02a.05.05 0 0 0-.03-.02A105.01 105.01 0 0 0 19.3 8.07.05.05 0 0 0 19.24 8.1c-26.9 40.5-34.33 80-30.8 119.2a.05.05 0 0 0 .02.04C7.66 128.5 35.8 135 63.8 135a.05.05 0 0 0 .04-.02l3.4-4.2a92.2 92.2 0 0 1-13.8-6.1.05.05 0 0 1 .01-.09 63.63 63.63 0 0 0 2.4-1.2.05.05 0 0 1 .05 0c26.9 12.3 56 12.3 82.9 0a.05.05 0 0 1 .05 0 62.4 62.4 0 0 0 2.4 1.2.05.05 0 0 1 0 .09 91.54 91.54 0 0 1-13.8 6.1l3.4 4.2a.05.05 0 0 0 .04.02c28-135 56.1-135 55.44-7.66a.05.05 0 0 0 .02-.04c3.54-39.2-3.9-78.7-30.8-119.2a.05.05 0 0 0-.06-.03ZM42.45 92.6c-5.8 0-10.6-5.3-10.6-11.8s4.7-11.8 10.6-11.8c5.8.1 10.6 5.3 10.6 11.8s-4.8 11.8-10.6 11.8Zm42.1 0c-5.8 0-10.6-5.3-10.6-11.8s4.7-11.8 10.6-11.8c5.8.1 10.6 5.3 10.6 11.8s-4.8 11.8-10.6 11.8Z" />
                  </svg>
                  {t('discordLogin')}
                </div>
              </Button>
              <p className="text-sm text-center text-muted-foreground">
                {t('adminLoginHelp')}
              </p>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  )
}
