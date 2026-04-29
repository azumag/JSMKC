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
 * - Entry data is polled at the standard interval to show ranking changes
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
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertTriangle, Trophy, Users, Timer, LogIn, Dice5, Lock } from 'lucide-react';
import Link from 'next/link';
import { COURSE_INFO, POLLING_INTERVAL, TOTAL_COURSES } from '@/lib/constants';
import { autoFormatTime, generateRandomTimeString, msToDisplayTime } from '@/lib/ta/time-utils';
import { TA_TIME_ENTRY_CUP_GRID_CLASS, TA_TIME_INPUT_PROPS } from '@/lib/ta/time-entry-layout';
import { toast } from 'sonner';
import { createLogger } from '@/lib/client-logger';
import { fetchWithRetry } from "@/lib/fetch-with-retry";
import type { Player } from "@/lib/types";

/** Client-side logger for error tracking */
const logger = createLogger({ serviceName: 'tournaments-ta-participant' });

/** Time Trial entry data structure */
interface TTEntry {
  id: string;
  playerId: string;
  /** §3.1: Partner player ID for pair running */
  partnerId: string | null;
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

interface TAApiData {
  entries?: TTEntry[];
  frozenStages?: string[];
  qualificationRegistrationLocked?: boolean;
  qualificationEditingLockedForPlayers?: boolean;
  taPlayerSelfEdit?: boolean;
}

/**
 * Convert display time string to milliseconds for preview calculation.
 * Handles the M:SS.mm display format used in input fields.
 * Legacy 3-digit fractional input is still accepted for compatibility.
 */
function displayTimeToMs(timeStr: string): number {
  if (!timeStr) return 0;
  const parts = timeStr.split(':');
  if (parts.length !== 2) return 0;
  const minutes = parseInt(parts[0]) || 0;
  const secondsParts = parts[1].split('.');
  const seconds = parseInt(secondsParts[0]) || 0;
  /* Pad/truncate fractional seconds to 3 digits for consistent ms conversion */
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
  /** Frozen stages from the tournament - when "qualification" is frozen, editing is blocked */
  const [frozenStages, setFrozenStages] = useState<string[]>([]);
  const [qualificationRegistrationLocked, setQualificationRegistrationLocked] = useState(false);
  const [qualificationEditingLockedForPlayers, setQualificationEditingLockedForPlayers] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [myEntry, setMyEntry] = useState<TTEntry | null>(null);
  const [partnerEntry, setPartnerEntry] = useState<TTEntry | null>(null);
  const [timeInputs, setTimeInputs] = useState<Record<string, string>>({});
  const [partnerTimeInputs, setPartnerTimeInputs] = useState<Record<string, string>>({});
  const [taPlayerSelfEdit, setTaPlayerSelfEdit] = useState(true);
  const [submitting, setSubmitting] = useState(false);

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
      
      randomTimes[course.abbr] = generateRandomTimeString(randomMs, randomMs);
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
          fetchWithRetry(`/api/tournaments/${tournamentId}?fields=summary`),
          fetch(`/api/tournaments/${tournamentId}/ta`),
        ]);
        if (tournamentRes.ok) {
          const tJson = await tournamentRes.json();
          // Unwrap createSuccessResponse wrapper: { success, data: tournament }
          setTournament(tJson.data ?? tJson);
        }
        if (entriesRes.ok) {
          const json = await entriesRes.json();
          // Unwrap createSuccessResponse wrapper: { success, data: { entries, ... } }
          const data = (json.data ?? json) as TAApiData;
          setEntries(data.entries || []);
          setFrozenStages(data.frozenStages || []);
          setQualificationRegistrationLocked(Boolean(data.qualificationRegistrationLocked));
          setQualificationEditingLockedForPlayers(Boolean(data.qualificationEditingLockedForPlayers));
          setTaPlayerSelfEdit(data.taPlayerSelfEdit !== false);
        }
      } catch (err) {
        logger.error('Data fetch error:', { error: err, tournamentId });
        setError('Failed to load tournament data.');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [tournamentId, sessionStatus, hasAccess]);

  /** Poll entry data at the standard interval to show ranking updates */
  const fetchEntriesPoll = useCallback(async () => {
    if (!hasAccess) return { entries: [] };
    const response = await fetch(`/api/tournaments/${tournamentId}/ta`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  }, [tournamentId, hasAccess]);

  const { data: pollingData, error: pollingError } = usePolling(
    fetchEntriesPoll, { interval: POLLING_INTERVAL, enabled: hasAccess && !loading }
  );

  useEffect(() => {
    if (pollingData && typeof pollingData === 'object') {
      // Unwrap createSuccessResponse wrapper: { success, data: { entries, ... } }
      const unwrapped = (('data' in pollingData && pollingData.data && typeof pollingData.data === 'object')
        ? pollingData.data
        : pollingData) as TAApiData;
      if ('entries' in unwrapped) {
        setEntries(unwrapped.entries as TTEntry[]);
      }
      if ('frozenStages' in unwrapped) {
        setFrozenStages(unwrapped.frozenStages as string[]);
      }
      if ('qualificationRegistrationLocked' in unwrapped) {
        setQualificationRegistrationLocked(Boolean(unwrapped.qualificationRegistrationLocked));
      }
      if ('qualificationEditingLockedForPlayers' in unwrapped) {
        setQualificationEditingLockedForPlayers(Boolean(unwrapped.qualificationEditingLockedForPlayers));
      }
      if ('taPlayerSelfEdit' in unwrapped) {
        setTaPlayerSelfEdit(unwrapped.taPlayerSelfEdit !== false);
      }
    }
    if (pollingError) logger.error('Polling error:', { error: pollingError, tournamentId });
  }, [pollingData, pollingError, tournamentId]);

  /** Sync own entry and partner entry from the entries list */
  useEffect(() => {
    if (playerId && entries.length > 0) {
      const entry = entries.find(e => e.playerId === playerId && e.stage === 'qualification');
      setMyEntry(entry || null);
      /* Pre-fill time inputs from existing entry data */
      if (entry && entry.times) {
        setTimeInputs(entry.times);
      }
      /* Find partner's entry: if my entry has a partnerId, find that player's entry */
      if (entry?.partnerId) {
        const pEntry = entries.find(e => e.playerId === entry.partnerId && e.stage === 'qualification');
        setPartnerEntry(pEntry || null);
        if (pEntry?.times) {
          setPartnerTimeInputs(pEntry.times);
        }
      } else {
        setPartnerEntry(null);
      }
    }
  }, [playerId, entries]);

  /** Handle individual course time input change */
  const handleTimeChange = (course: string, value: string) => {
    setTimeInputs(prev => ({ ...prev, [course]: value }));
  };

  /** Auto-format time on blur — normalizes input to M:SS.mm */
  const handleTimeBlur = (course: string) => {
    const raw = timeInputs[course];
    if (!raw || raw.trim() === "") return;
    const formatted = autoFormatTime(raw);
    if (formatted !== null && formatted !== raw) {
      setTimeInputs(prev => ({ ...prev, [course]: formatted }));
    }
  };

  /** Handle partner course time input change */
  const handlePartnerTimeChange = (course: string, value: string) => {
    setPartnerTimeInputs(prev => ({ ...prev, [course]: value }));
  };

  /** Auto-format partner time on blur */
  const handlePartnerTimeBlur = (course: string) => {
    const raw = partnerTimeInputs[course];
    if (!raw || raw.trim() === "") return;
    const formatted = autoFormatTime(raw);
    if (formatted !== null && formatted !== raw) {
      setPartnerTimeInputs(prev => ({ ...prev, [course]: formatted }));
    }
  };

  /** Submit all entered times to the server */
  const handleSubmitTimes = async () => {
    if (!myEntry || !playerId) return;

    const validTimes: Record<string, string> = {};
    for (const course of COURSE_INFO) {
      const timeStr = timeInputs[course.abbr];
      if (!timeStr) continue;

      /* Official display format is M:SS.mm; accept legacy 3-digit fractions too */
      const timeRegex = /^\d+:[0-5]\d\.\d{1,3}$/;
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

      const json = await response.json();
      // Unwrap createSuccessResponse wrapper: { success, data: { entry } }
      const data = json.data ?? json;
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

  /** Submit partner's times to the server */
  const handleSubmitPartnerTimes = async () => {
    if (!partnerEntry || !playerId) return;

    const validTimes: Record<string, string> = {};
    for (const course of COURSE_INFO) {
      const timeStr = partnerTimeInputs[course.abbr];
      if (!timeStr) continue;
      const timeRegex = /^\d+:[0-5]\d\.\d{1,3}$/;
      if (!timeRegex.test(timeStr)) {
        setError(tPart('invalidTimeFormat', { course: course.abbr }));
        return;
      }
      const ms = displayTimeToMs(timeStr);
      if (ms <= 0) {
        setError(tPart('invalidTime', { course: course.abbr }));
        return;
      }
      validTimes[course.abbr] = timeStr;
    }

    if (Object.keys(validTimes).length === 0) {
      setError(tPart('enterAtLeastOne'));
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch(`/api/tournaments/${tournamentId}/ta`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entryId: partnerEntry.id, times: validTimes }),
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to submit partner times');
      }
      const json = await response.json();
      const data = json.data ?? json;
      setEntries(prev => prev.map(e => e.id === partnerEntry.id ? { ...e, ...data.entry } : e));
      setPartnerEntry({ ...partnerEntry, ...data.entry });
      alert(tPart('partnerTimesSubmittedSuccess'));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit partner times');
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

      const json = await response.json();
      /* Unwrap createSuccessResponse wrapper: { success, data: { entries } } */
      const data = json.data ?? json;
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

  const qualificationEditingLocked = !isAdmin && qualificationEditingLockedForPlayers;
  const showQualificationRegistrationLockedToast = () => {
    toast.info(tTa('qualificationRegistrationLocked'));
  };

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

          {/* Frozen stage warning: shown when qualification is locked by admin */}
          {frozenStages.includes("qualification") && (
            <Alert className="mb-6 border-destructive/50 bg-destructive/5">
              <Lock className="h-4 w-4 text-destructive" />
              <AlertDescription className="text-destructive">
                {tTa('stageFrozen')}
              </AlertDescription>
            </Alert>
          )}

          {qualificationEditingLocked && (
            <Alert className="mb-6 border-destructive/50 bg-destructive/5">
              <Lock className="h-4 w-4 text-destructive" />
              <AlertDescription className="text-destructive">
                {tPart('qualificationEditingLockedAfterKnockout')}
              </AlertDescription>
            </Alert>
          )}

          {/* Time Entry Forms (shown if player has a qualification entry) */}
          {myEntry ? (
            <div className="space-y-6">
              {/* Partner Entry Form: shown when paired with another player */}
              {partnerEntry && (
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="flex items-center gap-2">
                          <Users className="h-5 w-5" />
                          {tPart('partnerTimesTitle', { name: partnerEntry.player.nickname })}
                        </CardTitle>
                        <CardDescription>{tPart('partnerTimesDesc')}</CardDescription>
                      </div>
                      <div className="text-right">
                        <div className="font-mono">{tPart('taProgress', {
                          count: Object.values(partnerTimeInputs).filter(t => t && t !== "").length,
                          total: TOTAL_COURSES,
                        })}</div>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-6">
                      {/* Partner Stats */}
                      <div className="grid grid-cols-2 gap-4 p-4 bg-gray-50 rounded-lg">
                        <div className="text-center">
                          <div className="text-2xl font-bold font-mono">{partnerEntry.rank ? `#${partnerEntry.rank}` : '-'}</div>
                          <div className="text-sm text-muted-foreground">{tPart('currentRank')}</div>
                        </div>
                        <div className="text-center">
                          <div className="text-2xl font-bold font-mono">{msToDisplayTime(partnerEntry.totalTime)}</div>
                          <div className="text-sm text-muted-foreground">{tTa('totalTime')}</div>
                        </div>
                      </div>

                      {/* Partner Time Input Grid */}
                      <div className={TA_TIME_ENTRY_CUP_GRID_CLASS}>
                        {["Mushroom", "Flower", "Star", "Special"].map((cup) => (
                          <Card key={cup}>
                            <CardHeader className="py-3">
                              <CardTitle className="text-sm">{tTa('cup', { cup })}</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-3">
                              {COURSE_INFO.filter((c) => c.cup === cup).map((course) => (
                                <div key={course.abbr} className="flex items-center gap-2">
                                  <Label className="w-12 text-xs font-mono">{course.abbr}</Label>
                                  <Input
                                    type="text"
                                    {...TA_TIME_INPUT_PROPS}
                                    placeholder="M:SS.mm"
                                    value={partnerTimeInputs[course.abbr] || ''}
                                    onChange={(e) => handlePartnerTimeChange(course.abbr, e.target.value)}
                                    onBlur={() => handlePartnerTimeBlur(course.abbr)}
                                    disabled={frozenStages.includes("qualification") || qualificationEditingLocked}
                                    className="font-mono text-sm"
                                  />
                                </div>
                              ))}
                            </CardContent>
                          </Card>
                        ))}
                      </div>

                      {/* Partner Preview Total Time */}
                      <div className="p-4 bg-blue-50 rounded-lg">
                        <div className="font-medium text-center mb-2">{tPart('previewTotalTime')}</div>
                        <div className="text-2xl font-bold font-mono text-center">{msToDisplayTime(
                          Object.entries(partnerTimeInputs)
                            .filter(([, t]) => t && t !== "")
                            .reduce((sum, [, t]) => sum + displayTimeToMs(t), 0)
                        )}</div>
                      </div>

                      <Button
                        onClick={handleSubmitPartnerTimes}
                        disabled={submitting || Object.values(partnerTimeInputs).filter(t => t && t !== "").length === 0
                          || frozenStages.includes("qualification") || qualificationEditingLocked}
                        className="w-full"
                      >
                        {submitting ? tCommon('saving') : tPart('submitTimes')}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Self-edit disabled notice */}
              {!taPlayerSelfEdit && partnerEntry && (
                <Alert className="border-amber-500/50 bg-amber-50">
                  <Lock className="h-4 w-4 text-amber-600" />
                  <AlertDescription className="text-amber-700">
                    {tPart('selfEditDisabled')}
                  </AlertDescription>
                </Alert>
              )}

              {/* Own Entry Form: editable when taPlayerSelfEdit is true or no partner */}
              {(taPlayerSelfEdit || !partnerEntry) && (
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="flex items-center gap-2">
                          <Timer className="h-5 w-5" />
                          {partnerEntry ? tPart('myTimesTitle') : tTa('title')}
                        </CardTitle>
                        <CardDescription>
                          {tTa('enterTimeCourseDesc')}
                        </CardDescription>
                      </div>
                      <div className="text-right">
                        <div className="font-mono">{tPart('taProgress', { count: getEnteredTimesCount(), total: TOTAL_COURSES })}</div>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-6">
                      {/* Current Stats */}
                      <div className="grid grid-cols-2 gap-4 p-4 bg-gray-50 rounded-lg">
                        <div className="text-center">
                          <div className="text-2xl font-bold font-mono">{myEntry.rank ? `#${myEntry.rank}` : '-'}</div>
                          <div className="text-sm text-muted-foreground">{tPart('currentRank')}</div>
                        </div>
                        <div className="text-center">
                          <div className="text-2xl font-bold font-mono">{msToDisplayTime(myEntry.totalTime)}</div>
                          <div className="text-sm text-muted-foreground">{tTa('totalTime')}</div>
                        </div>
                      </div>

                      {/* Time Input Grid */}
                      <div className={TA_TIME_ENTRY_CUP_GRID_CLASS}>
                        {["Mushroom", "Flower", "Star", "Special"].map((cup) => (
                          <Card key={cup}>
                            <CardHeader className="py-3">
                              <CardTitle className="text-sm">{tTa('cup', { cup })}</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-3">
                              {COURSE_INFO.filter((c) => c.cup === cup).map((course) => (
                                <div key={course.abbr} className="flex items-center gap-2">
                                  <Label className="w-12 text-xs font-mono">{course.abbr}</Label>
                                  <Input
                                    type="text"
                                    {...TA_TIME_INPUT_PROPS}
                                    placeholder="M:SS.mm"
                                    value={timeInputs[course.abbr] || ''}
                                    onChange={(e) => handleTimeChange(course.abbr, e.target.value)}
                                    onBlur={() => handleTimeBlur(course.abbr)}
                                    disabled={frozenStages.includes("qualification") || qualificationEditingLocked}
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
                        <div className="font-medium text-center mb-2">{tPart('previewTotalTime')}</div>
                        <div className="text-2xl font-bold font-mono text-center">{msToDisplayTime(getTotalTime())}</div>
                      </div>

                      {/* Admin-only: Fill random times button */}
                      {isAdmin && myEntry && (
                        <Button
                          onClick={handleFillRandomTimes}
                          variant="outline"
                          disabled={submitting}
                          className="w-full border-dashed border-orange-400 text-orange-600 hover:bg-orange-50"
                        >
                          <Dice5 className="h-4 w-4 mr-2" />
                          Fill Random Times
                        </Button>
                      )}

                      <Button
                        onClick={handleSubmitTimes}
                        disabled={submitting || getEnteredTimesCount() === 0 || frozenStages.includes("qualification") || qualificationEditingLocked}
                        className="w-full"
                      >
                        {submitting ? tCommon('saving') : tPart('submitTimes')}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Read-only view of own times when self-edit is disabled */}
              {!taPlayerSelfEdit && partnerEntry && (
                <Card className="opacity-75">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Lock className="h-4 w-4 text-muted-foreground" />
                      {tPart('myTimesReadOnly')}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 gap-4 p-4 bg-gray-50 rounded-lg mb-4">
                      <div className="text-center">
                        <div className="text-2xl font-bold font-mono">{myEntry.rank ? `#${myEntry.rank}` : '-'}</div>
                        <div className="text-sm text-muted-foreground">{tPart('currentRank')}</div>
                      </div>
                      <div className="text-center">
                        <div className="text-2xl font-bold font-mono">{msToDisplayTime(myEntry.totalTime)}</div>
                        <div className="text-sm text-muted-foreground">{tTa('totalTime')}</div>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                      {COURSE_INFO.map((course) => (
                        <div key={course.abbr} className="flex items-center gap-2 text-sm">
                          <span className="font-mono text-xs w-8">{course.abbr}</span>
                          <span className="font-mono">{myEntry.times?.[course.abbr] || '-'}</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
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
                <Button
                  onClick={() => {
                    if (qualificationRegistrationLocked) {
                      showQualificationRegistrationLockedToast();
                      return;
                    }
                    void handleAddToTimeAttack();
                  }}
                  disabled={submitting}
                  aria-disabled={qualificationRegistrationLocked}
                  title={qualificationRegistrationLocked ? tTa('qualificationRegistrationLocked') : undefined}
                  className={`w-full max-w-xs mx-auto ${qualificationRegistrationLocked ? 'cursor-not-allowed opacity-50' : ''}`}
                >
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
