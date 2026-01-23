'use client';

import { useState, useEffect, use } from 'react';
import { useSearchParams } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Shield, AlertTriangle, Trophy } from 'lucide-react';
import { LoadingSpinner } from '@/components/ui/loading-spinner';

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
  const searchParams = useSearchParams();
  const { id: tournamentId } = use(params);
  const token = searchParams.get('token');

  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tokenValid, setTokenValid] = useState(false);

  useEffect(() => {
    const validateTokenAndFetchTournament = async () => {
      if (!token) {
        setError('Access token is required. Please use the full URL provided by the tournament organizer.');
        setLoading(false);
        return;
      }

      try {
        // First validate token
        const validateResponse = await fetch(`/api/tournaments/${tournamentId}/token/validate`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-tournament-token': token,
          },
        });

        if (!validateResponse.ok) {
          const errorData = await validateResponse.json();
          setError(errorData.error || 'Invalid or expired token');
          setLoading(false);
          return;
        }

        const validateData = await validateResponse.json();
        if (!validateData.success) {
          setError(validateData.error || 'Token validation failed');
          setLoading(false);
          return;
        }

        setTokenValid(true);

        // Then fetch tournament details
        const tournamentResponse = await fetch(`/api/tournaments/${tournamentId}?token=${token}`);
        if (tournamentResponse.ok) {
          const tournamentData = await tournamentResponse.json();
          setTournament(tournamentData);
        } else {
          setError('Failed to load tournament information');
        }
      } catch (err) {
        console.error('Token validation error:', err);
        setError('Failed to validate access token. Please check your URL and try again.');
      } finally {
        setLoading(false);
      }
    };

    validateTokenAndFetchTournament();
  }, [tournamentId, token]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <LoadingSpinner size="lg" />
          <p className="text-lg mt-4">Validating access token...</p>
        </div>
      </div>
    );
  }

  if (error || !tokenValid) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <AlertTriangle className="h-12 w-12 mx-auto mb-4 text-destructive" />
            <CardTitle>Access Denied</CardTitle>
            <CardDescription>
              Unable to access tournament score entry
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
            <div className="mt-4 text-sm text-muted-foreground">
              <p className="mb-2">Please ensure you have:</p>
              <ul className="list-disc list-inside space-y-1">
                <li>A valid tournament access token</li>
                <li>The complete URL from the tournament organizer</li>
                <li>Token that hasn&apos;t expired</li>
              </ul>
              <p className="mt-3">Contact the tournament organizer if you need a new access link.</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!tournament) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <Trophy className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <CardTitle>Tournament Not Found</CardTitle>
            <CardDescription>
              The requested tournament could not be loaded
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-4">
            <Shield className="h-8 w-8 text-green-600" />
            <h1 className="text-3xl font-bold">Participant Score Entry</h1>
          </div>
          <Badge variant="default" className="mb-4">
            ✓ Secure Access Verified
          </Badge>
          <p className="text-lg text-muted-foreground">
            {tournament.name}
          </p>
          <p className="text-sm text-muted-foreground">
            {new Date(tournament.date).toLocaleDateString()}
          </p>
        </div>

        {/* Game Mode Selection */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4 max-w-6xl mx-auto">
          <Card className="hover:shadow-md transition-shadow">
            <CardHeader>
              <CardTitle>Battle Mode</CardTitle>
              <CardDescription>
                Report your 1v1 balloon battle results
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild className="w-full">
                <a href={`/tournaments/${tournamentId}/bm/participant?token=${token}`}>
                  Enter Battle Scores
                </a>
              </Button>
            </CardContent>
          </Card>

          <Card className="hover:shadow-md transition-shadow">
            <CardHeader>
              <CardTitle>Match Race</CardTitle>
              <CardDescription>
                Report your 1v1 5-race competition results
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild className="w-full">
                <a href={`/tournaments/${tournamentId}/mr/participant?token=${token}`}>
                  Enter Race Scores
                </a>
              </Button>
            </CardContent>
          </Card>

          <Card className="hover:shadow-md transition-shadow">
            <CardHeader>
              <CardTitle>Grand Prix</CardTitle>
              <CardDescription>
                Report your cup-based driver points results
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild className="w-full">
                <a href={`/tournaments/${tournamentId}/gp/participant?token=${token}`}>
                  Enter GP Scores
                </a>
              </Button>
            </CardContent>
          </Card>

          <Card className="hover:shadow-md transition-shadow">
            <CardHeader>
              <CardTitle>Time Trial</CardTitle>
              <CardDescription>
                Enter your course times and verify results
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild className="w-full">
                <a href={`/tournaments/${tournamentId}/ta/participant?token=${token}`}>
                  Enter Time Trial
                </a>
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Security Notice */}
        <div className="max-w-2xl mx-auto mt-8">
          <Alert>
            <Shield className="h-4 w-4" />
            <AlertDescription>
              This is a secure portal for tournament participants. All score entries are logged and verified. 
              Please ensure you&apos;re reporting accurate results for fair competition.
            </AlertDescription>
          </Alert>
        </div>

        {/* Footer */}
        <div className="text-center mt-12 text-sm text-muted-foreground">
          <p>Access granted via secure token • JSMKC Tournament Management System</p>
        </div>
      </div>
    </div>
  );
}