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
 *
 * i18n:
 * - All user-facing strings use next-intl translations
 * - Namespaces: participant, ta, common
 */

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
import { AlertTriangle, Trophy, Users, Timer, LogIn, Dice5 } from 'lucide-react';
import Link from 'next/link';
import { COURSE_INFO, TOTAL_COURSES } from '@/lib/constants';
import { toast } from 'sonner';

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

  /** i18n: Translation hooks placed before any state/effect hooks per Rules of Hooks */
  const tPart = useTranslations('participant');
  const tTa = useTranslations('ta');
  const tCommon = useTranslations('common');

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

  /**
   * Detect if running in local development environment.
   * Used to enable admin-only development tools.
   * Checks both hostname and port for common dev server setups.
   */
  const isDevelopment = typeof window !== 'undefined' && 
    (window.location.hostname === 'localhost' || 
     window.location.hostname === '127.0.0.1' ||
     window.location.port === '3000' ||
     window.location.port === '3001');

  /**
   * Admin-only: Fill all course times with random values for testing.
   * Generates realistic TA times between 45s and 3:30 per course.
   * Only available in development environment.
   */
  const handleFillRandomTimes = () => {
    const randomTimes: Record<string, string> = {};
    
    COURSE_INFO.forEach((course) => {
      // Generate random time between 45 seconds and 3 minutes 30 seconds
      const minMs = 45000; // 45 seconds
      const maxMs = 210000; // 3:30
      const randomMs = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
      
      // Convert to M:SS.mmm format
      const minutes = Math.floor(randomMs / 60000);
      const seconds = Math.floor((randomMs % 60000) / 1000);
      const milliseconds = randomMs % 1000;
      
      randomTimes[course.abbr] = `${minutes}:${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(3, '0')}`;
    });
    
    setTimeInputs(randomTimes);
    toast.success('Random times filled for all courses');
  };

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
        /** i18n: Show localized validation error with course abbreviation */
        setError(tPart('invalidTimeFormat', { course: course.abbr }));
        return;
      }

      const ms = displayTimeToMs(timeStr);
      if (ms <= 0) {
        /** i18n: Show localized error for non-positive time values */
        setError(tPart('invalidTime', { course: course.abbr }));
        return;
      }
      validTimes[course.abbr] = timeStr;
    }

    if (Object.keys(validTimes).length === 0) {
      /** i18n: Require at least one course time before submission */
      setError(tPart('enterAtLeastOne'));
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
      /** i18n: Success alert after times are submitted */
      alert(tPart('timesSubmittedSuccess'));
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
      /** i18n: Success alert after adding self to time attack */
      alert(tPart('addedToTASuccess'));
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

  /** i18n: Loading state uses translated string */
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

  /** i18n: Login required card uses translated strings for title, description, button, and help text */
  if (!hasAccess) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <LogIn className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <CardTitle>{tPart('playerLoginRequired')}</CardTitle>
            <CardDescription>{tPart('loginToEnterTimes')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button asChild className="w-full"><Link href="/auth/signin">{tPart('logIn')}</Link></Button>
            <p className="text-sm text-muted-foreground text-center">
              {tPart('loginHelp')}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  /** i18n: Tournament not found card uses translated title */
  if (!tournament) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <Trophy className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <CardTitle>{tPart('tournamentNotFound')}</CardTitle>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        <div className="text-center mb-8">
          {/** i18n: Page title from participant namespace */}
          <h1 className="text-3xl font-bold mb-2">{tPart('taTitle')}</h1>
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
                  {/** i18n: Player login status label */}
                  <p className="text-sm text-muted-foreground">{tPart('loggedInAsPlayer')}</p>
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
                    {/** i18n: Card title and description use ta namespace for "Time Attack Times" */}
                    <CardTitle className="flex items-center gap-2">
                      <Timer className="h-5 w-5" />
                      {tTa('title')}
                    </CardTitle>
                    <CardDescription>
                      {tTa('enterTimeCourseDesc')}
                    </CardDescription>
                  </div>
                  <div className="text-right">
                    {/** i18n: Progress counter with interpolated count/total */}
                    <div className="font-mono">{tPart('taProgress', { count: getEnteredTimesCount(), total: TOTAL_COURSES })}</div>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  {/* Current Stats: Rank and Total Time */}
                  <div className="grid grid-cols-2 gap-4 p-4 bg-gray-50 rounded-lg">
                    <div className="text-center">
                      <div className="text-2xl font-bold font-mono">{myEntry.rank ? `#${myEntry.rank}` : '-'}</div>
                      {/** i18n: "Current Rank" label */}
                      <div className="text-sm text-muted-foreground">{tPart('currentRank')}</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold font-mono">{msToDisplayTime(myEntry.totalTime)}</div>
                      {/** i18n: "Total Time" label from ta namespace */}
                      <div className="text-sm text-muted-foreground">{tTa('totalTime')}</div>
                    </div>
                  </div>

                  {/* Time Input Grid: Organized by cup */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {["Mushroom", "Flower", "Star", "Special"].map((cup) => (
                      <Card key={cup}>
                        <CardHeader className="py-3">
                          {/** i18n: Cup name with interpolated cup parameter */}
                          <CardTitle className="text-sm">{tTa('cup', { cup })}</CardTitle>
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
                    {/** i18n: "Preview Total Time" heading */}
                    <div className="font-medium text-center mb-2">{tPart('previewTotalTime')}</div>
                    <div className="text-2xl font-bold font-mono text-center">{msToDisplayTime(getTotalTime())}</div>
                  </div>

                  {/* Admin-only: Fill random times button (development only) */}
                  {isAdmin && isDevelopment && myEntry && (
                    <Button
                      onClick={handleFillRandomTimes}
                      variant="outline"
                      disabled={submitting}
                      className="w-full border-dashed border-orange-400 text-orange-600 hover:bg-orange-50"
                    >
                      <Dice5 className="h-4 w-4 mr-2" />
                      Fill Random Times (Dev Only)
                    </Button>
                  )}

                  {/** i18n: Submit button toggles between "Submitting..." (common.saving) and "Submit Times" */}
                  <Button onClick={handleSubmitTimes} disabled={submitting || getEnteredTimesCount() === 0} className="w-full">
                    {submitting ? tCommon('saving') : tPart('submitTimes')}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            /* Not Registered message (no qualification entry found) */
            <Card>
              <CardContent className="py-12 text-center">
                <Timer className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                {/** i18n: Not registered title and description */}
                <h3 className="text-lg font-semibold mb-2">{tPart('notRegisteredTA')}</h3>
                <p className="text-muted-foreground mb-4">
                  {tPart('notRegisteredTADesc')}
                </p>
                {/** i18n: Add to TA button toggles between "Adding..." and "Add to Time Attack" */}
                <Button onClick={handleAddToTimeAttack} disabled={submitting} className="w-full max-w-xs mx-auto">
                  {submitting ? tPart('adding') : tPart('addToTA')}
                </Button>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="text-center mt-8">
          {/** i18n: Back navigation button */}
          <Button variant="outline" asChild>
            <Link href={`/tournaments/${tournamentId}/participant`}>{tPart('backToGameSelection')}</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
