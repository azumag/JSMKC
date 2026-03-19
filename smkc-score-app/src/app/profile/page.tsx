/**
 * profile/page.tsx - User Profile Page
 *
 * Displays the current session and, when available, the player record
 * associated with the credential-based login.
 */
"use client"

import { useSession } from "next-auth/react"
import { useState, useEffect } from "react"
import { useTranslations } from "next-intl"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { CardSkeleton } from "@/components/ui/loading-skeleton"

interface Player {
  id: string
  name: string
  nickname: string
  country?: string | null
}

export default function ProfilePage() {
  const { data: session, status } = useSession()
  const t = useTranslations('profile')

  const [loading, setLoading] = useState(true)
  const [player, setPlayer] = useState<Player | null>(null)
  const [fetchError, setFetchError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchPlayer(playerId: string) {
      try {
        const res = await fetch(`/api/players/${playerId}`)
        if (!res.ok) {
          /* Show specific error instead of silently failing to "No player session" */
          setFetchError(`Failed to load profile (HTTP ${res.status})`)
          return
        }

        const json = await res.json()
        setPlayer(json.data ?? json)
      } catch {
        setFetchError('Network error — please check your connection')
      } finally {
        setLoading(false)
      }
    }

    if (status === 'loading') {
      return
    }

    const playerId = session?.user?.playerId
    if (playerId) {
      fetchPlayer(playerId)
      return
    }

    setLoading(false)
  }, [session?.user?.playerId, status])

  if (loading) {
    return (
      <div className="container max-w-2xl py-10 space-y-6">
        <div className="space-y-3">
          <div className="h-9 w-24 bg-muted animate-pulse rounded" />
        </div>
        <CardSkeleton />
        <CardSkeleton />
      </div>
    )
  }

  return (
    <div className="container max-w-2xl py-10 space-y-8">
      <h1 className="text-3xl font-bold">{t('title')}</h1>

      <Card>
        <CardHeader>
          <CardTitle>{t('userInfo')}</CardTitle>
          <CardDescription>{t('sessionDescription')}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-[100px_1fr] gap-4">
            <div className="font-medium">{t('name')}</div>
            <div>{session?.user?.name}</div>
            <div className="font-medium">{t('email')}</div>
            <div>{session?.user?.email}</div>
            <div className="font-medium">{t('role')}</div>
            <div className="capitalize">{session?.user?.role || "player"}</div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('playerAssociation')}</CardTitle>
          <CardDescription>{t('playerSessionDescription')}</CardDescription>
        </CardHeader>
        <CardContent>
          {player ? (
            <div className="space-y-3">
              <div className="grid grid-cols-[120px_1fr] gap-4">
                <div className="font-medium">{t('nicknameLabel')}</div>
                <div>{player.nickname}</div>
                <div className="font-medium">{t('name')}</div>
                <div>{player.name}</div>
                <div className="font-medium">{t('countryLabel')}</div>
                <div>{player.country || '-'}</div>
              </div>
              <p className="text-sm text-muted-foreground">{t('canSubmitScores')}</p>
            </div>
          ) : fetchError ? (
            <p className="text-sm text-destructive">{fetchError}</p>
          ) : (
            <p className="text-sm text-muted-foreground">{t('noPlayerSession')}</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
