'use client';

/**
 * Participant Entry Hub Page
 *
 * Landing page for tournament participants to navigate to game mode
 * score entry pages. Requires player session authentication (nickname + password).
 *
 * Access Flow:
 * 1. Player logs in via /auth/signin with their credentials
 * 2. Session is checked - must be a player-type user
 * 3. Game mode selection cards are displayed
 * 4. Player navigates to their desired game mode
 *
 * Game Modes Available:
 * - Battle Mode (BM): 1v1 balloon battle results
 * - Match Race (MR): 1v1 5-race competition results
 * - Grand Prix (GP): Cup-based driver points results
 * - Time Trial (TA): Individual course times
 *
 * Security:
 * - Player session authentication via NextAuth credentials provider
 * - Player is auto-identified from session (no manual selection needed)
 * - All actions are logged server-side for accountability
 */

import { useState, useEffect, use } from 'react';
import { useSession } from 'next-auth/react';
import { useTranslations } from 'next-intl';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Shield, AlertTriangle, Trophy, LogIn } from 'lucide-react';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import Link from 'next/link';

/** Tournament data structure from the API */
interface Tournament {
  id: string;
  name: string;
  date: string;
  status: string;
}

export default function ParticipantEntryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: tournamentId } = use(params);
  /* i18n translation hooks for participant and common namespaces */
  const tPart = useTranslations('participant');
  const tCommon = useTranslations('common');
  const { data: session, status: sessionStatus } = useSession();

  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /**
   * Check if the current user is a player (authenticated via credentials).
   * Admin users are also allowed to access participant pages for testing.
   */
  const isPlayer = session?.user?.userType === 'player';
  const isAdmin = session?.user?.role === 'admin';
  const hasAccess = isPlayer || isAdmin;

  /**
   * Fetch tournament data once session is confirmed.
   * Session cookie is sent automatically with fetch requests.
   */
  useEffect(() => {
    if (sessionStatus === 'loading') return;

    if (!hasAccess) {
      setLoading(false);
      return;
    }

    const fetchTournament = async () => {
      try {
        const response = await fetch(`/api/tournaments/${tournamentId}`);
        if (response.ok) {
          const data = await response.json();
          setTournament(data);
        } else {
          setError('Failed to load tournament information');
        }
      } catch (err) {
        console.error('Tournament fetch error:', err);
        setError('Failed to load tournament data. Please check your connection.');
      } finally {
        setLoading(false);
      }
    };

    fetchTournament();
  }, [tournamentId, sessionStatus, hasAccess]);

  /* Loading state while session or tournament data is being fetched */
  if (sessionStatus === 'loading' || loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <LoadingSpinner size="lg" />
          <p className="text-lg mt-4">{tCommon('loading')}</p>
        </div>
      </div>
    );
  }

  /* Not authenticated or not a player - show login prompt */
  if (!hasAccess) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <LogIn className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <CardTitle>{tPart('playerLoginRequired')}</CardTitle>
            <CardDescription>
              {tPart('loginToAccess')}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button asChild className="w-full">
              <Link href="/auth/signin">{tPart('logIn')}</Link>
            </Button>
            <p className="text-sm text-muted-foreground text-center">
              {tPart('loginHelp')}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  /* Error state */
  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <AlertTriangle className="h-12 w-12 mx-auto mb-4 text-destructive" />
            <CardTitle>{tPart('error')}</CardTitle>
          </CardHeader>
          <CardContent>
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      </div>
    );
  }

  /* Tournament not found state */
  if (!tournament) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <Trophy className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <CardTitle>{tPart('tournamentNotFound')}</CardTitle>
            <CardDescription>
              {tPart('tournamentNotFoundDesc')}
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        {/* Header with player identity */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-4">
            <Shield className="h-8 w-8 text-green-600" />
            <h1 className="text-3xl font-bold">{tPart('scoreEntry')}</h1>
          </div>
          <Badge variant="default" className="mb-4">
            {tPart('loggedInAs', { name: session?.user?.nickname || session?.user?.name || '' })}
          </Badge>
          <p className="text-lg text-muted-foreground">
            {tournament.name}
          </p>
          <p className="text-sm text-muted-foreground">
            {new Date(tournament.date).toLocaleDateString()}
          </p>
        </div>

        {/* Game Mode Selection Cards */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4 max-w-6xl mx-auto">
          {/* Battle Mode Card */}
          <Card className="hover:shadow-md transition-shadow">
            <CardHeader>
              <CardTitle>{tPart('battleMode')}</CardTitle>
              <CardDescription>
                {tPart('battleModeDesc')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild className="w-full">
                <Link href={`/tournaments/${tournamentId}/bm/participant`}>
                  {tPart('enterBattleScores')}
                </Link>
              </Button>
            </CardContent>
          </Card>

          {/* Match Race Card */}
          <Card className="hover:shadow-md transition-shadow">
            <CardHeader>
              <CardTitle>{tPart('matchRace')}</CardTitle>
              <CardDescription>
                {tPart('matchRaceDesc')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild className="w-full">
                <Link href={`/tournaments/${tournamentId}/mr/participant`}>
                  {tPart('enterRaceScores')}
                </Link>
              </Button>
            </CardContent>
          </Card>

          {/* Grand Prix Card */}
          <Card className="hover:shadow-md transition-shadow">
            <CardHeader>
              <CardTitle>{tPart('grandPrix')}</CardTitle>
              <CardDescription>
                {tPart('grandPrixDesc')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild className="w-full">
                <Link href={`/tournaments/${tournamentId}/gp/participant`}>
                  {tPart('enterGPScores')}
                </Link>
              </Button>
            </CardContent>
          </Card>

          {/* Time Trial Card */}
          <Card className="hover:shadow-md transition-shadow">
            <CardHeader>
              <CardTitle>{tPart('timeTrial')}</CardTitle>
              <CardDescription>
                {tPart('timeTrialDesc')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild className="w-full">
                <Link href={`/tournaments/${tournamentId}/ta/participant`}>
                  {tPart('enterTimeTrial')}
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Security Notice */}
        <div className="max-w-2xl mx-auto mt-8">
          <Alert>
            <Shield className="h-4 w-4" />
            <AlertDescription>
              {tPart('securityNotice')}
            </AlertDescription>
          </Alert>
        </div>
      </div>
    </div>
  );
}
