/**
 * Match Race Participant Score Entry Page
 *
 * Session-authenticated page for participants to self-report MR match results.
 * Player is auto-identified from session — no manual "select yourself" step.
 *
 * Both players must independently report matching scores for auto-confirmation.
 *
 * Features:
 * - Player session authentication (nickname + password)
 * - Auto-identification from session.user.playerId
 * - Race result entry with course selection
 * - Auto-calculated scores from race results
 * - Previous report display
 * - Real-time polling for match updates (5s interval)
 *
 * @route /tournaments/[id]/mr/participant
 */
'use client';

import { useState, useEffect, useCallback, use } from 'react';
import { useSession } from 'next-auth/react';
import { usePolling } from '@/lib/hooks/usePolling';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertTriangle, Trophy, CheckCircle, Clock, Users, Flag, LogIn } from 'lucide-react';
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
  player1ReportedPoints1?: number;
  player1ReportedPoints2?: number;
  player2ReportedPoints1?: number;
  player2ReportedPoints2?: number;
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
  const { id: tournamentId } = use(params);
  const { data: session, status: sessionStatus } = useSession();

  const playerId = session?.user?.playerId;
  const isPlayer = session?.user?.userType === 'player';
  const isAdmin = session?.user?.role === 'admin';
  const hasAccess = isPlayer || isAdmin;

  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [matches, setMatches] = useState<MRMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [myMatches, setMyMatches] = useState<MRMatch[]>([]);
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [raceResults, setRaceResults] = useState<{ [key: string]: RaceResult[] }>({});

  /** Fetch initial data on mount */
  useEffect(() => {
    if (sessionStatus === 'loading') return;
    if (!hasAccess) { setLoading(false); return; }

    const fetchData = async () => {
      try {
        const [tournamentRes, matchesRes] = await Promise.all([
          fetch(`/api/tournaments/${tournamentId}`),
          fetch(`/api/tournaments/${tournamentId}/mr`),
        ]);
        if (tournamentRes.ok) setTournament(await tournamentRes.json());
        if (matchesRes.ok) {
          const data = await matchesRes.json();
          setMatches(data.matches || []);
        }
      } catch (err) {
        console.error('Data fetch error:', err);
        setError('Failed to load tournament data.');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [tournamentId, sessionStatus, hasAccess]);

  /** Real-time polling for match data updates */
  const fetchMatchesPoll = useCallback(async () => {
    if (!hasAccess) return { matches: [] };
    const response = await fetch(`/api/tournaments/${tournamentId}/mr`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  }, [tournamentId, hasAccess]);

  const { data: pollingData, error: pollingError } = usePolling(
    fetchMatchesPoll, { interval: 5000, enabled: hasAccess && !loading }
  );

  useEffect(() => {
    if (pollingData && typeof pollingData === 'object' && 'matches' in pollingData) {
      setMatches(pollingData.matches as MRMatch[]);
    }
    if (pollingError) console.error('Polling error:', pollingError);
  }, [pollingData, pollingError]);

  /* Filter matches for the current player (only pending ones) */
  useEffect(() => {
    if (playerId && matches.length > 0) {
      const playerMatches = matches.filter(match =>
        !match.completed &&
        (match.player1.id === playerId || match.player2.id === playerId)
      );
      setMyMatches(playerMatches);

      /* Initialize empty race results for new matches */
      const initialResults: { [key: string]: RaceResult[] } = {};
      playerMatches.forEach(match => {
        if (!raceResults[match.id]) {
          initialResults[match.id] = [];
        }
      });
      if (Object.keys(initialResults).length > 0) {
        setRaceResults(prev => ({ ...prev, ...initialResults }));
      }
    }
  }, [playerId, matches]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Add an empty race result slot for a match */
  const addRaceResult = (matchId: string) => {
    setRaceResults(prev => ({
      ...prev,
      [matchId]: [...(prev[matchId] || []), { course: '', position1: 0, position2: 0 }],
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
  const calculateScores = (results: RaceResult[]): { score1: number; score2: number } => {
    let score1 = 0;
    let score2 = 0;
    results.forEach(result => {
      if (result.position1 < result.position2) score1++;
      else if (result.position2 < result.position1) score2++;
    });
    return { score1, score2 };
  };

  /** Submit a match result report */
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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId, score1, score2, races: matchRaceResults }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to submit match result');
      }

      const data = await response.json();
      setRaceResults(prev => ({ ...prev, [match.id]: [] }));
      setMatches(prev => prev.map(m => m.id === match.id ? { ...m, ...data.match } : m));
      alert("Match result reported successfully! Both players must report matching results for confirmation.");
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit match result');
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
          <p className="text-lg">Loading tournament data...</p>
        </div>
      </div>
    );
  }

  /* Not logged in — show login prompt */
  if (!hasAccess) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <LogIn className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <CardTitle>Player Login Required</CardTitle>
            <CardDescription>Please log in with your player credentials to report scores</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button asChild className="w-full"><Link href="/auth/signin">Log In</Link></Button>
            <p className="text-sm text-muted-foreground text-center">
              Use the nickname and password provided by the tournament organizer.
            </p>
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
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold mb-2">Match Race Score Entry</h1>
          <p className="text-lg text-muted-foreground">{tournament.name}</p>
          <p className="text-sm text-muted-foreground">{new Date(tournament.date).toLocaleDateString()}</p>
        </div>

        <div className="max-w-6xl mx-auto">
          {/* Player info card (auto-identified) */}
          <Card className="mb-6">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <Users className="h-8 w-8 text-blue-600" />
                <div>
                  <h3 className="font-semibold">{session?.user?.nickname || session?.user?.name}</h3>
                  <p className="text-sm text-muted-foreground">Logged in as player</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {error && (
            <Alert variant="destructive" className="mb-6">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

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
                            <CheckCircle className="h-3 w-3 mr-1" />Completed
                          </Badge>
                        ) : (
                          <Badge variant="outline">
                            <Clock className="h-3 w-3 mr-1" />Pending
                          </Badge>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        {/* Match players info */}
                        <div className="grid grid-cols-2 gap-4">
                          <div className={`p-3 rounded-lg border ${match.player1.id === playerId ? 'bg-blue-50 border-blue-200' : 'bg-gray-50 border-gray-200'}`}>
                            <div className="font-medium">
                              {match.player1.nickname}
                              {match.player1.id === playerId && (
                                <Badge variant="default" className="ml-2 bg-blue-600">You</Badge>
                              )}
                            </div>
                            <div className="text-sm text-muted-foreground">Controller {match.player1Side}</div>
                          </div>
                          <div className={`p-3 rounded-lg border ${match.player2.id === playerId ? 'bg-blue-50 border-blue-200' : 'bg-gray-50 border-gray-200'}`}>
                            <div className="font-medium">
                              {match.player2.nickname}
                              {match.player2.id === playerId && (
                                <Badge variant="default" className="ml-2 bg-blue-600">You</Badge>
                              )}
                            </div>
                            <div className="text-sm text-muted-foreground">Controller {match.player2Side}</div>
                          </div>
                        </div>

                        {/* Race result entry form */}
                        {!match.completed && (
                          <div className="border-t pt-4">
                            <div className="flex items-center justify-between mb-3">
                              <h4 className="font-medium">Race Results</h4>
                              <Button size="sm" variant="outline" onClick={() => addRaceResult(match.id)} disabled={matchRaceResults.length >= 5}>
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
                                      <Select value={result.course} onValueChange={(value) => updateRaceResult(match.id, index, 'course', value)}>
                                        <SelectTrigger><SelectValue placeholder="Select course" /></SelectTrigger>
                                        <SelectContent>
                                          {COURSE_INFO.map((course) => (
                                            <SelectItem key={course.abbr} value={course.abbr}>{course.name}</SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
                                    </div>
                                    <div className="col-span-3">
                                      <Input type="number" min="1" max="2" placeholder="1st" value={result.position1 || ''} onChange={(e) => updateRaceResult(match.id, index, 'position1', parseInt(e.target.value) || 0)} />
                                    </div>
                                    <div className="col-span-3">
                                      <Input type="number" min="1" max="2" placeholder="2nd" value={result.position2 || ''} onChange={(e) => updateRaceResult(match.id, index, 'position2', parseInt(e.target.value) || 0)} />
                                    </div>
                                    <div className="col-span-2">
                                      <Button size="sm" variant="ghost" onClick={() => removeRaceResult(match.id, index)}>Remove</Button>
                                    </div>
                                  </div>
                                ))}
                                <div className="mt-4 p-3 bg-gray-50 rounded-lg">
                                  <div className="font-medium text-center">Current Score: {score1} - {score2}</div>
                                </div>
                              </div>
                            )}

                            <Button onClick={() => handleSubmitMatch(match)} disabled={submitting === match.id || matchRaceResults.length === 0} className="w-full mt-4">
                              {submitting === match.id ? 'Submitting...' : 'Submit Match Result'}
                            </Button>
                          </div>
                        )}

                        {/* Previous report display */}
                        {(match.player1ReportedPoints1 !== undefined || match.player2ReportedPoints1 !== undefined) && (
                          <div className="border-t pt-4">
                            <h4 className="font-medium mb-2">Previous Reports</h4>
                            <div className="space-y-2 text-sm">
                              {match.player1ReportedPoints1 !== undefined && (
                                <div className="flex justify-between p-2 bg-gray-50 rounded">
                                  <span>{match.player1.nickname} reported:</span>
                                  <span className="font-mono">{match.player1ReportedPoints1} - {match.player1ReportedPoints2}</span>
                                </div>
                              )}
                              {match.player2ReportedPoints1 !== undefined && (
                                <div className="flex justify-between p-2 bg-gray-50 rounded">
                                  <span>{match.player2.nickname} reported:</span>
                                  <span className="font-mono">{match.player2ReportedPoints1} - {match.player2ReportedPoints2}</span>
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

        <div className="text-center mt-8">
          <Button variant="outline" asChild>
            <Link href={`/tournaments/${tournamentId}/participant`}>Back to Game Selection</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
