'use client';

import { useState, useEffect, use } from 'react';
import { useSearchParams } from 'next/navigation';
import { usePolling } from '@/app/hooks/use-polling';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Shield, AlertTriangle, Trophy, CheckCircle, Clock, Users } from 'lucide-react';
import Link from 'next/link';

interface Player {
  id: string;
  name: string;
  nickname: string;
}

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
  player1ReportedScore1?: number;
  player1ReportedScore2?: number;
  player2ReportedScore1?: number;
  player2ReportedScore2?: number;
}

interface Tournament {
  id: string;
  name: string;
  date: string;
  status: string;
}

export default function BattleModeParticipantPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const searchParams = useSearchParams();
  const { id: tournamentId } = use(params);
  const token = searchParams.get('token');

  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [matches, setMatches] = useState<BMMatch[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tokenValid, setTokenValid] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const [myMatches, setMyMatches] = useState<BMMatch[]>([]);
  const [reportingScores, setReportingScores] = useState<{ [key: string]: { score1: string; score2: string } }>({});
  const [submitting, setSubmitting] = useState<string | null>(null);

  // Initial data fetch
  useEffect(() => {
    const validateTokenAndFetchData = async () => {
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

        // Fetch tournament data
        const [tournamentResponse, matchesResponse, playersResponse] = await Promise.all([
          fetch(`/api/tournaments/${tournamentId}?token=${token}`),
          fetch(`/api/tournaments/${tournamentId}/bm?token=${token}`),
          fetch('/api/players'),
        ]);

        if (tournamentResponse.ok) {
          const tournamentData = await tournamentResponse.json();
          setTournament(tournamentData);
        }

        if (matchesResponse.ok) {
          const matchesData = await matchesResponse.json();
          setMatches(matchesData.matches || []);
        }

        if (playersResponse.ok) {
          const playersData = await playersResponse.json();
          setPlayers(playersData);
        }
      } catch (err) {
        console.error('Data fetch error:', err);
        setError('Failed to load tournament data. Please check your connection and try again.');
      } finally {
        setLoading(false);
      }
    };

    validateTokenAndFetchData();
  }, [tournamentId, token]);

  // Real-time polling for match data
  const { data: pollingData, error: pollingError } = usePolling(
    tokenValid ? `/api/tournaments/${tournamentId}/bm/matches?token=${token}` : null,
    5000 // 5 seconds as per optimization requirements
  );

  // Update matches when polling data is received
  useEffect(() => {
    if (pollingData && typeof pollingData === 'object' && 'matches' in pollingData) {
      setMatches(pollingData.matches as BMMatch[]);
    }
    if (pollingError) {
      console.error('Polling error:', pollingError);
    }
  }, [pollingData, pollingError]);

  useEffect(() => {
    if (selectedPlayer && matches.length > 0) {
      const playerMatches = matches.filter(match => 
        !match.completed &&
        (match.player1.id === selectedPlayer.id || match.player2.id === selectedPlayer.id)
      );
      setMyMatches(playerMatches);

      // Initialize reporting scores
      const initialScores: { [key: string]: { score1: string; score2: string } } = {};
      playerMatches.forEach(match => {
        initialScores[match.id] = {
          score1: '',
          score2: '',
        };
      });
      setReportingScores(initialScores);
    }
  }, [selectedPlayer, matches]);

  const handleScoreChange = (matchId: string, player: 'score1' | 'score2', value: string) => {
    setReportingScores(prev => ({
      ...prev,
      [matchId]: {
        ...prev[matchId],
        [player]: value,
      },
    }));
  };

  const handleSubmitScore = async (match: BMMatch) => {
    const scores = reportingScores[match.id];
    if (!scores || !scores.score1 || !scores.score2) {
      setError('Please enter both scores before submitting.');
      return;
    }

    const score1 = parseInt(scores.score1);
    const score2 = parseInt(scores.score2);

    if (isNaN(score1) || isNaN(score2) || score1 < 0 || score2 < 0 || score1 > 5 || score2 > 5) {
      setError('Scores must be between 0 and 5.');
      return;
    }

    if (score1 === score2) {
      setError('Scores cannot be equal. Battle mode matches cannot end in a tie.');
      return;
    }

    setSubmitting(match.id);
    try {
      const response = await fetch(`/api/tournaments/${tournamentId}/bm/match/${match.id}/report`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-tournament-token': token || '',
        },
        body: JSON.stringify({
          playerId: selectedPlayer?.id,
          score1,
          score2,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to submit scores');
      }

      const data = await response.json();
      
      // Clear the form for this match
      setReportingScores(prev => ({
        ...prev,
        [match.id]: { score1: '', score2: '' },
      }));

      // Update the match in local state
      setMatches(prev => prev.map(m => 
        m.id === match.id ? { ...m, ...data.match } : m
      ));

      // Show success message
      alert("Scores reported successfully! Both players must report matching scores for confirmation.");
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to submit scores';
      setError(errorMessage);
    } finally {
      setSubmitting(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Shield className="h-12 w-12 mx-auto mb-4 text-muted-foreground animate-pulse" />
          <p className="text-lg">Loading tournament data...</p>
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
            <h1 className="text-3xl font-bold">Battle Mode Score Entry</h1>
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

        {/* Player Selection */}
        {!selectedPlayer && (
          <Card className="max-w-2xl mx-auto mb-8">
            <CardHeader>
              <CardTitle>Select Your Player Profile</CardTitle>
              <CardDescription>
                Choose your player name to report your battle mode match results
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3">
                {players.map((player) => (
                  <Button
                    key={player.id}
                    variant="outline"
                    className="justify-start h-auto p-4"
                    onClick={() => setSelectedPlayer(player)}
                  >
                    <div className="text-left">
                      <div className="font-medium">{player.nickname}</div>
                      <div className="text-sm text-muted-foreground">{player.name}</div>
                    </div>
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Selected Player Info */}
        {selectedPlayer && (
          <div className="max-w-4xl mx-auto">
            <Card className="mb-6">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Users className="h-8 w-8 text-blue-600" />
                    <div>
                      <h3 className="font-semibold">{selectedPlayer.nickname}</h3>
                      <p className="text-sm text-muted-foreground">Your player profile</p>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setSelectedPlayer(null);
                      setMyMatches([]);
                    }}
                  >
                    Change Player
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Error Alert */}
            {error && (
              <Alert variant="destructive" className="mb-6">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {/* Matches */}
            {myMatches.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <Clock className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                  <h3 className="text-lg font-semibold mb-2">No Pending Matches</h3>
                  <p className="text-muted-foreground">
                    You don&apos;t have any pending battle mode matches. Check back later for new matches.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-6">
                <div className="flex items-center gap-2">
                  <Trophy className="h-6 w-6 text-yellow-600" />
                  <h2 className="text-2xl font-semibold">Your Pending Matches</h2>
                </div>

                {myMatches.map((match) => (
                  <Card key={match.id}>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <div>
                          <CardTitle className="text-lg">Match #{match.matchNumber}</CardTitle>
                          <CardDescription>
                            TV {match.tvNumber} • {match.stage === 'qualification' ? 'Qualification' : 'Finals'}
                          </CardDescription>
                        </div>
                        {match.completed ? (
                          <Badge variant="default" className="bg-green-600">
                            <CheckCircle className="h-3 w-3 mr-1" />
                            Completed
                          </Badge>
                        ) : (
                          <Badge variant="outline">
                            <Clock className="h-3 w-3 mr-1" />
                            Pending
                          </Badge>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        {/* Match Info */}
                        <div className="grid grid-cols-2 gap-4">
                          <div className={`p-3 rounded-lg border ${match.player1.id === selectedPlayer.id ? 'bg-blue-50 border-blue-200' : 'bg-gray-50 border-gray-200'}`}>
                            <div className="font-medium">
                              {match.player1.nickname}
                              {match.player1.id === selectedPlayer.id && (
                                <Badge variant="default" className="ml-2 bg-blue-600">You</Badge>
                              )}
                            </div>
                            <div className="text-sm text-muted-foreground">
                              Controller {match.player1Side}
                            </div>
                          </div>
                          <div className={`p-3 rounded-lg border ${match.player2.id === selectedPlayer.id ? 'bg-blue-50 border-blue-200' : 'bg-gray-50 border-gray-200'}`}>
                            <div className="font-medium">
                              {match.player2.nickname}
                              {match.player2.id === selectedPlayer.id && (
                                <Badge variant="default" className="ml-2 bg-blue-600">You</Badge>
                              )}
                            </div>
                            <div className="text-sm text-muted-foreground">
                              Controller {match.player2Side}
                            </div>
                          </div>
                        </div>

                        {/* Score Reporting */}
                        {!match.completed && (
                          <div className="border-t pt-4">
                            <h4 className="font-medium mb-3">Report Match Result</h4>
                            <div className="grid grid-cols-2 gap-4 mb-4">
                              <div>
                                <Label className="text-sm">{match.player1.nickname} Wins</Label>
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
                                <Label className="text-sm">{match.player2.nickname} Wins</Label>
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
                              {submitting === match.id ? 'Submitting...' : 'Submit Scores'}
                            </Button>
                          </div>
                        )}

                        {/* Previous Reports */}
                        {(match.player1ReportedScore1 !== undefined || match.player2ReportedScore1 !== undefined) && (
                          <div className="border-t pt-4">
                            <h4 className="font-medium mb-2">Previous Reports</h4>
                            <div className="space-y-2 text-sm">
                              {match.player1ReportedScore1 !== undefined && (
                                <div className="flex justify-between p-2 bg-gray-50 rounded">
                                  <span>{match.player1.nickname} reported:</span>
                                  <span className="font-mono">{match.player1ReportedScore1} - {match.player1ReportedScore2}</span>
                                </div>
                              )}
                              {match.player2ReportedScore1 !== undefined && (
                                <div className="flex justify-between p-2 bg-gray-50 rounded">
                                  <span>{match.player2.nickname} reported:</span>
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
        )}

        {/* Navigation */}
        <div className="text-center mt-8">
          <Button variant="outline" asChild>
            <Link href={`/tournaments/${tournamentId}/participant?token=${token}`}>
              Back to Game Selection
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}