/**
 * Tournament Detail Layout
 *
 * Shared layout for all tournament sub-pages (/tournaments/[id]/*).
 * Provides the tournament header, lifecycle controls, mode navigation,
 * export actions, and a link back to the tournament list.
 *
 * TA battle royale tournaments are intentionally TA-only. Their navigation
 * omits BM, MR, GP, and Overall for every role, including administrators.
 */
'use client';

import { fetchWithRetry } from '@/lib/fetch-with-retry';
import { useState, useEffect, useCallback, useRef, use } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ExportButton } from '@/components/tournament/export-button';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { createLogger } from '@/lib/client-logger';
import { cn } from '@/lib/utils';
import { getTabHydrationGuardProps } from '@/lib/tournament-tab-hydration';
import { TaModeBadge } from '@/components/tournament/ta-mode-badge';
import {
  canUpdateTournamentStatus,
  isUserFacingTournamentStatusUpdateError,
  parseTournamentStatusUpdateResponse,
} from '@/lib/tournament-status-update';

const logger = createLogger({ serviceName: 'tournaments-layout' });

type TournamentFetchFailure = 'not-found' | 'network';

interface Tournament {
  id: string;
  name: string;
  date: string;
  status: string;
  publicModes: string[];
  taBattleRoyaleMode: boolean;
  archived?: boolean;
}

const TABS = [
  { href: 'ta', labelKey: 'timeTrial' },
  { href: 'bm', labelKey: 'battleMode' },
  { href: 'mr', labelKey: 'matchRace' },
  { href: 'gp', labelKey: 'grandPrix' },
  { href: 'overall-ranking', labelKey: 'overall', publicMode: 'overall' },
] as const;

const ADMIN_TABS = [{ href: 'broadcast', labelKey: 'broadcastManagement' }] as const;

function isMinimalPage(pathname: string): boolean {
  return pathname.includes('/participant') || pathname.includes('/match/') || pathname.includes('/overlay');
}

function getActiveTab(pathname: string): string {
  if (pathname.includes('/overall-ranking')) return 'overall-ranking';
  if (pathname.includes('/broadcast')) return 'broadcast';
  for (const tab of TABS) {
    if (tab.href !== 'overall-ranking' && pathname.includes(`/${tab.href}`)) {
      return tab.href;
    }
  }
  return '';
}

export default function TournamentLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const pathname = usePathname();
  const { data: session } = useSession();
  const t = useTranslations('tournaments');
  const tc = useTranslations('common');
  const tLayout = useTranslations('tournamentLayout');
  const isAdmin = session?.user && session.user.role === 'admin';

  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchInFlight, setFetchInFlight] = useState(true);
  const [fetchFailure, setFetchFailure] = useState<TournamentFetchFailure | null>(null);
  const [tabsHydrated, setTabsHydrated] = useState(false);
  const [statusUpdating, setStatusUpdating] = useState(false);
  const statusUpdateInFlightRef = useRef(false);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  const fetchTournament = useCallback(async () => {
    setFetchInFlight(true);
    try {
      const response = await fetchWithRetry(`/api/tournaments/${id}?fields=summary`, { cache: 'no-store' });
      if (response.ok) {
        const json = await response.json();
        setTournament(json.data ?? json);
        setFetchFailure(null);
        setRetryCount(0);
      } else {
        const failure: TournamentFetchFailure = response.status === 404 ? 'not-found' : 'network';
        setFetchFailure(failure);
        logger.error('Tournament summary request failed', { status: response.status, tournamentId: id });
      }
    } catch (err) {
      const metadata = err instanceof Error ? { message: err.message, stack: err.stack } : { error: err };
      logger.error('Failed to fetch tournament:', { ...metadata, tournamentId: id });
      setFetchFailure('network');
    } finally {
      setFetchInFlight(false);
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (!loading && !tournament && retryCount < 2) {
      const timer = setTimeout(() => {
        setRetryCount((count) => count + 1);
        fetchTournament();
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [loading, tournament, retryCount, fetchTournament]);

  useEffect(() => {
    fetchTournament();
  }, [fetchTournament]);

  useEffect(() => {
    setTabsHydrated(true);
  }, []);

  useEffect(() => {
    const handler = () => fetchTournament();
    window.addEventListener('publicModesChanged', handler);
    return () => window.removeEventListener('publicModesChanged', handler);
  }, [fetchTournament]);

  const updateStatus = async (status: string) => {
    if (statusUpdateInFlightRef.current || !canUpdateTournamentStatus(tournament)) return;
    statusUpdateInFlightRef.current = true;

    setStatusUpdating(true);
    setStatusError(null);
    try {
      const response = await fetch(`/api/tournaments/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      const updatedTournament = await parseTournamentStatusUpdateResponse<Tournament>(response);
      setTournament(updatedTournament);
    } catch (err) {
      const metadata = err instanceof Error ? { message: err.message, stack: err.stack } : { error: err };
      logger.error('Failed to update status:', metadata);
      setStatusError(isUserFacingTournamentStatusUpdateError(err) ? err.message : tc('networkError'));
    } finally {
      statusUpdateInFlightRef.current = false;
      setStatusUpdating(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'draft':
        return <Badge variant="flag-draft">{t('draft')}</Badge>;
      case 'active':
        return <Badge variant="flag-active">{t('activeStatus')}</Badge>;
      case 'completed':
        return <Badge variant="flag-completed">{t('completed')}</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  if (isMinimalPage(pathname)) {
    return <>{children}</>;
  }

  const retryPending = !tournament && fetchFailure !== null && retryCount < 2;
  if (loading || (!tournament && (fetchInFlight || retryPending))) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-start">
          <div className="space-y-3">
            <div className="h-9 w-3/4 bg-muted animate-pulse rounded" />
            <div className="h-5 w-48 bg-muted animate-pulse rounded" />
          </div>
          <div className="flex gap-2">
            <div className="h-10 w-32 bg-muted animate-pulse rounded" />
            <div className="h-10 w-24 bg-muted animate-pulse rounded" />
          </div>
        </div>
        <div className="h-10 w-full bg-muted animate-pulse rounded-lg" />
        <div className="h-64 bg-muted animate-pulse rounded" />
      </div>
    );
  }

  if (!tournament) {
    const message = fetchFailure === 'not-found' ? tc('tournamentNotFound') : tc('networkError');
    return (
      <div role="alert" className="text-center py-8">
        {message}
      </div>
    );
  }

  const activeTab = getActiveTab(pathname);
  const { guardClassName, ...tabHydrationGuardProps } = getTabHydrationGuardProps(tabsHydrated);
  const canManageStatus = Boolean(isAdmin) && canUpdateTournamentStatus(tournament);
  const visibleModeTabs = tournament.taBattleRoyaleMode ? TABS.filter((tab) => tab.href === 'ta') : TABS;

  return (
    <ErrorBoundary>
      <div className="space-y-7">
        <header className="border-b border-foreground/15 pb-5">
          <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
            <div className="flex items-stretch gap-3">
              <span aria-hidden="true" className="block w-[3px] bg-primary self-stretch" />
              <div>
                <h1 className="font-display text-3xl sm:text-4xl lg:text-5xl tracking-wide leading-[0.95] text-foreground">
                  {tournament.name}
                </h1>
                <div className="flex items-center gap-3 mt-2 text-sm text-muted-foreground">
                  {getStatusBadge(tournament.status)}
                  <TaModeBadge mode={tournament.taBattleRoyaleMode ? 'battle_royale' : 'standard'} />
                  <span className="font-mono tabular">{new Date(tournament.date).toLocaleDateString()}</span>
                </div>
              </div>
            </div>
            <div className="flex flex-col items-start lg:items-end gap-2">
              <div className="flex flex-wrap gap-2">
                {canManageStatus && tournament.status === 'draft' && (
                  <Button disabled={statusUpdating} aria-busy={statusUpdating} onClick={() => updateStatus('active')}>
                    {t('startTournament')}
                  </Button>
                )}
                {canManageStatus && tournament.status === 'active' && (
                  <Button
                    disabled={statusUpdating}
                    aria-busy={statusUpdating}
                    onClick={() => updateStatus('completed')}
                  >
                    {t('completeTournament')}
                  </Button>
                )}
                {canManageStatus && tournament.status === 'completed' && (
                  <Button
                    variant="outline"
                    disabled={statusUpdating}
                    aria-busy={statusUpdating}
                    onClick={() => updateStatus('active')}
                  >
                    {t('reopenTournament')}
                  </Button>
                )}
                {isAdmin && <ExportButton tournamentId={id} tournamentName={tournament.name} />}
                {isAdmin && (
                  <ExportButton tournamentId={id} tournamentName={tournament.name} format="cdm">
                    CDM Export
                  </ExportButton>
                )}
                <Button variant="outline" asChild>
                  <Link href="/tournaments" prefetch={false}>
                    ← {t('backToList')}
                  </Link>
                </Button>
              </div>
              {statusError ? (
                <p role="alert" className="max-w-xl text-sm text-red-600 lg:text-right">
                  {statusError}
                </p>
              ) : null}
            </div>
          </div>
        </header>

        <nav
          aria-label={tLayout('sectionsNavLabel')}
          data-tournament-tabs-hydrated={tabsHydrated ? 'true' : 'false'}
          className="overflow-x-auto -mx-5 sm:-mx-6 px-5 sm:px-6 border-b border-foreground/15"
        >
          <ul className="flex items-stretch gap-0 min-w-max">
            {visibleModeTabs.map((tab) => {
              const modeName = 'publicMode' in tab ? tab.publicMode : tab.href;
              const isHidden = modeName && !isAdmin && !(tournament.publicModes ?? []).includes(modeName);
              if (isHidden) return null;
              const isActive = activeTab === tab.href;
              const adminHidden = isAdmin && modeName && !(tournament.publicModes ?? []).includes(modeName);

              return (
                <li key={tab.href}>
                  <Link
                    href={`/tournaments/${id}/${tab.href}`}
                    prefetch={false}
                    {...tabHydrationGuardProps}
                    aria-current={isActive ? 'page' : undefined}
                    className={cn(
                      'inline-flex items-center gap-2 px-4 py-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background',
                      isActive
                        ? 'pit-active text-foreground font-semibold'
                        : 'text-muted-foreground hover:text-foreground',
                      guardClassName,
                    )}
                  >
                    {t(tab.labelKey)}
                    {adminHidden && (
                      <Badge variant="flag-draft" className="px-1 py-0">
                        {t('hidden')}
                      </Badge>
                    )}
                  </Link>
                </li>
              );
            })}
            {isAdmin &&
              ADMIN_TABS.map((tab) => {
                const isActive = activeTab === tab.href;
                return (
                  <li key={tab.href}>
                    <Link
                      href={`/tournaments/${id}/${tab.href}`}
                      prefetch={false}
                      {...tabHydrationGuardProps}
                      aria-current={isActive ? 'page' : undefined}
                      className={cn(
                        'inline-flex items-center px-4 py-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background',
                        isActive
                          ? 'pit-active text-foreground font-semibold'
                          : 'text-muted-foreground hover:text-foreground',
                        guardClassName,
                      )}
                    >
                      {tLayout(tab.labelKey)}
                    </Link>
                  </li>
                );
              })}
          </ul>
        </nav>

        {children}
      </div>
    </ErrorBoundary>
  );
}
