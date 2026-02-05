/**
 * AuthHeader - Client component for authentication-aware header UI.
 *
 * Uses client-side useSession() to ensure the header's auth state
 * is always consistent with the SessionProvider that page components
 * also consume. Previously, the header used server-side session while
 * pages used client-side useSession(), causing a stale session bug
 * where signing out cleared the server cookie but left the client-side
 * SessionProvider cache intact — allowing admin operations to persist
 * after logout.
 *
 * The client-side signOut() from next-auth/react properly:
 * 1. Calls the NextAuth signout endpoint to clear the cookie
 * 2. Updates the SessionProvider cache to null
 * 3. Redirects to the home page with a clean session state
 */
'use client';

import { useSession, signOut } from 'next-auth/react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';

export function AuthHeader() {
  const { data: session, status } = useSession();
  const t = useTranslations('common');

  /* Show nothing during session loading to avoid flash of incorrect state */
  if (status === 'loading') {
    return <div className="w-20 h-5 bg-muted animate-pulse rounded" aria-hidden="true" />;
  }

  if (session) {
    return (
      <div className="flex items-center gap-4">
        <Link
          href="/profile"
          className="text-sm font-medium hover:underline text-foreground"
        >
          {/* Player accounts show nickname; admin/OAuth accounts show name or email */}
          {session.user?.userType === 'player'
            ? session.user?.nickname
            : session.user?.name || session.user?.email}
        </Link>
        <button
          onClick={() => signOut({ callbackUrl: '/' })}
          className="text-sm font-medium hover:underline text-destructive"
        >
          {t('signOut')}
        </button>
      </div>
    );
  }

  return (
    <Link
      href="/auth/signin"
      className="text-sm font-medium hover:underline"
    >
      {t('login')}
    </Link>
  );
}
