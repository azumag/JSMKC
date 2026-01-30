'use client';

/**
 * Time Attack Participant Score Entry Page
 *
 * Public-facing page for tournament participants to enter their own TA times.
 * Access is controlled via a tournament token (no OAuth login required).
 *
 * Flow:
 * 1. Token Validation: Validates the tournament access token from URL query params
 * 2. Player Selection: Participant selects their player profile from the list
 * 3. Time Entry: Participant enters times for each of the 20 courses
 * 4. Submission: Times are saved via the TA API with token authentication
 *
 * Security:
 * - Token-based access (no user authentication needed)
 * - Token is validated on page load and passed with all API calls
 * - All score entries are audit-logged server-side
 *
 * Real-time Updates:
 * - Entry data is polled every 5 seconds to show ranking changes
 * - Participants can see their current rank and total time
 */

import { useState, useEffect, useCallback, use } from 'react';
import { useSearchParams } from 'next/navigation';
import { usePolling } from '@/lib/hooks/usePolling';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Shield, AlertTriangle, Trophy, Users, Timer } from 'lucide-react';
import Link from 'next/link';
import { COURSE_INFO, TOTAL_COURSES } from '@/lib/constants';

/** Player data structure */
interface Player {
  id: string;
  name: string;
  nickname: string;
}

/** Time Trial entry data structure */
interface TTEntry {
  id: string;
  playerId: string;
  stage: string;
  lives: number;
  eliminated: boolean;
  times: Record<string, string> | null;
  totalTime: number | null;
  rank: number | null;
  player: Player;
}

/** Tournament data structure */
interface Tournament {
  id: string;
  name: string;
  date: string;
  status: string;
}

/**
 * Convert milliseconds to display format (M:SS.mmm).
 * Returns "-" for null values.
 */
function msToDisplayTime(ms: number | null): string {
  if (ms === null) return "-";
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  const milliseconds = ms % 1000;
  return `${minutes}:${seconds.toString().padStart(2, "0")}.${milliseconds.toString().padStart(3, "0")}`;
}

/**
 * Convert display time string to milliseconds for preview calculation.
 * Handles the M:SS.mmm format used in input fields.
 */
function displayTimeToMs(timeStr: string): number {
  if (!timeStr) return 0;

  const parts = timeStr.split(':');
  if (parts.length !== 2) return 0;

  const minutes = parseInt(parts[0]) || 0;
  const secondsParts = parts[1].split('.');
  const seconds = parseInt(secondsParts[0]) || 0;
  // Pad milliseconds to 3 digits (e.g., "12" -> "120") for consistent conversion
  const milliseconds = parseInt(secondsParts[1]?.padEnd(3, '0').slice(0, 3)) || 0;

  return minutes * 60 * 1000 + seconds * 1000 + milliseconds;
}

export default function TimeAttackParticipantPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const searchParams = useSearchParams();
  const { id: tournamentId } = use(params);
  const token = searchParams.get('token');

  // === State Management ===
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [entries, setEntries] = useState<TTEntry[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tokenValid, setTokenValid] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const [myEntry, setMyEntry] = useState<TTEntry | null>(null);
  const [timeInputs, setTimeInputs] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  // === Initial Data Fetch ===
  // Validate token and fetch tournament data on mount
  useEffect(() => {
    const validateTokenAndFetchData = async () => {
      if (!token) {
        setError('Access token is required. Please use the full URL provided by tournament organizer.');
        setLoading(false);
        return;
      }

      try {
        // Step 1: Validate the tournament access token
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

        // Step 2: Fetch tournament, entries, and player data in parallel
        const [tournamentResponse, entriesResponse, playersResponse] = await Promise.all([
          fetch(`/api/tournaments/${tournamentId}?token=${token}`),
          fetch(`/api/tournaments/${tournamentId}/ta?token=${token}`),
          fetch('/api/players'),
        ]);

        if (tournamentResponse.ok) {
          const tournamentData = await tournamentResponse.json();
          setTournament(tournamentData);
        }

        if (entriesResponse.ok) {
          const entriesData = await entriesResponse.json();
          setEntries(entriesData.entries || []);
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

  // === Real-time Polling ===
  // Poll entry data every 5 seconds to show ranking updates
  const fetchEntries = useCallback(async () => {
    if (!tokenValid) {
      return { entries: [] };
    }
    const response = await fetch(`/api/tournaments/${tournamentId}/ta/entries?token=${token}`);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return response.json();
  }, [tournamentId, token, tokenValid]);

  const { data: pollingData, error: pollingError } = usePolling(
    fetchEntries, {
    interval: 5000,
    enabled: tokenValid,
  });

  // Update entries when polling data is received
  useEffect(() => {
    if (pollingData && typeof pollingData === 'object' && 'entries' in pollingData) {
      setEntries(pollingData.entries as TTEntry[]);
    }
    if (pollingError) {
      console.error('Polling error:', pollingError);
    }
  }, [pollingData, pollingError]);

  // Sync selected player's entry from the entries list
  useEffect(() => {
    if (selectedPlayer && entries.length > 0) {
      const entry = entries.find(e => e.playerId === selectedPlayer.id && e.stage === 'qualification');
      setMyEntry(entry || null);

      // Pre-fill time inputs from existing entry data
      if (entry && entry.times) {
        setTimeInputs(entry.times);
      } else {
        setTimeInputs({});
      }
    }
  }, [selectedPlayer, entries]);

  // === Event Handlers ===

  /** Handle individual course time input change */
  const handleTimeChange = (course: string, value: string) => {
    setTimeInputs(prev => ({
      ...prev,
      [course]: value,
    }));
  };

  /** Submit all entered times to the server */
  const handleSubmitTimes = async () => {
    if (!myEntry || !selectedPlayer) return;

    // Validate all time inputs before submission
    const validTimes: Record<string, string> = {};
    const totalTimes: number[] = [];

    for (const course of COURSE_INFO) {
      const timeStr = timeInputs[course.abbr];
      if (!timeStr) continue;

      // Validate format M:SS.mmm (strict format for data integrity)
      const timeRegex = /^\d+:[0-5]\d\.\d{3}$/;
      if (!timeRegex.test(timeStr)) {
        setError(`Invalid time format for ${course.abbr}. Please use M:SS.mmm format (e.g., 1:23.456)`);
        return;
      }

      const ms = displayTimeToMs(timeStr);
      if (ms <= 0) {
        setError(`Invalid time for ${course.abbr}. Time must be positive.`);
        return;
      }

      validTimes[course.abbr] = timeStr;
      totalTimes.push(ms);
    }

    if (Object.keys(validTimes).length === 0) {
      setError('Please enter at least one course time.');
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch(`/api/tournaments/${tournamentId}/ta`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-tournament-token': token || '',
        },
        body: JSON.stringify({
          entryId: myEntry.id,
          times: validTimes,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to submit times');
      }

      const data = await response.json();

      // Update local state with server response
      setEntries(prev => prev.map(e =>
        e.id === myEntry.id ? { ...e, ...data.entry } : e
      ));
      setMyEntry({ ...myEntry, ...data.entry });

      // Show success message to participant
      alert("Time trial times submitted successfully!");
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to submit times';
      setError(errorMessage);
    } finally {
      setSubmitting(false);
    }
  };

  // === Helper Functions ===

  /** Count the number of course times entered in the input fields */
  const getEnteredTimesCount = (): number => {
    return Object.values(timeInputs).filter((t) => t && t !== "").length;
  };

  /** Calculate preview total time from current input values */
  const getTotalTime = (): number => {
    return Object.entries(timeInputs)
      .filter(([, timeStr]) => timeStr && timeStr !== "")
      .reduce((total, [, timeStr]) => total + displayTimeToMs(timeStr), 0);
  };

  // === Loading State ===
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

  // === Error / Invalid Token State ===
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

  // === Tournament Not Found State ===
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

  // === Main Render ===
  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        {/* Header with tournament info */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-4">
            <Shield className="h-8 w-8 text-green-600" />
            <h1 className="text-3xl font-bold">Time Attack Score Entry</h1>
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

        {/* Player Selection (shown before player is selected) */}
        {!selectedPlayer && (
          <Card className="max-w-2xl mx-auto mb-8">
            <CardHeader>
              <CardTitle>Select Your Player Profile</CardTitle>
              <CardDescription>
                Choose your player name to enter your time attack times
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

        {/* Selected Player Info and Time Entry */}
        {selectedPlayer && (
          <div className="max-w-4xl mx-auto">
            {/* Player profile header */}
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
                      setMyEntry(null);
                      setTimeInputs({});
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

            {/* Time Entry Form (shown if player has a qualification entry) */}
            {myEntry ? (
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <Timer className="h-5 w-5" />
                        Time Attack Times
                      </CardTitle>
                      <CardDescription>
                        Enter your best times for each course (format: M:SS.mmm)
                      </CardDescription>
                    </div>
                    <div className="text-right">
                      <div className="text-sm text-muted-foreground">Progress</div>
                      <div className="font-mono">
                        {getEnteredTimesCount()} / {TOTAL_COURSES} courses
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-6">
                    {/* Current Stats: Rank and Total Time */}
                    <div className="grid grid-cols-2 gap-4 p-4 bg-gray-50 rounded-lg">
                      <div className="text-center">
                        <div className="text-2xl font-bold font-mono">
                          {myEntry.rank ? `#${myEntry.rank}` : '-'}
                        </div>
                        <div className="text-sm text-muted-foreground">Current Rank</div>
                      </div>
                      <div className="text-center">
                        <div className="text-2xl font-bold font-mono">
                          {msToDisplayTime(myEntry.totalTime)}
                        </div>
                        <div className="text-sm text-muted-foreground">Total Time</div>
                      </div>
                    </div>

                    {/* Time Input Grid: Organized by cup */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {["Mushroom", "Flower", "Star", "Special"].map((cup) => (
                        <Card key={cup}>
                          <CardHeader className="py-3">
                            <CardTitle className="text-sm">{cup} Cup</CardTitle>
                          </CardHeader>
                          <CardContent className="space-y-3">
                            {COURSE_INFO.filter((c) => c.cup === cup).map((course) => (
                              <div key={course.abbr} className="flex items-center gap-2">
                                <Label className="w-12 text-xs font-mono">
                                  {course.abbr}
                                </Label>
                                <Input
                                  type="text"
                                  placeholder="M:SS.mmm"
                                  value={timeInputs[course.abbr] || ''}
                                  onChange={(e) => handleTimeChange(course.abbr, e.target.value)}
                                  className="font-mono text-sm"
                                />
                              </div>
                            ))}
                          </CardContent>
                        </Card>
                      ))}
                    </div>

                    {/* Preview Total Time (calculated from current inputs) */}
                    <div className="p-4 bg-blue-50 rounded-lg">
                      <div className="font-medium text-center mb-2">Preview Total Time</div>
                      <div className="text-2xl font-bold font-mono text-center">
                        {msToDisplayTime(getTotalTime())}
                      </div>
                    </div>

                    <Button
                      onClick={handleSubmitTimes}
                      disabled={submitting || getEnteredTimesCount() === 0}
                      className="w-full"
                    >
                      {submitting ? 'Submitting...' : 'Submit Times'}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : (
              /* Not Registered message (no qualification entry found) */
              <Card>
                <CardContent className="py-12 text-center">
                  <Timer className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                  <h3 className="text-lg font-semibold mb-2">Not Registered for Time Attack</h3>
                  <p className="text-muted-foreground">
                    You are not registered for the time attack competition in this tournament.
                  </p>
                  <p className="text-sm text-muted-foreground mt-2">
                    Contact the tournament organizer to be added to the time attack event.
                  </p>
                </CardContent>
              </Card>
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
