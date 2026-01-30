/**
 * Match Race Participant Score Entry Page
 *
 * Token-authenticated page for participants to self-report MR match results.
 * Validates the tournament token, shows the participant's pending matches,
 * and allows them to enter race-by-race results.
 *
 * Both players must independently report matching scores for auto-confirmation.
 *
 * Features:
 * - Token validation before showing any data
 * - Player profile selection
 * - Race result entry with course selection
 * - Auto-calculated scores from race results
 * - Previous report display
 * - Real-time polling for match updates
 *
 * @route /tournaments/[id]/mr/participant?token=xxx
 */
'use client';

import { useState, useEffect, useCallback, use } from 'react';
import { useSearchParams } from 'next/navigation';
import { usePolling } from '@/lib/hooks/usePolling';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Shield, AlertTriangle, Trophy, CheckCircle, Clock, Users, Flag } from 'lucide-react';
import Link from 'next/link';
import { COURSE_INFO } from '@/lib/constants';

/** Player data from the API */
interface Player {
  id: string;
  name: string;
  nickname: string;
}

/** MR match with full details including reported scores */
interface MRMatch {
  id: string;
  matchNumber: number;
  stage: string;
  round?: string;
  tvNumber?: number;
  player1: Player;
  player1Side: number;
  player2: Player;
  player2Side: number;
  score1: number;
  score2: number;
  completed: boolean;
  rounds?: { course: string; winner: number }[];
  player1ReportedScore1?: number;
  player1ReportedScore2?: number;
  player2ReportedScore1?: number;
  player2ReportedScore2?: number;
}

/** Tournament metadata */
interface Tournament {
  id: string;
  name: string;
  date: string;
  status: string;
}

/** Individual race result with course and positions */
interface RaceResult {
  course: string;
  position1: number;
  position2: number;
}

export default function MatchRaceParticipantPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const searchParams = useSearchParams();
  const { id: tournamentId } = use(params);
  const token = searchParams.get('token');

  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [matches, setMatches] = useState<MRMatch[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tokenValid, setTokenValid] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const [myMatches, setMyMatches] = useState<MRMatch[]>([]);
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [raceResults, setRaceResults] = useState<{ [key: string]: RaceResult[] }>({});

  /**
   * Validate tournament token and fetch initial data on mount.
   * Token validation is performed first to prevent data leakage.
   */
  useEffect(() => {
    const validateTokenAndFetchData = async () => {
      if (!token) {
        setError('Access token is required. Please use the full URL provided by the tournament organizer.');
        setLoading(false);
        return;
      }

      try {
        /* Validate token before fetching any tournament data */
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

        /* Fetch tournament, matches, and players data concurrently */
        const [tournamentResponse, matchesResponse, playersResponse] = await Promise.all([
          fetch(`/api/tournaments/${tournamentId}?token=${token}`),
          fetch(`/api/tournaments/${tournamentId}/mr?token=${token}`),
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

  /**
   * Real-time polling for match data updates.
   * Only polls when token is validated.
   */
  const fetchMatches = useCallback(async () => {
    if (!tokenValid) {
      return { matches: [] };
    }
    const response = await fetch(`/api/tournaments/${tournamentId}/mr/matches?token=${token}`);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return response.json();
  }, [tournamentId, token, tokenValid]);

  const { data: pollingData, error: pollingError } = usePolling(
    fetchMatches, {
    interval: 5000,
    enabled: tokenValid,
  });

  /* Update matches from polling data */
  useEffect(() => {
    if (pollingData && typeof pollingData === 'object' && 'matches' in pollingData) {
      setMatches(pollingData.matches as MRMatch[]);
    }
    if (pollingError) {
      console.error('Polling error:', pollingError);
    }
  }, [pollingData, pollingError]);

  /* Filter matches for the selected player (only pending ones) */
  useEffect(() => {
    if (selectedPlayer && matches.length > 0) {
      const playerMatches = matches.filter(match =>
        !match.completed &&
        (match.player1.id === selectedPlayer.id || match.player2.id === selectedPlayer.id)
      );
      setMyMatches(playerMatches);

      /* Initialize empty race results for each pending match */
      const initialResults: { [key: string]: RaceResult[] } = {};
      playerMatches.forEach(match => {
        initialResults[match.id] = [];
      });
      setRaceResults(initialResults);
    }
  }, [selectedPlayer, matches]);

  /** Add an empty race result slot for a match */
  const addRaceResult = (matchId: string) => {
    setRaceResults(prev => ({
      ...prev,
      [matchId]: [
        ...(prev[matchId] || []),
        { course: '', position1: 0, position2: 0 }
      ],
    }));
  };

  /** Update a specific field in a race result */
  const updateRaceResult = (matchId: string, index: number, field: keyof RaceResult, value: string | number) => {
    setRaceResults(prev => ({
      ...prev,
      [matchId]: prev[matchId].map((result, i) =>
        i === index ? { ...result, [field]: value } : result
      ),
    }));
  };

  /** Remove a race result at the given index */
  const removeRaceResult = (matchId: string, index: number) => {
    setRaceResults(prev => ({
      ...prev,
      [matchId]: prev[matchId].filter((_, i) => i !== index),
    }));
  };

  /**
   * Calculate match scores from race results.
   * Each race where position1 < position2 counts as a win for player 1.
   */
  const calculateScores = (raceResults: RaceResult[]): { score1: number; score2: number } => {
    let score1 = 0;
    let score2 = 0;

    raceResults.forEach(result => {
      if (result.position1 < result.position2) {
        score1++;
      } else if (result.position2 < result.position1) {
        score2++;
      }
    });

    return { score1, score2 };
  };

  /** Submit a match result report for the selected player */
  const handleSubmitMatch = async (match: MRMatch) => {
    const matchRaceResults = raceResults[match.id] || [];

    if (matchRaceResults.length === 0) {
      setError('Please add at least one race result.');
      return;
    }

    /* Validate all race fields are complete */
    for (const result of matchRaceResults) {
      if (!result.course || result.position1 === 0 || result.position2 === 0) {
        setError('Please complete all race fields.');
        return;
      }
      if (result.position1 === result.position2) {
        setError('Race positions cannot be equal.');
        return;
      }
    }

    setSubmitting(match.id);
    try {
      const { score1, score2 } = calculateScores(matchRaceResults);

      const response = await fetch(`/api/tournaments/${tournamentId}/mr/match/${match.id}/report`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-tournament-token': token || '',
        },
        body: JSON.stringify({
          playerId: selectedPlayer?.id,
          score1,
          score2,
          races: matchRaceResults,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to submit match result');
      }

      const data = await response.json();

      /* Clear the form for this match after successful submission */
      setRaceResults(prev => ({
        ...prev,
        [match.id]: [],
      }));

      /* Update the match in local state with server response */
      setMatches(prev => prev.map(m =>
        m.id === match.id ? { ...m, ...data.match } : m
      ));

      alert("Match result reported successfully! Both players must report matching results for confirmation.");
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to submit match result';
      setError(errorMessage);
    } finally {
      setSubmitting(null);
    }
  };

  /* Loading state */
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

  /* Error/unauthorized state */
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

  /* Tournament not found state */
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
        {/* Header with tournament info */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-4">
            <Shield className="h-8 w-8 text-green-600" />
            <h1 className="text-3xl font-bold">Match Race Score Entry</h1>
          </div>
          <Badge variant="default" className="mb-4">
            &#10003; Secure Access Verified
          </Badge>
          <p className="text-lg text-muted-foreground">
            {tournament.name}
          </p>
          <p className="text-sm text-muted-foreground">
            {new Date(tournament.date).toLocaleDateString()}
          </p>
        </div>

        {/* Player selection (shown when no player is selected) */}
        {!selectedPlayer && (
          <Card className="max-w-2xl mx-auto mb-8">
            <CardHeader>
              <CardTitle>Select Your Player Profile</CardTitle>
              <CardDescription>
                Choose your player name to report your match race results
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

        {/* Selected player view with pending matches */}
        {selectedPlayer && (
          <div className="max-w-6xl mx-auto">
            {/* Player info card */}
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

            {/* Error alert */}
            {error && (
              <Alert variant="destructive" className="mb-6">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {/* Pending matches or empty state */}
            {myMatches.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <Clock className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                  <h3 className="text-lg font-semibold mb-2">No Pending Matches</h3>
                  <p className="text-muted-foreground">
                    You don&apos;t have any pending match races. Check back later for new matches.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-6">
                <div className="flex items-center gap-2">
                  <Flag className="h-6 w-6 text-yellow-600" />
                  <h2 className="text-2xl font-semibold">Your Pending Matches</h2>
                </div>

                {myMatches.map((match) => {
                  const matchRaceResults = raceResults[match.id] || [];
                  const { score1, score2 } = calculateScores(matchRaceResults);

                  return (
                    <Card key={match.id}>
                      <CardHeader>
                        <div className="flex items-center justify-between">
                          <div>
                            <CardTitle className="text-lg">Match #{match.matchNumber}</CardTitle>
                            <CardDescription>
                              TV {match.tvNumber} &bull; {match.stage === 'qualification' ? 'Qualification' : 'Finals'}
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
                          {/* Match players info */}
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

                          {/* Race result entry form */}
                          {!match.completed && (
                            <div className="border-t pt-4">
                              <div className="flex items-center justify-between mb-3">
                                <h4 className="font-medium">Race Results</h4>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => addRaceResult(match.id)}
                                  disabled={matchRaceResults.length >= 5}
                                >
                                  Add Race
                                </Button>
                              </div>

                              {matchRaceResults.length === 0 ? (
                                <div className="text-center py-8 text-muted-foreground">
                                  <Flag className="h-8 w-8 mx-auto mb-2" />
                                  <p>No races added yet. Click &quot;Add Race&quot; to begin.</p>
                                </div>
                              ) : (
                                <div className="space-y-3">
                                  {matchRaceResults.map((result, index) => (
                                    <div key={index} className="grid grid-cols-12 gap-2 items-center">
                                      <div className="col-span-4">
                                        <Select
                                          value={result.course}
                                          onValueChange={(value) => updateRaceResult(match.id, index, 'course', value)}
                                        >
                                          <SelectTrigger>
                                            <SelectValue placeholder="Select course" />
                                          </SelectTrigger>
                                          <SelectContent>
                                            {COURSE_INFO.map((course) => (
                                              <SelectItem key={course.abbr} value={course.abbr}>
                                                {course.name}
                                              </SelectItem>
                                            ))}
                                          </SelectContent>
                                        </Select>
                                      </div>
                                      <div className="col-span-3">
                                        <Input
                                          type="number"
                                          min="1"
                                          max="2"
                                          placeholder="1st"
                                          value={result.position1 || ''}
                                          onChange={(e) => updateRaceResult(match.id, index, 'position1', parseInt(e.target.value) || 0)}
                                        />
                                      </div>
                                      <div className="col-span-3">
                                        <Input
                                          type="number"
                                          min="1"
                                          max="2"
                                          placeholder="2nd"
                                          value={result.position2 || ''}
                                          onChange={(e) => updateRaceResult(match.id, index, 'position2', parseInt(e.target.value) || 0)}
                                        />
                                      </div>
                                      <div className="col-span-2">
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          onClick={() => removeRaceResult(match.id, index)}
                                        >
                                          Remove
                                        </Button>
                                      </div>
                                    </div>
                                  ))}

                                  {/* Current score display */}
                                  <div className="mt-4 p-3 bg-gray-50 rounded-lg">
                                    <div className="font-medium text-center">
                                      Current Score: {score1} - {score2}
                                    </div>
                                  </div>
                                </div>
                              )}

                              <Button
                                onClick={() => handleSubmitMatch(match)}
                                disabled={submitting === match.id || matchRaceResults.length === 0}
                                className="w-full mt-4"
                              >
                                {submitting === match.id ? 'Submitting...' : 'Submit Match Result'}
                              </Button>
                            </div>
                          )}

                          {/* Previous report display */}
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
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Navigation back to game selection */}
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
