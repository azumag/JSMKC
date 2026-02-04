/**
 * Battle Mode Participant Page
 *
 * Session-authenticated page for tournament participants to self-report their
 * Battle Mode match scores. Requires player login (nickname + password).
 *
 * The player is automatically identified from their session — no manual
 * "select yourself" step is needed.
 *
 * Flow:
 * 1. Verify the player is logged in via session
 * 2. Auto-identify the player from session.user.playerId
 * 3. Show the participant's pending (incomplete) matches
 * 4. Allow score reporting for each pending match
 * 5. Display previous score reports (both players' reported scores)
 *
 * Security:
 * - Player session is validated via NextAuth credentials provider
 * - Score reports are audit-logged server-side with IP and User-Agent tracking
 * - Dual-report confirmation system prevents fraudulent score reports
 *
 * Real-time updates:
 * - Matches are polled every 5 seconds
 * - Match completion and score changes are reflected in real-time
 */

'use client';

import { useState, useEffect, useCallback, use } from 'react';
import { useTranslations } from 'next-intl';
import { useSession } from 'next-auth/react';
import { usePolling } from '@/lib/hooks/usePolling';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertTriangle, Trophy, CheckCircle, Clock, Users, LogIn } from 'lucide-react';
import Link from 'next/link';

/** Player data structure */
interface Player {
  id: string;
  name: string;
  nickname: string;
}

/** BM Match data with player relations and reported scores */
interface BMMatch {
  id: string;
  matchNumber: number;
  stage: string;
  tvNumber?: number;
  player1: Player;
  player1Side: number;
  player2: Player;
  player2Side: number;
  score1: number;
  score2: number;
  completed: boolean;
  rounds?: { arena: string; winner: number }[];
  /** Player 1's self-reported score for player 1 */
  player1ReportedScore1?: number;
  /** Player 1's self-reported score for player 2 */
  player1ReportedScore2?: number;
  /** Player 2's self-reported score for player 1 */
  player2ReportedScore1?: number;
  /** Player 2's self-reported score for player 2 */
  player2ReportedScore2?: number;
}

/** Tournament metadata for display */
interface Tournament {
  id: string;
  name: string;
  date: string;
  status: string;
}

/**
 * Participant-facing Battle Mode score entry page.
 * Accessed via player login session (e.g., /tournaments/[id]/bm/participant).
 */
export default function BattleModeParticipantPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: tournamentId } = use(params);

  /**
   * i18n translation hooks for the participant score entry page.
   * Three namespaces are used:
   * - 'participant': Participant-specific strings (login prompts, match cards, reports)
   * - 'bm': Battle Mode shared strings (page title, score entry header)
   * - 'match': Match-level strings (submitting state shared across match pages)
   * Hooks must be called at the top of the component before any other hooks.
   */
  const tPart = useTranslations('participant');
  const tBm = useTranslations('bm');
  const tMatch = useTranslations('match');

  const { data: session, status: sessionStatus } = useSession();

  /* The player's ID from session, used for auto-identification */
  const playerId = session?.user?.playerId;
  const isPlayer = session?.user?.userType === 'player';
  const isAdmin = session?.user?.role === 'admin';
  const hasAccess = isPlayer || isAdmin;

  /* Core state for tournament data */
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [matches, setMatches] = useState<BMMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /* Matches filtered for the current player */
  const [myMatches, setMyMatches] = useState<BMMatch[]>([]);

  /* State for score reporting form */
  const [reportingScores, setReportingScores] = useState<{ [key: string]: { score1: string; score2: string } }>({});
  const [submitting, setSubmitting] = useState<string | null>(null);

  /**
   * Fetch initial tournament and match data on mount.
   * Session cookie is sent automatically with fetch requests.
   */
  useEffect(() => {
    if (sessionStatus === 'loading') return;
    if (!hasAccess) {
      setLoading(false);
      return;
    }

    const fetchData = async () => {
      try {
        const [tournamentResponse, matchesResponse] = await Promise.all([
          fetch(`/api/tournaments/${tournamentId}`),
          fetch(`/api/tournaments/${tournamentId}/bm`),
        ]);

        if (tournamentResponse.ok) {
          setTournament(await tournamentResponse.json());
        }
        if (matchesResponse.ok) {
          const data = await matchesResponse.json();
          setMatches(data.matches || []);
        }
      } catch (err) {
        console.error('Data fetch error:', err);
        setError('Failed to load tournament data. Please check your connection.');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [tournamentId, sessionStatus, hasAccess]);

  /**
   * Polling function for real-time match updates.
   * Session cookie provides authentication automatically.
   */
  const fetchMatches = useCallback(async () => {
    if (!hasAccess) return { matches: [] };
    const response = await fetch(`/api/tournaments/${tournamentId}/bm`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  }, [tournamentId, hasAccess]);

  /* Poll every 5 seconds for match updates */
  const { data: pollingData, error: pollingError } = usePolling(
    fetchMatches, {
    interval: 5000,
    enabled: hasAccess && !loading,
  });

  /* Update matches when polling data arrives */
  useEffect(() => {
    if (pollingData && typeof pollingData === 'object' && 'matches' in pollingData) {
      setMatches(pollingData.matches as BMMatch[]);
    }
    if (pollingError) {
      console.error('Polling error:', pollingError);
    }
  }, [pollingData, pollingError]);

  /**
   * Filter matches for the current player (auto-identified from session).
   * Only shows incomplete matches — completed matches don't need reporting.
   */
  useEffect(() => {
    if (playerId && matches.length > 0) {
      const playerMatches = matches.filter(match =>
        !match.completed &&
        (match.player1.id === playerId || match.player2.id === playerId)
      );
      setMyMatches(playerMatches);

      /* Pre-initialize empty score forms for each pending match */
      const initialScores: { [key: string]: { score1: string; score2: string } } = {};
      playerMatches.forEach(match => {
        if (!reportingScores[match.id]) {
          initialScores[match.id] = { score1: '', score2: '' };
        }
      });
      if (Object.keys(initialScores).length > 0) {
        setReportingScores(prev => ({ ...prev, ...initialScores }));
      }
    }
  }, [playerId, matches]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Update a specific match's score form value */
  const handleScoreChange = (matchId: string, player: 'score1' | 'score2', value: string) => {
    setReportingScores(prev => ({
      ...prev,
      [matchId]: {
        ...prev[matchId],
        [player]: value,
      },
    }));
  };

  /**
   * Submit a score report for a match.
   * Validates input before sending to the API.
   * The API handles dual-confirmation logic (both players must report matching scores).
   */
  const handleSubmitScore = async (match: BMMatch) => {
    const scores = reportingScores[match.id];
    if (!scores || !scores.score1 || !scores.score2) {
      setError('Please enter both scores before submitting.');
      return;
    }

    const score1 = parseInt(scores.score1);
    const score2 = parseInt(scores.score2);

    /* Client-side validation for score range */
    if (isNaN(score1) || isNaN(score2) || score1 < 0 || score2 < 0 || score1 > 5 || score2 > 5) {
      setError('Scores must be between 0 and 5.');
      return;
    }

    /* BM matches cannot end in a tie */
    if (score1 === score2) {
      setError('Scores cannot be equal. Battle mode matches cannot end in a tie.');
      return;
    }

    setSubmitting(match.id);
    try {
      const response = await fetch(`/api/tournaments/${tournamentId}/bm/match/${match.id}/report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          playerId,
          score1,
          score2,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to submit scores');
      }

      const data = await response.json();

      /* Clear the form for this match after successful submission */
      setReportingScores(prev => ({
        ...prev,
        [match.id]: { score1: '', score2: '' },
      }));

      /* Update the match in local state with the API response */
      setMatches(prev => prev.map(m =>
        m.id === match.id ? { ...m, ...data.match } : m
      ));

      /* Inform the user about the dual-confirmation system */
      alert("Scores reported successfully! Both players must report matching scores for confirmation.");
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to submit scores';
      setError(errorMessage);
    } finally {
      setSubmitting(null);
    }
  };

  /* Loading state */
  if (sessionStatus === 'loading' || loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="h-12 w-12 mx-auto mb-4 animate-pulse rounded-full bg-muted" />
          <p className="text-lg">{tPart('loadingTournament')}</p>
        </div>
      </div>
    );
  }

  /* Not logged in or not a player — show login prompt */
  if (!hasAccess) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <LogIn className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <CardTitle>{tPart('playerLoginRequired')}</CardTitle>
            <CardDescription>
              {tPart('loginToReport')}
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
        {/* Header with player identity and tournament info */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold mb-2">{tBm('scoreEntry')}</h1>
          <p className="text-lg text-muted-foreground">{tournament.name}</p>
          <p className="text-sm text-muted-foreground">
            {new Date(tournament.date).toLocaleDateString()}
          </p>
        </div>

        <div className="max-w-4xl mx-auto">
          {/* Player identity card (auto-identified from session) */}
          <Card className="mb-6">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <Users className="h-8 w-8 text-blue-600" />
                <div>
                  <h3 className="font-semibold">{session?.user?.nickname || session?.user?.name}</h3>
                  <p className="text-sm text-muted-foreground">{tPart('loggedInAsPlayer')}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Error alert for score submission failures */}
          {error && (
            <Alert variant="destructive" className="mb-6">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Pending matches list or empty state */}
          {myMatches.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Clock className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <h3 className="text-lg font-semibold mb-2">{tPart('noPendingMatches')}</h3>
                <p className="text-muted-foreground">
                  {tPart('noPendingBM')}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-6">
              <div className="flex items-center gap-2">
                <Trophy className="h-6 w-6 text-yellow-600" />
                <h2 className="text-2xl font-semibold">{tPart('yourPendingMatches')}</h2>
              </div>

              {myMatches.map((match) => (
                <Card key={match.id}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="text-lg">{tPart('matchNumber', { number: match.matchNumber })}</CardTitle>
                        <CardDescription>
                          {tPart('tvInfo', { tv: match.tvNumber ?? '' })} • {match.stage === 'qualification' ? tPart('qualification') : 'Finals'}
                        </CardDescription>
                      </div>
                      {/* Match status badge */}
                      {match.completed ? (
                        <Badge variant="default" className="bg-green-600">
                          <CheckCircle className="h-3 w-3 mr-1" />
                          {tPart('completed')}
                        </Badge>
                      ) : (
                        <Badge variant="outline">
                          <Clock className="h-3 w-3 mr-1" />
                          {tPart('pending')}
                        </Badge>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {/* Player cards with "You" badge for the current player */}
                      <div className="grid grid-cols-2 gap-4">
                        <div className={`p-3 rounded-lg border ${match.player1.id === playerId ? 'bg-blue-50 border-blue-200' : 'bg-gray-50 border-gray-200'}`}>
                          <div className="font-medium">
                            {match.player1.nickname}
                            {match.player1.id === playerId && (
                              <Badge variant="default" className="ml-2 bg-blue-600">{tPart('you')}</Badge>
                            )}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {tPart('controller', { side: match.player1Side })}
                          </div>
                        </div>
                        <div className={`p-3 rounded-lg border ${match.player2.id === playerId ? 'bg-blue-50 border-blue-200' : 'bg-gray-50 border-gray-200'}`}>
                          <div className="font-medium">
                            {match.player2.nickname}
                            {match.player2.id === playerId && (
                              <Badge variant="default" className="ml-2 bg-blue-600">{tPart('you')}</Badge>
                            )}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {tPart('controller', { side: match.player2Side })}
                          </div>
                        </div>
                      </div>

                      {/* Score reporting form for incomplete matches */}
                      {!match.completed && (
                        <div className="border-t pt-4">
                          <h4 className="font-medium mb-3">{tPart('reportMatchResult')}</h4>
                          <div className="grid grid-cols-2 gap-4 mb-4">
                            <div>
                              <Label className="text-sm">{tPart('playerWins', { player: match.player1.nickname })}</Label>
                              <Input
                                type="number"
                                min="0"
                                max="5"
                                placeholder="0-5"
                                value={reportingScores[match.id]?.score1 || ''}
                                onChange={(e) => handleScoreChange(match.id, 'score1', e.target.value)}
                              />
                            </div>
                            <div>
                              <Label className="text-sm">{tPart('playerWins', { player: match.player2.nickname })}</Label>
                              <Input
                                type="number"
                                min="0"
                                max="5"
                                placeholder="0-5"
                                value={reportingScores[match.id]?.score2 || ''}
                                onChange={(e) => handleScoreChange(match.id, 'score2', e.target.value)}
                              />
                            </div>
                          </div>
                          <Button
                            onClick={() => handleSubmitScore(match)}
                            disabled={submitting === match.id || !reportingScores[match.id]?.score1 || !reportingScores[match.id]?.score2}
                            className="w-full"
                          >
                            {submitting === match.id ? tMatch('submitting') : tPart('submitScores')}
                          </Button>
                        </div>
                      )}

                      {/* Display of previous score reports from both players */}
                      {(match.player1ReportedScore1 !== undefined || match.player2ReportedScore1 !== undefined) && (
                        <div className="border-t pt-4">
                          <h4 className="font-medium mb-2">{tPart('previousReports')}</h4>
                          <div className="space-y-2 text-sm">
                            {match.player1ReportedScore1 !== undefined && (
                              <div className="flex justify-between p-2 bg-gray-50 rounded">
                                <span>{tPart('playerReported', { player: match.player1.nickname })}</span>
                                <span className="font-mono">{match.player1ReportedScore1} - {match.player1ReportedScore2}</span>
                              </div>
                            )}
                            {match.player2ReportedScore1 !== undefined && (
                              <div className="flex justify-between p-2 bg-gray-50 rounded">
                                <span>{tPart('playerReported', { player: match.player2.nickname })}</span>
                                <span className="font-mono">{match.player2ReportedScore1} - {match.player2ReportedScore2}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* Navigation back to game selection */}
        <div className="text-center mt-8">
          <Button variant="outline" asChild>
            <Link href={`/tournaments/${tournamentId}/participant`}>
              {tPart('backToGameSelection')}
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
