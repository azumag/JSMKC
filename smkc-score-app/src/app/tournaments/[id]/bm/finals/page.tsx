/**
 * Battle Mode Finals Page
 *
 * Admin-facing page for managing the BM double-elimination finals bracket.
 * Displays the bracket visualization and provides controls for:
 * - Generating the finals bracket from qualification results
 * - Resetting the bracket to regenerate from current standings
 * - Entering/editing match scores within the bracket
 * - Detecting and displaying tournament completion and champion
 *
 * The double-elimination bracket structure:
 * - Winners Bracket: Players advance until they lose once
 * - Losers Bracket: Eliminated players get a second chance
 * - Grand Final: Winners champion vs Losers champion
 * - Reset Match: If losers champion wins Grand Final, a deciding match is played
 *
 * Features:
 * - Real-time polling for bracket updates
 * - Confirmation dialogs for destructive actions (generate/reset)
 * - Score entry dialog with round-based validation
 * - Champion announcement when tournament completes
 * - Loading overlay during bracket generation
 * - Client-side logging for error tracking
 */

"use client";

import { useState, useEffect, useCallback, useRef, use } from "react";
import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DoubleEliminationBracket } from "@/components/tournament/double-elimination-bracket";
import { PlayoffBracket } from "@/components/tournament/playoff-bracket";
import { POLLING_INTERVAL, TV_NUMBER_OPTIONS } from "@/lib/constants";
import { getBmFinalsTargetWins } from "@/lib/finals-target-wins";
import { usePolling } from "@/lib/hooks/usePolling";
import { UpdateIndicator } from "@/components/ui/update-indicator";
import { LoadingOverlay } from "@/components/ui/loading-overlay";
import { CardSkeleton } from "@/components/ui/loading-skeleton";
import { createLogger } from "@/lib/client-logger";
import { parseManualScore } from "@/lib/parse-manual-score";

/**
 * Client-side logger for the finals page.
 * Used for tracking bracket generation and score update errors.
 * Note: Client logger is created at module level (unlike server API loggers).
 */
import type { Player } from "@/lib/types";
import { buildMatchLabel } from "@/lib/overlay/phase";

const logger = createLogger({ serviceName: 'tournaments-bm-finals' });

/** BM Match data with player relations */
interface BMMatch {
  id: string;
  matchNumber: number;
  round: string | null;
  stage?: string | null;
  tvNumber?: number | null;
  startingCourseNumber?: number | null;
  player1Id: string;
  player2Id: string;
  score1: number;
  score2: number;
  completed: boolean;
  player1: Player;
  player2: Player;
}

/** Bracket position definition */
interface BracketMatch {
  matchNumber: number;
  round: string;
  bracket: "winners" | "losers" | "grand_final";
  player1Seed?: number;
  player2Seed?: number;
}

/** Seeded player with qualification ranking */
interface SeededPlayer {
  seed: number;
  playerId: string;
  player: Player;
}

function unwrapApiData<T>(json: T | { success?: boolean; data?: T }): T {
  if (json && typeof json === "object" && "success" in json && "data" in json) {
    const data = (json as { data: T }).data;
    if (data !== undefined) return data;
  }
  return json as T;
}

function getMatchWinner(match: BMMatch): Player | null {
  if (!match.completed) return null;
  if (match.score1 > match.score2) return match.player1;
  if (match.score2 > match.score1) return match.player2;
  return null;
}

function getCompletedChampion(matches: BMMatch[]): Player | null {
  const reset = matches.find((m) => m.round === "grand_final_reset" && m.completed);
  if (reset) return getMatchWinner(reset);

  const grandFinal = matches.find((m) => m.round === "grand_final" && m.completed);
  if (!grandFinal || grandFinal.score1 <= grandFinal.score2) return null;
  return grandFinal.player1;
}

/**
 * Battle Mode Finals page component.
 * Uses React 19's `use()` hook to unwrap the async params.
 */
export default function BattleModeFinals({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: tournamentId } = use(params);
  const { data: session } = useSession();

  /** Admin role check: only admins can generate/reset brackets and enter scores */
  const isAdmin = session?.user && session.user.role === 'admin';

  /**
   * i18n translation hooks for the finals page.
   * Three namespaces are used:
   * - 'finals': Finals-specific strings (bracket actions, dialogs, champion, etc.)
   * - 'bm': Battle Mode shared strings (page title)
   * - 'common': Shared UI strings (cancel, save, etc.)
   * Hooks must be called at the top of the component before any other hooks.
   */
  const tFinals = useTranslations('finals');
  const tBm = useTranslations('bm');
  const tCommon = useTranslations('common');

  /* Bracket data state */
  const [matches, setMatches] = useState<BMMatch[]>([]);
  const [bracketStructure, setBracketStructure] = useState<BracketMatch[]>([]);
  const [seededPlayers, setSeededPlayers] = useState<SeededPlayer[]>([]);
  const [roundNames, setRoundNames] = useState<Record<string, string>>({});

  /* UI state */
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  /** Bracket size: 8 (top 8), 16 (top 16), or 24 (top 12 + playoff, §4.2 issue #454) */
  const [bracketSize, setBracketSize] = useState<8 | 16 | 24>(8);
  /** Apply topN from sessionStorage if set by qualification page */
  useEffect(() => {
    const stored = sessionStorage.getItem('bm_finals_topN');
    if (stored === '24' || stored === '16') {
      setBracketSize(parseInt(stored) as 8 | 16 | 24);
    }
    sessionStorage.removeItem('bm_finals_topN');
  }, []);
  /** Playoff phase state: 'playoff' while scoring barrage, 'finals' for upper bracket */
  const [phase, setPhase] = useState<'playoff' | 'finals' | undefined>(undefined);
  /** Playoff matches (stage='playoff') during barrage phase */
  const [playoffMatches, setPlayoffMatches] = useState<BMMatch[]>([]);
  const [playoffStructure, setPlayoffStructure] = useState<BracketMatch[]>([]);
  const [playoffSeededPlayers, setPlayoffSeededPlayers] = useState<SeededPlayer[]>([]);
  /** Whether all playoff_r2 matches are complete (triggers "Create Upper Bracket" button) */
  const [playoffComplete, setPlayoffComplete] = useState(false);

  /* Score entry dialog state */
  const [isScoreDialogOpen, setIsScoreDialogOpen] = useState(false);
  const [selectedMatch, setSelectedMatch] = useState<BMMatch | null>(null);
  const [scoreForm, setScoreForm] = useState({ score1: 0, score2: 0, tvNumber: null as number | null, startingCourseNumber: null as number | null });
  const selectedMatchTargetWins = selectedMatch ? getBmFinalsTargetWins(selectedMatch) : getBmFinalsTargetWins();

  /* Tournament completion state */
  const [champion, setChampion] = useState<Player | null>(null);
  const [broadcasting, setBroadcasting] = useState(false);

  /* In-flight PATCH abort controllers per field. Autosave fires on every
   * `onChange`, so an admin scrubbing through a dropdown can race multiple
   * PATCH responses; whichever resolves last wins on the server. We abort the
   * pending request when a new selection arrives so the latest pick is the
   * authoritative write. Keyed by match-id+field to avoid cross-talk between
   * dialogs reopened on different matches. */
  const tvAbortRef = useRef<AbortController | null>(null);
  const courseAbortRef = useRef<AbortController | null>(null);

  /**
   * Fetch finals data including matches, bracket structure, and round names.
   * This is the polling function called at the standard interval.
   */
  const fetchFinalsData = useCallback(async () => {
    const response = await fetch(`/api/tournaments/${tournamentId}/bm/finals`);

    if (!response.ok) {
      throw new Error(`Failed to fetch BM finals data: ${response.status}`);
    }

    const json = await response.json();
    const data = unwrapApiData<{
      matches?: BMMatch[];
      playoffMatches?: BMMatch[];
      bracketStructure?: BracketMatch[];
      playoffStructure?: BracketMatch[];
      roundNames?: Record<string, string>;
      qualificationConfirmed?: boolean;
      phase?: 'playoff' | 'finals';
      seededPlayers?: SeededPlayer[];
      playoffSeededPlayers?: SeededPlayer[];
      playoffComplete?: boolean;
    }>(json);

    return {
      matches: data.matches || [],
      playoffMatches: data.playoffMatches || [],
      bracketStructure: data.bracketStructure || [],
      playoffStructure: data.playoffStructure || [],
      roundNames: data.roundNames || {},
      qualificationConfirmed: data.qualificationConfirmed ?? false,
      phase: data.phase,
      seededPlayers: data.seededPlayers || [],
      playoffSeededPlayers: data.playoffSeededPlayers || [],
      playoffComplete: data.playoffComplete ?? false,
    };
  }, [tournamentId]);

  /* Set up polling with the standard interval */
  const { data: pollData, isLoading: pollLoading, error, lastETag, refetch } = usePolling(fetchFinalsData, {
    interval: POLLING_INTERVAL,
  });

  /* Update bracket state when polling data changes */
  useEffect(() => {
    if (pollData) {
      setMatches(pollData.matches);
      setBracketStructure(pollData.bracketStructure);
      setRoundNames(pollData.roundNames);
      setSeededPlayers(pollData.seededPlayers);
      setPlayoffMatches(pollData.playoffMatches);
      setPlayoffStructure(pollData.playoffStructure);
      setPlayoffSeededPlayers(pollData.playoffSeededPlayers);
      setPhase(pollData.phase);
      if (pollData.playoffComplete !== undefined) {
        setPlayoffComplete(pollData.playoffComplete);
      }
      setChampion(getCompletedChampion(pollData.matches));
    }
  }, [pollData]);

  /* Derive loading from polling: only show skeleton on the very first fetch
   * (when we have no data yet). After that keep content visible even while
   * refetching so the bracket does not flash in/out. */
  useEffect(() => {
    setLoading(pollLoading && !pollData);
  }, [pollLoading, pollData]);

  /**
   * Generate or regenerate the finals bracket.
   * For Top 24 (bracketSize=24), Phase 1 creates the playoff bracket.
   * Phase 2 is triggered by handleCreateUpperBracket after playoff completes.
   */
  const handleCreateBracket = async () => {
    setCreating(true);
    try {
      const response = await fetch(`/api/tournaments/${tournamentId}/bm/finals`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topN: bracketSize }),
      });

      if (response.ok) {
        const json = await response.json();
        const data = unwrapApiData<{
          matches?: BMMatch[];
          playoffMatches?: BMMatch[];
          bracketStructure?: BracketMatch[];
          playoffStructure?: BracketMatch[];
          seededPlayers?: SeededPlayer[];
          playoffSeededPlayers?: SeededPlayer[];
          phase?: 'playoff' | 'finals';
        }>(json);

        if (data.phase === 'playoff') {
          // Phase 1: Top 24 → playoff bracket created
          setPhase('playoff');
          setPlayoffMatches(data.playoffMatches || []);
          setPlayoffStructure(data.playoffStructure || []);
          setPlayoffSeededPlayers(data.playoffSeededPlayers || []);
          setMatches([]);
          setBracketStructure([]);
          setPlayoffComplete(false);
        } else {
          // Top 8 or 16: standard bracket creation
          setPhase('finals');
          setMatches(data.matches || []);
          setBracketStructure(data.bracketStructure || []);
          setSeededPlayers(data.seededPlayers || []);
          setPlayoffMatches([]);
          setPlayoffStructure([]);
        }
        setChampion(null);
        refetch();
      } else {
        const error = await response.json();
        alert(error.error || tFinals('failedCreateBracket'));
      }
    } catch (err) {
      const metadata = err instanceof Error ? { message: err.message, stack: err.stack } : { error: err };
      logger.error("Failed to create bracket:", metadata);
      alert(tFinals('failedCreateBracket'));
    } finally {
      setCreating(false);
    }
  };

  /**
   * Create the upper bracket after all playoff_r2 matches are complete.
   * Called when playoffComplete=true and admin clicks "Create Upper Bracket".
   * This is the Phase 2 POST for the Top 24 flow.
   */
  const handleCreateUpperBracket = async () => {
    setCreating(true);
    try {
      const response = await fetch(`/api/tournaments/${tournamentId}/bm/finals`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topN: 24 }),
      });

      if (response.ok) {
        const json = await response.json();
        const data = unwrapApiData<{
          matches?: BMMatch[];
          bracketStructure?: BracketMatch[];
          seededPlayers?: SeededPlayer[];
          phase?: 'playoff' | 'finals';
        }>(json);
        setPhase('finals');
        setPlayoffMatches([]);
        setPlayoffStructure([]);
        setMatches(data.matches || []);
        setBracketStructure(data.bracketStructure || []);
        setSeededPlayers(data.seededPlayers || []);
        refetch();
      } else {
        const error = await response.json();
        alert(error.error || tFinals('failedCreateBracket'));
      }
    } catch (err) {
      const metadata = err instanceof Error ? { message: err.message, stack: err.stack } : { error: err };
      logger.error("Failed to create upper bracket:", metadata);
      alert(tFinals('failedCreateBracket'));
    } finally {
      setCreating(false);
    }
  };

  /**
   * Persist a TV# selection from the bracket card immediately.
   * Uses PATCH so admins don't have to enter the score dialog just to assign
   * a broadcast slot — the dropdown saves on change. On success, refetch and
   * surface a toast; on failure, surface a toast with the server error so the
   * admin notices (the bracket card otherwise looks identical).
   */
  const handleBracketTvNumberChange = async (
    match: BMMatch,
    tvNumber: number | null,
  ) => {
    /* Cancel any in-flight TV# PATCH so a slower earlier response cannot
     * overwrite the latest selection. */
    tvAbortRef.current?.abort();
    const controller = new AbortController();
    tvAbortRef.current = controller;
    try {
      const response = await fetch(`/api/tournaments/${tournamentId}/bm/finals`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matchId: match.id, tvNumber }),
        signal: controller.signal,
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        toast.error(error?.error || tFinals('failedAssignTv'));
        return;
      }
      if (tvNumber === null) {
        toast.success(tFinals('tvCleared', { matchNumber: match.matchNumber }));
      } else {
        toast.success(tFinals('tvAssigned', { n: tvNumber, matchNumber: match.matchNumber }));
        /* Warn when assigning a TV slot to a match containing a NoCamera player
         * so the admin can reconsider the broadcast layout (issue #674). */
        if (match.player1?.noCamera || match.player2?.noCamera) {
          toast.warning(tFinals('noCameraWarning'));
        }
      }
      refetch();
    } catch (err) {
      /* AbortError is expected when a newer change supersedes this PATCH. */
      if (err instanceof DOMException && err.name === 'AbortError') return;
      const metadata = err instanceof Error ? { message: err.message, stack: err.stack } : { error: err };
      logger.error('Failed to assign TV number from bracket:', metadata);
      toast.error(tFinals('failedAssignTv'));
    }
  };

  /**
   * Persist a starting-course (BC1–BC4) selection from the score dialog
   * immediately. Mirrors `handleBracketTvNumberChange` so admins don't have
   * to submit the score form just to record which battle course a match
   * starts on. The PATCH endpoint accepts `startingCourseNumber: 1..4 | null`
   * and is shared with the TV# autosave path.
   */
  const handleBracketStartingCourseChange = async (
    match: BMMatch,
    startingCourseNumber: number | null,
  ) => {
    courseAbortRef.current?.abort();
    const controller = new AbortController();
    courseAbortRef.current = controller;
    try {
      const response = await fetch(`/api/tournaments/${tournamentId}/bm/finals`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matchId: match.id, startingCourseNumber }),
        signal: controller.signal,
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        toast.error(error?.error || tFinals('failedAssignCourse'));
        return;
      }
      if (startingCourseNumber === null) {
        toast.success(tFinals('courseCleared', { matchNumber: match.matchNumber }));
      } else {
        toast.success(tFinals('courseAssigned', { n: startingCourseNumber, matchNumber: match.matchNumber }));
      }
      refetch();
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      const metadata = err instanceof Error ? { message: err.message, stack: err.stack } : { error: err };
      logger.error('Failed to assign starting course:', metadata);
      toast.error(tFinals('failedAssignCourse'));
    }
  };

  /** Open the score entry dialog pre-populated with existing scores */
  const openScoreDialog = (match: BMMatch) => {
    setSelectedMatch(match);
    setScoreForm({ score1: match.score1, score2: match.score2, tvNumber: match.tvNumber ?? null, startingCourseNumber: match.startingCourseNumber ?? null });
    setIsScoreDialogOpen(true);
  };

  /**
   * Submit updated score for a finals match.
   * After successful update, checks if the tournament is complete
   * and sets the champion if a winner is determined.
   */
  const handleScoreSubmit = async () => {
    if (!selectedMatch) return;

    try {
      const response = await fetch(`/api/tournaments/${tournamentId}/bm/finals`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          matchId: selectedMatch.id,
          score1: scoreForm.score1,
          score2: scoreForm.score2,
          tvNumber: scoreForm.tvNumber,
          startingCourseNumber: scoreForm.startingCourseNumber,
        }),
      });

      if (response.ok) {
        const json = await response.json();
        const data = unwrapApiData<{
          isComplete?: boolean;
          champion?: string;
          playoffComplete?: boolean;
        }>(json);
        setIsScoreDialogOpen(false);
        setSelectedMatch(null);
        setScoreForm({ score1: 0, score2: 0, tvNumber: null, startingCourseNumber: null });
        if (data.playoffComplete !== undefined) {
          setPlayoffComplete(data.playoffComplete);
        }
        refetch();

        /* Check if the tournament is complete and set champion */
        if (data.isComplete && data.champion) {
          const winnerMatch = matches.find(
            (m) =>
              m.player1Id === data.champion || m.player2Id === data.champion
          );
          if (winnerMatch) {
            const champPlayer =
              winnerMatch.player1Id === data.champion
                ? winnerMatch.player1
                : winnerMatch.player2;
            setChampion(champPlayer);
          }
        }
      } else {
        const error = await response.json();
        alert(error.error || tFinals('failedUpdateScore'));
      }
    } catch (err) {
      const metadata = err instanceof Error ? { message: err.message, stack: err.stack } : { error: err };
      logger.error("Failed to update score:", metadata);
      alert(tFinals('failedUpdateScore'));
    }
  };

  /* Calculate progress counters for the progress badge */
  const completedMatches = matches.filter((m) => m.completed).length;
  const totalMatches = matches.length;
  const qualificationConfirmed = pollData?.qualificationConfirmed ?? false;

  /* Loading skeleton for initial page load */
  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4">
          <div className="space-y-3">
            <div className="h-9 w-64 bg-muted animate-pulse rounded" />
            <div className="h-5 w-48 bg-muted animate-pulse rounded" />
          </div>
          <div className="h-10 w-40 bg-muted animate-pulse rounded" />
        </div>
        <CardSkeleton />
      </div>
    );
  }

  return (
    <>
      {/* Full-screen loading overlay during bracket generation */}
      <LoadingOverlay isOpen={creating} message={tFinals('generatingBracket')} />
      <div className="space-y-6">
      {/* Page header with title, update indicator, and action buttons */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{tBm('finalsTitle')}</h1>
          <p className="text-muted-foreground">
            {tFinals('doubleElimination')}
          </p>
          <div className="mt-2">
            {lastETag && <UpdateIndicator lastUpdated={new Date(lastETag)} isPolling={!error && pollLoading} />}
          </div>
        </div>
        <div className="flex gap-2">
          {/* Generate or Reset bracket buttons: admin-only */}
          {isAdmin && qualificationConfirmed && (matches.length === 0 && phase !== 'playoff' && playoffMatches.length === 0 ? (
            <AlertDialog>
               <AlertDialogTrigger asChild>
                 <Button disabled={creating} aria-label="Generate finals bracket">
                   {creating ? tFinals('creating') : tFinals('generateBracket')}
                 </Button>
               </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{tFinals('generateConfirmTitle')}</AlertDialogTitle>
                  <AlertDialogDescription>
                    {tFinals('generateConfirmDesc')}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                {/* §4.2 / issue #454: Bracket size selection — 8, 16, or 24 (Top 12 + playoff) */}
                <div className="flex gap-2 justify-center py-2">
                  <Button
                    size="sm"
                    variant={bracketSize === 8 ? "default" : "outline"}
                    onClick={() => setBracketSize(8)}
                  >
                    {tFinals('top8')}
                  </Button>
                  <Button
                    size="sm"
                    variant={bracketSize === 16 ? "default" : "outline"}
                    onClick={() => setBracketSize(16)}
                  >
                    {tFinals('top16')}
                  </Button>
                  <Button
                    size="sm"
                    variant={bracketSize === 24 ? "default" : "outline"}
                    onClick={() => setBracketSize(24)}
                  >
                    {tFinals('top24')}
                  </Button>
                </div>
                <AlertDialogFooter>
                  <AlertDialogCancel>{tCommon('cancel')}</AlertDialogCancel>
                  <AlertDialogAction onClick={handleCreateBracket}>
                    {tFinals('generate')} ({bracketSize} players)
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          ) : (
            <AlertDialog>
               <AlertDialogTrigger asChild>
                 <Button variant="outline" disabled={creating} aria-label="Reset finals bracket">
                   {tFinals('resetBracket')}
                 </Button>
               </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{tFinals('resetConfirmTitle')}</AlertDialogTitle>
                  <AlertDialogDescription>
                    {tFinals('resetConfirmDesc')}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{tCommon('cancel')}</AlertDialogCancel>
                  <AlertDialogAction onClick={handleCreateBracket}>
                    {tFinals('reset')}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          ))}
          {/* Back navigation to qualification page */}
          <Button variant="outline" asChild>
            <Link href={`/tournaments/${tournamentId}/bm`}>
              {tFinals('backToQualification')}
            </Link>
          </Button>
        </div>
      </div>

      {/* Champion announcement card - shown when tournament is complete */}
      {champion && (
        <Card className="border-accent bg-accent/10">
          <CardContent className="py-6 text-center">
            <h2 className="text-sm font-semibold text-muted-foreground">{tFinals('champion')}</h2>
            <p className="font-display text-3xl sm:text-4xl tracking-wide text-foreground mt-2">
              {champion.nickname}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Progress badges showing match completion status */}
      {matches.length > 0 && (
        <div className="flex items-center gap-4">
          <Badge variant="outline" className="text-sm">
            {tFinals('progressMatches', { completed: completedMatches, total: totalMatches })}
          </Badge>
          {completedMatches === totalMatches && totalMatches > 0 && (
            <Badge className="bg-green-500">{tFinals('tournamentComplete')}</Badge>
          )}
        </div>
      )}

      {/* Playoff progress badges — shown during playoff phase */}
      {phase === 'playoff' && (
        <div className="flex items-center gap-4">
          <Badge variant="outline" className="text-sm border-blue-500/50 text-blue-500">
            {tFinals('playoffPhase')}
          </Badge>
          <Badge variant="outline" className="text-sm">
            {playoffMatches.filter((m) => m.completed).length} / {playoffMatches.length} matches
          </Badge>
          {playoffComplete && (
            <Badge className="bg-green-500">{tFinals('playoffComplete')}</Badge>
          )}
        </div>
      )}

      {/* Main content: playoff bracket, empty state, or bracket visualization */}
      {matches.length === 0 && playoffMatches.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>{tFinals('noBracketYet')}</CardTitle>
            <CardDescription>
              {tFinals('generateBracketDesc')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              {tFinals('bracketExplanation')}
            </p>
            <ul className="list-disc list-inside mt-4 space-y-2 text-sm text-muted-foreground">
              <li>
                <strong>{tFinals('winnersBracket')}</strong> {tFinals('winnersBracketDesc')}
              </li>
              <li>
                <strong>{tFinals('losersBracket')}</strong> {tFinals('losersBracketDesc')}
              </li>
              <li>
                <strong>{tFinals('grandFinal')}</strong> {tFinals('grandFinalDesc')}
              </li>
              <li>
                <strong>{tFinals('resetMatch')}</strong> {tFinals('resetMatchDesc')}
              </li>
            </ul>
          </CardContent>
        </Card>
      ) : playoffMatches.length > 0 && matches.length > 0 ? (
        /* Both playoff and finals exist — show tabs so the admin can review
         * the playoff (barrage) results after the Upper Bracket is created. */
        <Tabs defaultValue="finals" className="space-y-4">
          <TabsList>
            <TabsTrigger value="finals">{tFinals('upperBracket')}</TabsTrigger>
            <TabsTrigger value="playoff">{tFinals('playoffBracket')}</TabsTrigger>
          </TabsList>
          <TabsContent value="finals">
            <DoubleEliminationBracket
              matches={matches}
              bracketStructure={bracketStructure}
              roundNames={roundNames}
              seededPlayers={seededPlayers}
              getTargetWins={(match, bracketMatch) => getBmFinalsTargetWins({ stage: match?.stage, round: match?.round ?? bracketMatch.round })}
              onMatchClick={isAdmin ? openScoreDialog : undefined}
              onTvNumberChange={isAdmin ? handleBracketTvNumberChange : undefined}
            />
          </TabsContent>
          <TabsContent value="playoff">
            <PlayoffBracket
              playoffMatches={playoffMatches}
              playoffStructure={playoffStructure}
              roundNames={roundNames}
              seededPlayers={playoffSeededPlayers}
              onMatchClick={isAdmin ? openScoreDialog : undefined}
              onTvNumberChange={isAdmin ? handleBracketTvNumberChange : undefined}
              getTargetWins={(match, bracketMatch) => getBmFinalsTargetWins({ stage: match?.stage ?? 'playoff', round: match?.round ?? bracketMatch.round })}
            />
          </TabsContent>
        </Tabs>
      ) : playoffMatches.length > 0 ? (
        /* Playoff only (Phase 1) */
        <>
          <PlayoffBracket
            playoffMatches={playoffMatches}
            playoffStructure={playoffStructure}
            roundNames={roundNames}
            seededPlayers={playoffSeededPlayers}
            onMatchClick={isAdmin ? openScoreDialog : undefined}
            onTvNumberChange={isAdmin ? handleBracketTvNumberChange : undefined}
            getTargetWins={(match, bracketMatch) => getBmFinalsTargetWins({ stage: match?.stage ?? 'playoff', round: match?.round ?? bracketMatch.round })}
          />
          {playoffComplete && isAdmin && (
            <Card className="border-green-500/50 bg-green-500/10">
              <CardContent className="py-4 text-center">
                <p className="text-sm text-muted-foreground mb-3">
                  {tFinals('allPlayoffMatchesComplete')}
                </p>
                <Button onClick={handleCreateUpperBracket}>
                  {tFinals('createUpperBracket')}
                </Button>
              </CardContent>
            </Card>
          )}
        </>
      ) : (
        /* Finals only */
        <DoubleEliminationBracket
          matches={matches}
          bracketStructure={bracketStructure}
          roundNames={roundNames}
          seededPlayers={seededPlayers}
          getTargetWins={(match, bracketMatch) => getBmFinalsTargetWins({ stage: match?.stage, round: match?.round ?? bracketMatch.round })}
          onMatchClick={isAdmin ? openScoreDialog : undefined}
          onTvNumberChange={isAdmin ? handleBracketTvNumberChange : undefined}
        />
      )}

      {/* Score Entry Dialog: admin-only */}
      {isAdmin && <Dialog open={isScoreDialogOpen} onOpenChange={setIsScoreDialogOpen}>
        <DialogContent
          className="sm:max-w-2xl"
          onOpenAutoFocus={(e) => {
            /* Auto-focus the first score input for keyboard usability */
            e.preventDefault();
            const firstInput = document.getElementById(`score1-${selectedMatch?.id}`);
            firstInput?.focus();
          }}
        >
          <DialogHeader>
            <DialogTitle>{tFinals('enterMatchScore')}</DialogTitle>
            <DialogDescription>
              {selectedMatch && (
                <>
                  Match #{selectedMatch.matchNumber}:{" "}
                  {selectedMatch.player1.nickname} vs{" "}
                  {selectedMatch.player2.nickname}
                  {/* Show the round name if available */}
                  {selectedMatch.round && (
                    <span className="block text-xs mt-1">
                      {roundNames[selectedMatch.round] || selectedMatch.round}
                    </span>
                  )}
                  <span className="block text-xs mt-1">FT{selectedMatchTargetWins}</span>
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="flex items-center justify-center gap-4">
               {/* Player 1 score input with accessible label */}
               <div className="text-center">
                 <Label htmlFor={`score1-${selectedMatch?.id}`}>
                   {selectedMatch?.player1.nickname}
                 </Label>
                 <Input
                   id={`score1-${selectedMatch?.id}`}
                   type="number"
                   min={0}
                   max={selectedMatchTargetWins}
                   value={scoreForm.score1}
                   onChange={(e) =>
                     /* Strict parse: reject "2.5"/"1e2" that parseInt would
                      * silently coerce into a valid-looking target-wins value. */
                     setScoreForm({
                       ...scoreForm,
                       score1: parseManualScore(e.target.value) ?? 0,
                     })
                   }
                   className="w-20 text-center text-2xl"
                   aria-label={`${selectedMatch?.player1.nickname} score`}
                 />
               </div>
               <span className="text-2xl" aria-hidden="true">-</span>
               {/* Player 2 score input with accessible label */}
               <div className="text-center">
                 <Label htmlFor={`score2-${selectedMatch?.id}`}>
                   {selectedMatch?.player2.nickname}
                 </Label>
                 <Input
                   id={`score2-${selectedMatch?.id}`}
                   type="number"
                   min={0}
                   max={selectedMatchTargetWins}
                   value={scoreForm.score2}
                   onChange={(e) =>
                     setScoreForm({
                       ...scoreForm,
                       score2: parseManualScore(e.target.value) ?? 0,
                     })
                   }
                   className="w-20 text-center text-2xl"
                   aria-label={`${selectedMatch?.player2.nickname} score`}
                 />
              </div>
            </div>
            {/* §5.4: Start course — randomly assigned per round at bracket creation (issue #671).
                Admins can override per-match from this dropdown. The selection
                autosaves via PATCH the moment the value changes (matches the
                TV# autosave UX below); no explicit save button is needed. */}
            <div className="flex items-center justify-center gap-3">
              <Label htmlFor="bm-finals-start-course" className="text-sm text-muted-foreground shrink-0">
                {tFinals('startCourse')}
              </Label>
              {isAdmin ? (
                <select
                  id="bm-finals-start-course"
                  className="h-8 px-2 text-sm border rounded bg-background"
                  value={scoreForm.startingCourseNumber ?? ""}
                  onChange={(e) => {
                    const next = e.target.value ? parseInt(e.target.value) : null;
                    setScoreForm({ ...scoreForm, startingCourseNumber: next });
                    if (selectedMatch) {
                      void handleBracketStartingCourseChange(selectedMatch, next);
                    }
                  }}
                >
                  <option value="">-</option>
                  {[1, 2, 3, 4].map((n) => (
                    <option key={n} value={n}>{tFinals('battleCourse', { number: n })}</option>
                  ))}
                </select>
              ) : (
                <Badge variant="outline" className="text-sm px-3 py-1">
                  {scoreForm.startingCourseNumber
                    ? tFinals('battleCourse', { number: scoreForm.startingCourseNumber })
                    : '-'}
                </Badge>
              )}
            </div>
            {/* TV number assignment for broadcast: admin selects TV 1–4.
                The dropdown autosaves on change via PATCH (same UX as the
                start-course selector above and the bracket-card TV# inline
                select), so the previous explicit "Save TV#" button is no
                longer needed. */}
            <div className="flex items-center justify-center gap-3">
              <Label htmlFor="bm-finals-tv" className="text-sm text-muted-foreground shrink-0">
                TV#
              </Label>
              <select
                id="bm-finals-tv"
                className="w-20 h-8 text-center text-sm border rounded bg-background"
                value={scoreForm.tvNumber ?? ""}
                onChange={(e) => {
                  const next = e.target.value ? parseInt(e.target.value) : null;
                  setScoreForm({ ...scoreForm, tvNumber: next });
                  if (selectedMatch) {
                    void handleBracketTvNumberChange(selectedMatch, next);
                  }
                }}
              >
                <option value="">-</option>
                {TV_NUMBER_OPTIONS.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
            {/* Always rendered to reserve vertical space and prevent layout shift. */}
            <p className={`text-sm text-center ${
              scoreForm.score1 + scoreForm.score2 > 0 &&
              scoreForm.score1 < selectedMatchTargetWins &&
              scoreForm.score2 < selectedMatchTargetWins
                ? 'text-yellow-600' : 'invisible'
            }`}>
              {tFinals('matchNeedWinner', { targetWins: selectedMatchTargetWins })}
            </p>
          </div>
          <DialogFooter className="flex-wrap gap-2">
            {selectedMatch && (
              <Button
                variant="outline"
                size="sm"
                disabled={broadcasting}
                onClick={async () => {
                  setBroadcasting(true);
                  try {
                    const matchLabel = buildMatchLabel(selectedMatch.round, roundNames);
                    const res = await fetch(`/api/tournaments/${tournamentId}/broadcast`, {
                      method: "PUT",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        player1Name: selectedMatch.player1.nickname,
                        player2Name: selectedMatch.player2.nickname,
                        /* Include score and round info (#645, #649) */
                        matchLabel,
                        player1Wins: selectedMatch.score1,
                        player2Wins: selectedMatch.score2,
                        matchFt: selectedMatchTargetWins,
                      }),
                    });
                    if (res.ok) {
                      toast.success(tCommon("broadcastReflected"));
                    } else {
                      toast.error(tCommon("broadcastError"));
                    }
                  } catch {
                    toast.error(tCommon("broadcastError"));
                  } finally {
                    setBroadcasting(false);
                  }
                }}
              >
                {broadcasting ? tCommon('saving') : tCommon('broadcastReflect')}
              </Button>
            )}
            <Button
              onClick={handleScoreSubmit}
              disabled={scoreForm.score1 < selectedMatchTargetWins && scoreForm.score2 < selectedMatchTargetWins}
            >
              {tCommon('saveScore')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>}
    </div>
    </>
  );
}
