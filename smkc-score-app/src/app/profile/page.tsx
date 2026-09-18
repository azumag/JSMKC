/**
 * profile/page.tsx - User Profile Page
 *
 * Displays the current session and, when available, the player record
 * associated with the credential-based login.
 */
'use client';

import { useSession } from 'next-auth/react';
import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CardSkeleton } from '@/components/ui/loading-skeleton';
import { QrLoginDialog } from '@/components/players/qr-login-dialog';

interface Player {
  id: string;
  name: string;
  nickname: string;
  country?: string | null;
}

export default function ProfilePage() {
  const { data: session, status } = useSession();
  const t = useTranslations('profile');
  const tCommon = useTranslations('common');
  const playerId = session?.user?.playerId;

  const [loading, setLoading] = useState(true);
  const [player, setPlayer] = useState<Player | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchPlayer(currentPlayerId: string) {
      try {
        const res = await fetch(`/api/players/${currentPlayerId}`);
        if (cancelled) return;

        if (!res.ok) {
          setFetchError(tCommon('networkError'));
          return;
        }

        const json = await res.json();
        if (!cancelled) {
          setPlayer(json.data ?? json);
        }
      } catch {
        if (!cancelled) {
          setFetchError(tCommon('networkError'));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    // A session/player transition invalidates all previously loaded profile data.
    // The cleanup guard below also prevents an older request from restoring it.
    setPlayer(null);
    setFetchError(null);

    if (status === 'loading') {
      setLoading(true);
      return () => {
        cancelled = true;
      };
    }

    if (playerId) {
      setLoading(true);
      void fetchPlayer(playerId);
      return () => {
        cancelled = true;
      };
    }

    setLoading(false);
    return () => {
      cancelled = true;
    };
  }, [playerId, status, tCommon]);

  // Hide a record synchronously as soon as the active session points at a
  // different player, before the effect above has a chance to clear state.
  const currentPlayer = player?.id === playerId ? player : null;

  if (status === 'loading' || loading) {
    return (
      <div className="container max-w-2xl py-10 space-y-6">
        <div className="space-y-3">
          <div className="h-9 w-24 bg-muted animate-pulse rounded" />
        </div>
        <CardSkeleton />
        <CardSkeleton />
      </div>
    );
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
            <div className="capitalize">{session?.user?.role || 'player'}</div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('playerAssociation')}</CardTitle>
          <CardDescription>{t('playerSessionDescription')}</CardDescription>
        </CardHeader>
        <CardContent>
          {currentPlayer ? (
            <div className="space-y-3">
              <div className="grid grid-cols-[120px_1fr] gap-4">
                <div className="font-medium">{t('nicknameLabel')}</div>
                <div>{currentPlayer.nickname}</div>
                <div className="font-medium">{t('name')}</div>
                <div>{currentPlayer.name}</div>
                <div className="font-medium">{t('countryLabel')}</div>
                <div>{currentPlayer.country || '-'}</div>
              </div>
              <p className="text-sm text-muted-foreground">{t('canSubmitScores')}</p>
            </div>
          ) : fetchError ? (
            <p role="alert" className="text-sm text-destructive">
              {fetchError}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">{t('noPlayerSession')}</p>
          )}
        </CardContent>
      </Card>

      {currentPlayer && (
        <Card>
          <CardHeader>
            <CardTitle>{t('qrLoginCardTitle')}</CardTitle>
            <CardDescription>{t('qrLoginCardDescription')}</CardDescription>
          </CardHeader>
          <CardContent>
            <QrLoginDialog playerId={currentPlayer.id} playerNickname={currentPlayer.nickname} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}