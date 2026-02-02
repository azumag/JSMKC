'use client';

/**
 * Time Attack Participant Score Entry Page
 *
 * Session-authenticated page for tournament participants to enter their TA times.
 * Player is auto-identified from session — no manual "select yourself" step.
 *
 * Flow:
 * 1. Verify player session authentication
 * 2. Auto-identify from session.user.playerId
 * 3. Time Entry: Participant enters times for each of the 20 courses
 * 4. Submission: Times are saved via the TA API with session authentication
 *
 * Security:
 * - Player session authentication via NextAuth credentials provider
 * - All score entries are audit-logged server-side
 *
 * Real-time Updates:
 * - Entry data is polled every 5 seconds to show ranking changes
 * - Participants can see their current rank and total time
 */

import { useState, useEffect, useCallback, use } from 'react';
import { useSession } from 'next-auth/react';
import { usePolling } from '@/lib/hooks/usePolling';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertTriangle, Trophy, Users, Timer, LogIn } from 'lucide-react';
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
  /* Pad milliseconds to 3 digits (e.g., "12" -> "120") for consistent conversion */
  const milliseconds = parseInt(secondsParts[1]?.padEnd(3, '0').slice(0, 3)) || 0;
  return minutes * 60 * 1000 + seconds * 1000 + milliseconds;
}

export default function TimeAttackParticipantPage({
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
  const [entries, setEntries] = useState<TTEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [myEntry, setMyEntry] = useState<TTEntry | null>(null);
  const [timeInputs, setTimeInputs] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  /** Fetch initial data on mount */
  useEffect(() => {
    if (sessionStatus === 'loading') return;
    if (!hasAccess) { setLoading(false); return; }

    const fetchData = async () => {
      try {
        const [tournamentRes, entriesRes] = await Promise.all([
          fetch(`/api/tournaments/${tournamentId}`),
          fetch(`/api/tournaments/${tournamentId}/ta`),
        ]);
        if (tournamentRes.ok) setTournament(await tournamentRes.json());
        if (entriesRes.ok) {
          const data = await entriesRes.json();
          setEntries(data.entries || []);
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

  /** Poll entry data every 5 seconds to show ranking updates */
  const fetchEntriesPoll = useCallback(async () => {
    if (!hasAccess) return { entries: [] };
    const response = await fetch(`/api/tournaments/${tournamentId}/ta`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  }, [tournamentId, hasAccess]);

  const { data: pollingData, error: pollingError } = usePolling(
    fetchEntriesPoll, { interval: 5000, enabled: hasAccess && !loading }
  );

  useEffect(() => {
    if (pollingData && typeof pollingData === 'object' && 'entries' in pollingData) {
      setEntries(pollingData.entries as TTEntry[]);
    }
    if (pollingError) console.error('Polling error:', pollingError);
  }, [pollingData, pollingError]);

  /** Sync selected player's entry from the entries list */
  useEffect(() => {
    if (playerId && entries.length > 0) {
      const entry = entries.find(e => e.playerId === playerId && e.stage === 'qualification');
      setMyEntry(entry || null);
      /* Pre-fill time inputs from existing entry data */
      if (entry && entry.times) {
        setTimeInputs(entry.times);
      }
    }
  }, [playerId, entries]);

  /** Handle individual course time input change */
  const handleTimeChange = (course: string, value: string) => {
    setTimeInputs(prev => ({ ...prev, [course]: value }));
  };

  /** Submit all entered times to the server */
  const handleSubmitTimes = async () => {
    if (!myEntry || !playerId) return;

    const validTimes: Record<string, string> = {};
    for (const course of COURSE_INFO) {
      const timeStr = timeInputs[course.abbr];
      if (!timeStr) continue;

      /* Validate format M:SS.mmm (strict format for data integrity) */
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
    }

    if (Object.keys(validTimes).length === 0) {
      setError('Please enter at least one course time.');
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch(`/api/tournaments/${tournamentId}/ta`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entryId: myEntry.id, times: validTimes }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to submit times');
      }

      const data = await response.json();
      setEntries(prev => prev.map(e => e.id === myEntry.id ? { ...e, ...data.entry } : e));
      setMyEntry({ ...myEntry, ...data.entry });
      alert("Time trial times submitted successfully!");
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit times');
    } finally {
      setSubmitting(false);
    }
  };

  /** Add self to time attack competition */
  const handleAddToTimeAttack = async () => {
    if (!playerId) return;

    setSubmitting(true);
    try {
      const response = await fetch(`/api/tournaments/${tournamentId}/ta`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to add to time attack');
      }

      const data = await response.json();
      setEntries(prev => [...prev, ...data.entries]);
      alert("Successfully added to time attack!");
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add to time attack');
    } finally {
      setSubmitting(false);
    }
  };

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

  if (!hasAccess) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <LogIn className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <CardTitle>Player Login Required</CardTitle>
            <CardDescription>Please log in with your player credentials to enter times</CardDescription>
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
          <h1 className="text-3xl font-bold mb-2">Time Attack Score Entry</h1>
          <p className="text-lg text-muted-foreground">{tournament.name}</p>
          <p className="text-sm text-muted-foreground">{new Date(tournament.date).toLocaleDateString()}</p>
        </div>

        <div className="max-w-4xl mx-auto">
          {/* Player profile header (auto-identified) */}
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
                    <div className="font-mono">{getEnteredTimesCount()} / {TOTAL_COURSES} courses</div>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  {/* Current Stats: Rank and Total Time */}
                  <div className="grid grid-cols-2 gap-4 p-4 bg-gray-50 rounded-lg">
                    <div className="text-center">
                      <div className="text-2xl font-bold font-mono">{myEntry.rank ? `#${myEntry.rank}` : '-'}</div>
                      <div className="text-sm text-muted-foreground">Current Rank</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold font-mono">{msToDisplayTime(myEntry.totalTime)}</div>
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
                              <Label className="w-12 text-xs font-mono">{course.abbr}</Label>
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

                  {/* Preview Total Time */}
                  <div className="p-4 bg-blue-50 rounded-lg">
                    <div className="font-medium text-center mb-2">Preview Total Time</div>
                    <div className="text-2xl font-bold font-mono text-center">{msToDisplayTime(getTotalTime())}</div>
                  </div>

                  <Button onClick={handleSubmitTimes} disabled={submitting || getEnteredTimesCount() === 0} className="w-full">
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
                <p className="text-muted-foreground mb-4">
                  You are not registered for the time attack competition in this tournament.
                </p>
                <Button onClick={handleAddToTimeAttack} disabled={submitting} className="w-full max-w-xs mx-auto">
                  {submitting ? 'Adding...' : 'Add to Time Attack'}
                </Button>
              </CardContent>
            </Card>
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
