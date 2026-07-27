/**
 * auth/qr-login/page.tsx - QR One-Scan Login (issue #3055)
 *
 * Landing page for a scanned player QR code. The QR code encodes a URL to
 * this page with a `token` query parameter; on load, the page exchanges
 * that token for a player session via the `player-qr-login` NextAuth
 * credentials provider (see src/lib/auth.ts) and redirects on success.
 *
 * The token is a bearer credential (equivalent to a password), so it is
 * stripped from the visible URL/history immediately via
 * history.replaceState — it is only ever read once, in memory, before the
 * sign-in call.
 *
 * useSearchParams() requires a Suspense boundary (Next.js 16 requirement),
 * so the page is split into a wrapper (QrLoginPage) and an inner component
 * (QrLoginContent) that reads the query params.
 */
'use client';

import { Suspense, useEffect, useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { AlertCircle, Loader2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { createLogger } from '@/lib/client-logger';

const logger = createLogger({ serviceName: 'auth-qr-login' });

type QrLoginStatus = 'pending' | 'error' | 'missingToken';

function QrLoginContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const t = useTranslations('auth');
  const [status, setStatus] = useState<QrLoginStatus>('pending');

  useEffect(() => {
    const token = searchParams.get('token');

    // The token is a bearer credential embedded in the scanned QR code.
    // Remove it from the visible URL/history right away — it has already
    // been captured above and is only needed once, for the signIn() call.
    if (typeof window !== 'undefined') {
      window.history.replaceState(null, '', '/auth/qr-login');
    }

    if (!token) {
      setStatus('missingToken');
      return;
    }

    let cancelled = false;

    signIn('player-qr-login', { token, redirect: false })
      .then((result) => {
        if (cancelled) return;
        if (result?.ok) {
          router.push('/tournaments');
        } else {
          setStatus('error');
        }
      })
      .catch((error) => {
        if (cancelled) return;
        const metadata = error instanceof Error ? { message: error.message } : { error };
        logger.error('QR login error', metadata);
        setStatus('error');
      });

    return () => {
      cancelled = true;
    };
    // Runs once on mount: the token is consumed a single time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (status === 'pending') {
    return (
      <Card className="w-full max-w-md">
        <CardContent className="py-12 text-center space-y-4">
          <Loader2 className="h-8 w-8 mx-auto animate-spin text-muted-foreground" />
          <p className="text-muted-foreground">{t('qrLoginInProgress')}</p>
        </CardContent>
      </Card>
    );
  }

  const description = status === 'missingToken' ? t('qrLoginMissingToken') : t('qrLoginInvalid');

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="text-center">
        <CardTitle className="text-2xl flex items-center justify-center text-destructive">
          <AlertCircle className="mr-2 h-6 w-6" />
          {t('qrLoginErrorTitle')}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <Button asChild className="w-full">
          <Link href="/auth/signin">{t('retryLogin')}</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

export default function QrLoginPage() {
  return (
    <div className="min-h-[calc(100vh-12rem)] flex items-center justify-center">
      <Suspense
        fallback={
          <Card className="w-full max-w-md">
            <CardContent className="py-12 text-center text-muted-foreground">Loading...</CardContent>
          </Card>
        }
      >
        <QrLoginContent />
      </Suspense>
    </div>
  );
}
