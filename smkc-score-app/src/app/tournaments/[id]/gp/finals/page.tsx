"use client";

/**
 * Grand Prix Finals Bracket Page
 *
 * Displays and manages the GP double elimination bracket.
 * Admin page for creating brackets, entering scores, and tracking
 * tournament progression through winners bracket, losers bracket,
 * grand final, and reset match.
 *
 * Features:
 * - Bracket generation from top 8 qualifiers
 * - Interactive bracket display using DoubleEliminationBracket component
 * - Score entry dialog for each match
 * - Bracket reset with confirmation
 * - Champion announcement
 * - Progress tracking (completed/total matches)
 * - Real-time polling at the standard interval
 */

import { useState, useEffect, useCallback, use } from "react";
import { useSession } from "next-auth/react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DoubleEliminationBracket } from "@/components/tournament/double-elimination-bracket";
import { PlayoffBracket } from "@/components/tournament/playoff-bracket";
import { COURSE_INFO, CUP_SUBSTITUTIONS, GP_POSITION_OPTIONS, POLLING_INTERVAL, TOTAL_GP_RACES, getDriverPoints, type CourseAbbr } from "@/lib/constants";
import { formatGpPosition } from "@/lib/gp-utils";
import { usePolling } from "@/lib/hooks/usePolling";
import { UpdateIndicator } from "@/components/ui/update-indicator";
import { CardSkeleton } from "@/components/ui/loading-skeleton";
import { createLogger } from "@/lib/client-logger";
import { parseManualScore } from "@/lib/parse-manual-score";
import type { Player } from "@/lib/types";

/** Client-side logger for error tracking */
const logger = createLogger({ serviceName: 'tournaments-gp-finals' });

/** Individual race entry in the finals score form */
interface Race {
  course: CourseAbbr | "";
  position1: number | null;
  position2: number | null;
}

/** GP finals match with cup-based race results and driver points (§7.5) */
interface GPMatch {
  id: string;
  matchNumber: number;
  player1Id: string;
  player2Id: string;
  points1: number;
  points2: number;
  completed: boolean;
  cup?: string;
  player1: Player;
  player2: Player;
  races?: {
    course: string;
    position1: number;
    position2: number;
    points1: number;
    points2: number;
  }[];
  player1ReportedPoints1?: number;
  player1ReportedPoints2?: number;
  player2ReportedPoints1?: number;
  player2ReportedPoints2?: number;
  /** Winner selected when total driver points are tied (§7.5). */
  suddenDeathWinnerId?: string;
  /** Finals matches use score1/score2 (driver points) instead of points1/points2. */
  score1: number;
  score2: number;
  /** Round identifier for bracket navigation. */
  round: string | null;
}

/** Abstract bracket position from double-elimination library */
interface BracketMatch {
  matchNumber: number;
  round: string;
  bracket: "winners" | "losers" | "grand_final";
  player1Seed?: number;
  player2Seed?: number;
}

/** Player with seed assignment from qualification ranking */
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

function getGpScore(match: GPMatch, side: 1 | 2): number {
  return side === 1
    ? match.points1 ?? match.score1 ?? 0
    : match.points2 ?? match.score2 ?? 0;
}

function getMatchWinner(match: GPMatch): Player | null {
  if (!match.completed) return null;
  const score1 = getGpScore(match, 1);
  const score2 = getGpScore(match, 2);
  if (score1 > score2) return match.player1;
  if (score2 > score1) return match.player2;
  return null;
}

function getCompletedChampion(matches: GPMatch[]): Player | null {
  const reset = matches.find((m) => m.round === "grand_final_reset" && m.completed);
  if (reset) return getMatchWinner(reset);

  const grandFinal = matches.find((m) => m.round === "grand_final" && m.completed);
  if (!grandFinal) return null;
  return getMatchWinner(grandFinal);
}

function hasValidGpFinalsWinner(score1: number, score2: number, suddenDeathWinnerId?: string): boolean {
  if (score1 < 0 || score2 < 0) return false;
  if (score1 === score2) {
    /* Tied GP finals require a sudden-death winner (§7.5). */
    return !!suddenDeathWinnerId && suddenDeathWinnerId.length > 0;
  }
  return true;
}

export default function GrandPrixFinals({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: tournamentId } = use(params);
  const { data: session } = useSession();

  /** Admin role check: only admins can generate/reset brackets and enter scores */
  const isAdmin = session?.user && session.user.role === 'admin';

  /**
   * i18n translation hooks for Grand Prix Finals page.
   * - 'finals': Shared finals bracket strings (generate, reset, champion, etc.)
   * - 'gp': Grand Prix mode-specific strings (page title)
   * - 'common': Shared UI strings (cancel, save, etc.)
   * Hooks must be called at the top of the component before any state/effect hooks.
   */
  const tFinals = useTranslations('finals');
  const tGp = useTranslations('gp');
  const tCommon = useTranslations('common');
  const locale = useLocale();
  // formatGpPosition imported from @/lib/gp-utils; bind locale and gameOver label locally
  const fmtPos = (position: number) => formatGpPosition(position, locale, tCommon('gameOver'));

  const [matches, setMatches] = useState<GPMatch[]>([]);
  const [bracketStructure, setBracketStructure] = useState<BracketMatch[]>([]);
  const [seededPlayers, setSeededPlayers] = useState<SeededPlayer[]>([]);
  const [roundNames, setRoundNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [bracketSize, setBracketSize] = useState<8 | 16 | 24>(8);
  /** Apply topN from sessionStorage if set by qualification page */
  useEffect(() => {
    const stored = sessionStorage.getItem('gp_finals_topN');
    if (stored === '24' || stored === '16') {
      setBracketSize(parseInt(stored) as 8 | 16 | 24);
    }
    sessionStorage.removeItem('gp_finals_topN');
  }, []);
  const [phase, setPhase] = useState<'playoff' | 'finals' | undefined>(undefined);
  const [playoffMatches, setPlayoffMatches] = useState<GPMatch[]>([]);
  const [playoffStructure, setPlayoffStructure] = useState<BracketMatch[]>([]);
  const [playoffSeededPlayers, setPlayoffSeededPlayers] = useState<SeededPlayer[]>([]);
  const [playoffComplete, setPlayoffComplete] = useState(false);
  const [isScoreDialogOpen, setIsScoreDialogOpen] = useState(false);
  const [selectedMatch, setSelectedMatch] = useState<GPMatch | null>(null);
  const [scoreForm, setScoreForm] = useState<{
    suddenDeathWinnerId: string;
    cup: string;
    races: Race[];
  }>({ suddenDeathWinnerId: "", cup: "", races: [] });
  /* Admin override: skip race entry and write raw driver-points totals.
   * Mirrors the qualification page's manual-total form — used when the
   * cup total needs correcting but entering every race is overkill. */
  const [manualScoreEnabled, setManualScoreEnabled] = useState(false);
  const [manualPoints1, setManualPoints1] = useState<string>("");
  const [manualPoints2, setManualPoints2] = useState<string>("");
  const [champion, setChampion] = useState<Player | null>(null);

  /** Fetch finals data including matches, bracket structure, and round names */
  const fetchFinalsData = useCallback(async () => {
    const response = await fetch(`/api/tournaments/${tournamentId}/gp/finals`);

    if (!response.ok) {
      throw new Error(`Failed to fetch GP finals data: ${response.status}`);
    }

    const json = await response.json();
    const data = unwrapApiData<{
      matches?: GPMatch[];
      data?: GPMatch[];
      playoffMatches?: GPMatch[];
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
      matches: data.matches || data.data || [],
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

  /* Poll for bracket updates at the standard interval */
  const { data: pollData, isLoading: pollLoading, lastUpdated, isPolling, refetch } = usePolling(
    fetchFinalsData, {
    interval: POLLING_INTERVAL,
  });

  useEffect(() => {
    if (pollData) {
      setMatches(pollData.matches);
      setBracketStructure(pollData.bracketStructure);
      setSeededPlayers(pollData.seededPlayers);
      setRoundNames(pollData.roundNames);
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
   * Generate a new double elimination bracket from the top 8 qualifiers.
   * For Top 24, Phase 1 creates the playoff bracket.
   */
  const handleCreateBracket = async () => {
    setCreating(true);
    try {
      const response = await fetch(`/api/tournaments/${tournamentId}/gp/finals`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topN: bracketSize }),
      });

      if (response.ok) {
        const json = await response.json();
        const data = unwrapApiData<{
          matches?: GPMatch[];
          playoffMatches?: GPMatch[];
          bracketStructure?: BracketMatch[];
          playoffStructure?: BracketMatch[];
          seededPlayers?: SeededPlayer[];
          playoffSeededPlayers?: SeededPlayer[];
          phase?: 'playoff' | 'finals';
        }>(json);

        if (data.phase === 'playoff') {
          setPhase('playoff');
          setPlayoffMatches(data.playoffMatches || []);
          setPlayoffStructure(data.playoffStructure || []);
          setPlayoffSeededPlayers(data.playoffSeededPlayers || []);
          setMatches([]);
          setBracketStructure([]);
          setPlayoffComplete(false);
        } else {
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
      logger.error("Failed to create bracket:", { error: err, tournamentId });
      alert(tFinals('failedCreateBracket'));
    } finally {
      setCreating(false);
    }
  };

  const handleCreateUpperBracket = async () => {
    setCreating(true);
    try {
      const response = await fetch(`/api/tournaments/${tournamentId}/gp/finals`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topN: 24 }),
      });

      if (response.ok) {
        const json = await response.json();
        const data = unwrapApiData<{
          matches?: GPMatch[];
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
      logger.error("Failed to create upper bracket:", { error: err, tournamentId });
      alert(tFinals('failedCreateBracket'));
    } finally {
      setCreating(false);
    }
  };

  /** Get courses belonging to a specific cup for the race table */
  const getCupCourses = (cup: string): CourseAbbr[] => {
    return COURSE_INFO.filter((c) => c.cup === cup).map((c) => c.abbr);
  };

  /** Open score entry dialog for a specific match */
  const openScoreDialog = (match: GPMatch) => {
    setSelectedMatch(match);
    /* The server backfills per-round cups on GET for legacy rows, so by the
     * time the admin can click a match it is guaranteed to have one. The
     * fallback empty-string is kept only to satisfy the TS type and to avoid
     * crashing if the refetch races the click. */
    const cup = match.cup || "";
    let races: Race[];
    if (match.races && match.races.length === TOTAL_GP_RACES) {
      /* Pre-fill with existing race data for editing */
      races = match.races.map((r) => ({
        course: r.course as CourseAbbr,
        position1: r.position1,
        position2: r.position2,
      }));
    } else if (cup) {
      /* Auto-fill courses from the assigned cup's fixed sequence */
      races = getCupCourses(cup).map((course) => ({ course, position1: null, position2: null }));
    } else {
      races = Array.from({ length: TOTAL_GP_RACES }, () => ({ course: "" as CourseAbbr, position1: null, position2: null }));
    }
    setScoreForm({
      suddenDeathWinnerId: match.suddenDeathWinnerId ?? "",
      cup,
      races,
    });
    /* Reset the manual-override form; pre-fill with the stored totals so the
     * admin can toggle into manual mode and tweak one side without retyping
     * both. score1/score2 are the finals score fields; points1/points2 fall
     * back for playoff rows. */
    setManualScoreEnabled(false);
    setManualPoints1(String(match.score1 ?? match.points1 ?? 0));
    setManualPoints2(String(match.score2 ?? match.points2 ?? 0));
    setIsScoreDialogOpen(true);
  };

  /**
   * Submit score for a finals match.
   * Calculates driver points from race positions and sends cup + races
   * so the API can store the full race breakdown (§7.5).
   * The API handles bracket progression (winner/loser advancement)
   * and returns whether the tournament is complete.
   */
  const handleScoreSubmit = async () => {
    if (!selectedMatch) return;

    /* Manual-override path: write the raw driver-points totals and skip the
     * cup/races breakdown. Used when a race-by-race entry isn't needed. */
    let points1: number;
    let points2: number;
    const body: Record<string, unknown> = { matchId: selectedMatch.id };

    if (manualScoreEnabled) {
      /* Strict parse: reject "12.5", "1e2", etc. that parseInt would
       * silently truncate into a valid-looking integer. */
      const parsed1 = parseManualScore(manualPoints1);
      const parsed2 = parseManualScore(manualPoints2);
      if (parsed1 === null || parsed2 === null) {
        alert(tGp('manualScoreValidation'));
        return;
      }
      points1 = parsed1;
      points2 = parsed2;
      body.score1 = points1;
      body.score2 = points2;
    } else {
      /* Derive total driver points from race positions */
      points1 = scoreForm.races.reduce(
        (acc, r) => acc + (r.position1 ? getDriverPoints(r.position1) : 0),
        0
      );
      points2 = scoreForm.races.reduce(
        (acc, r) => acc + (r.position2 ? getDriverPoints(r.position2) : 0),
        0
      );
      body.score1 = points1;
      body.score2 = points2;
      body.cup = scoreForm.cup;
      body.races = scoreForm.races.map((r) => ({
        course: r.course,
        position1: r.position1,
        position2: r.position2,
        points1: r.position1 ? getDriverPoints(r.position1) : 0,
        points2: r.position2 ? getDriverPoints(r.position2) : 0,
      }));
    }
    if (points1 === points2 && scoreForm.suddenDeathWinnerId) {
      body.suddenDeathWinnerId = scoreForm.suddenDeathWinnerId;
    }

    try {
      const response = await fetch(`/api/tournaments/${tournamentId}/gp/finals`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (response.ok) {
        const json = await response.json();
        const data = unwrapApiData<{ isComplete?: boolean; champion?: string; playoffComplete?: boolean }>(json);
        setIsScoreDialogOpen(false);
        setSelectedMatch(null);
        setScoreForm({ suddenDeathWinnerId: "", cup: "", races: [] });
        setManualScoreEnabled(false);
        setManualPoints1("");
        setManualPoints2("");
        if (data.playoffComplete !== undefined) {
          setPlayoffComplete(data.playoffComplete);
        }
        refetch();

        /* Check if tournament is complete and display champion */
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
      logger.error("Failed to update score:", { error: err, tournamentId });
      alert(tFinals('failedUpdateScore'));
    }
  };

  const completedMatches = matches.filter((m) => m.completed).length;
  const totalMatches = matches.length;
  const qualificationConfirmed = pollData?.qualificationConfirmed ?? false;
  /* Live driver points preview. In manual-override mode, reflect the raw
   * inputs so the tied-score branch (sudden-death prompt) still works. */
  const racePoints1 = scoreForm.races.reduce(
    (acc, r) => acc + (r.position1 ? getDriverPoints(r.position1) : 0),
    0
  );
  const racePoints2 = scoreForm.races.reduce(
    (acc, r) => acc + (r.position2 ? getDriverPoints(r.position2) : 0),
    0
  );
  const manualPointsParsed1 = parseManualScore(manualPoints1);
  const manualPointsParsed2 = parseManualScore(manualPoints2);
  const manualPointsValid =
    manualPointsParsed1 !== null && manualPointsParsed2 !== null;
  const livePoints1 = manualScoreEnabled
    ? (manualPointsParsed1 ?? 0)
    : racePoints1;
  const livePoints2 = manualScoreEnabled
    ? (manualPointsParsed2 ?? 0)
    : racePoints2;
  /* Pre-tiebreak readiness: the inputs are filled in enough that a submit
   * is imminent. Used to decide when to surface the sudden-death picker
   * for tied scores (including 0-0) — the server rejects any tie without
   * a suddenDeathWinnerId, so the admin must always have a way to pick
   * one once the form is otherwise complete. */
  const scoreInputsReady = manualScoreEnabled
    ? manualPointsValid
    : Boolean(scoreForm.cup) &&
      scoreForm.races.length === TOTAL_GP_RACES &&
      scoreForm.races.every((r) => r.position1 !== null && r.position2 !== null);
  const tiedAndReady = scoreInputsReady && livePoints1 === livePoints2;

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4">
          <div className="space-y-3">
            <div className="h-9 w-40 bg-muted animate-pulse rounded" />
            <div className="h-5 w-48 bg-muted animate-pulse rounded" />
          </div>
          <div className="h-10 w-24 bg-muted animate-pulse rounded" />
        </div>
        <CardSkeleton />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page header with bracket controls */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4">
        <div>
          {/* i18n: Page title from 'gp' namespace, subtitle from 'finals' namespace */}
          <h1 className="text-3xl font-bold">{tGp('finalsTitle')}</h1>
          <p className="text-muted-foreground">
            {tFinals('doubleElimination')}
          </p>
          <div className="mt-2">
            <UpdateIndicator lastUpdated={lastUpdated} isPolling={isPolling} />
          </div>
        </div>
        <div className="flex gap-2">
          {/* Generate or Reset bracket buttons: admin-only */}
          {isAdmin && qualificationConfirmed && (matches.length === 0 && phase !== 'playoff' && playoffMatches.length === 0 ? (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button disabled={creating}>
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
                <div className="flex gap-2 justify-center py-2">
                  <Button size="sm" variant={bracketSize === 8 ? "default" : "outline"} onClick={() => setBracketSize(8)}>Top 8</Button>
                  <Button size="sm" variant={bracketSize === 16 ? "default" : "outline"} onClick={() => setBracketSize(16)}>Top 16</Button>
                  <Button size="sm" variant={bracketSize === 24 ? "default" : "outline"} onClick={() => setBracketSize(24)}>Top 24</Button>
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
                <Button variant="outline" disabled={creating}>
                  {/* i18n: Reset bracket button */}
                  {tFinals('resetBracket')}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  {/* i18n: Reset bracket confirmation dialog */}
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
          <Button variant="outline" asChild>
            <Link href={`/tournaments/${tournamentId}/gp`}>
              {/* i18n: Back navigation to qualification page */}
              {tFinals('backToQualification')}
            </Link>
          </Button>
        </div>
      </div>

      {/* Champion announcement banner */}
      {champion && (
        <Card className="border-yellow-500 bg-yellow-500/10">
          <CardContent className="py-6 text-center">
            <div className="text-4xl mb-2">🏆</div>
            <h2 className="text-2xl font-bold">{tFinals('champion')}</h2>
            <p className="text-3xl font-bold text-yellow-500 mt-2">
              {champion.nickname}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Playoff progress badges */}
      {phase === 'playoff' && (
        <div className="flex items-center gap-4">
          <Badge variant="outline" className="text-sm border-blue-500/50 text-blue-500">
            Playoff Phase
          </Badge>
          <Badge variant="outline" className="text-sm">
            {playoffMatches.filter((m) => m.completed).length} / {playoffMatches.length} matches
          </Badge>
          {playoffComplete && (
            <Badge className="bg-green-500">Playoff Complete!</Badge>
          )}
        </div>
      )}

      {/* Main content: playoff, empty state, or bracket */}
      {matches.length === 0 && playoffMatches.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>{tFinals('noBracketYet')}</CardTitle>
            <CardDescription>{tFinals('generateBracketDesc')}</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">{tFinals('bracketExplanation')}</p>
            <ul className="list-disc list-inside mt-4 space-y-2 text-sm text-muted-foreground">
              <li><strong>{tFinals('winnersBracket')}</strong> {tFinals('winnersBracketDesc')}</li>
              <li><strong>{tFinals('losersBracket')}</strong> {tFinals('losersBracketDesc')}</li>
              <li><strong>{tFinals('grandFinal')}</strong> {tFinals('grandFinalDesc')}</li>
              <li><strong>{tFinals('resetMatch')}</strong> {tFinals('resetMatchDesc')}</li>
            </ul>
          </CardContent>
        </Card>
      ) : playoffMatches.length > 0 && matches.length > 0 ? (
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
          onMatchClick={isAdmin ? (openScoreDialog as unknown as (match: { id: string }) => void) : undefined}
        />
          </TabsContent>
          <TabsContent value="playoff">
            <PlayoffBracket
              playoffMatches={playoffMatches}
              playoffStructure={playoffStructure}
              roundNames={roundNames}
              seededPlayers={playoffSeededPlayers}
              onMatchClick={isAdmin ? (openScoreDialog as unknown as (match: { id: string }) => void) : undefined}
            />
          </TabsContent>
        </Tabs>
      ) : playoffMatches.length > 0 ? (
        <>
          <PlayoffBracket
            playoffMatches={playoffMatches}
            playoffStructure={playoffStructure}
            roundNames={roundNames}
            seededPlayers={playoffSeededPlayers}
            onMatchClick={isAdmin ? (openScoreDialog as unknown as (match: { id: string }) => void) : undefined}
          />
          {playoffComplete && isAdmin && (
            <Card className="border-green-500/50 bg-green-500/10">
              <CardContent className="py-4 text-center">
                <p className="text-sm text-muted-foreground mb-3">All playoff matches complete! Create the upper bracket to continue.</p>
                <Button onClick={handleCreateUpperBracket}>Create Upper Bracket</Button>
              </CardContent>
            </Card>
          )}
        </>
      ) : (
        <DoubleEliminationBracket
          matches={matches}
          bracketStructure={bracketStructure}
          roundNames={roundNames}
          seededPlayers={seededPlayers}
          onMatchClick={isAdmin ? (openScoreDialog as unknown as (match: { id: string }) => void) : undefined}
        />
      )}

      {/* Score entry dialog: admin-only.
           GP finals use cup-based race entry with driver points (§7.5),
           not raw score inputs like BM/MR finals. */}
      {isAdmin && <Dialog open={isScoreDialogOpen} onOpenChange={setIsScoreDialogOpen}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-[calc(100vw-2rem)] sm:max-w-4xl max-h-[90vh] overflow-y-auto p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>{tFinals('enterMatchScore')}</DialogTitle>
            <DialogDescription>
              {selectedMatch && (
                <>
                  Match #{selectedMatch.matchNumber}:{" "}
                  {selectedMatch.player1.nickname} vs{" "}
                  {selectedMatch.player2.nickname}
                  {selectedMatch.round && (
                    <span className="block text-xs mt-1">
                      {roundNames[selectedMatch.round] || selectedMatch.round}
                    </span>
                  )}
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {/* Cup display with §7.1 substitution toggle. scoreForm.cup is
              always set by openScoreDialog: either from the match's assigned
              cup or a random fallback for legacy matches. The substitution
              toggle is only offered when the match has a server-assigned
              cup, since substitution is a rule about the originally assigned
              cup. */}
            {scoreForm.cup && (
              <div className="flex items-center gap-3">
                <Badge variant="outline">{tGp('cupLabel', { cup: scoreForm.cup })}</Badge>
                {selectedMatch?.cup && CUP_SUBSTITUTIONS[selectedMatch.cup] && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs h-6"
                    onClick={() => {
                      const sub = CUP_SUBSTITUTIONS[selectedMatch.cup!];
                      const next = scoreForm.cup === selectedMatch.cup ? (sub ?? "") : (selectedMatch.cup ?? "");
                      setScoreForm((current) => ({
                        ...current,
                        cup: next,
                        races: getCupCourses(next).map((course) => ({ course, position1: null, position2: null })),
                      }));
                    }}
                  >
                    {scoreForm.cup === selectedMatch.cup
                      ? tGp('switchToSubstitute', { cup: CUP_SUBSTITUTIONS[selectedMatch.cup] })
                      : tGp('switchBackToAssigned', { cup: selectedMatch.cup })}
                  </Button>
                )}
              </div>
            )}

            {/* Manual total-score override (mirrors the qualification page).
              When enabled, race entry is hidden and the raw driver-points
              totals are written directly. */}
            <div className="space-y-3 rounded-lg border p-4">
              <div className="flex items-start gap-3">
                <Checkbox
                  id="gp-finals-manual-score"
                  checked={manualScoreEnabled}
                  onCheckedChange={(checked) => setManualScoreEnabled(checked === true)}
                />
                <div className="space-y-1">
                  <Label htmlFor="gp-finals-manual-score">{tGp('manualTotalScore')}</Label>
                  <p className="text-sm text-muted-foreground">
                    {tGp('manualTotalScoreDesc')}
                  </p>
                </div>
              </div>

              {manualScoreEnabled && selectedMatch && (
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="finals-manual-points1">{selectedMatch.player1.nickname}</Label>
                    <Input
                      id="finals-manual-points1"
                      type="number"
                      min="0"
                      step="1"
                      inputMode="numeric"
                      value={manualPoints1}
                      onChange={(e) => setManualPoints1(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="finals-manual-points2">{selectedMatch.player2.nickname}</Label>
                    <Input
                      id="finals-manual-points2"
                      type="number"
                      min="0"
                      step="1"
                      inputMode="numeric"
                      value={manualPoints2}
                      onChange={(e) => setManualPoints2(e.target.value)}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Race-by-race entry table (5 races per cup) */}
            {!manualScoreEnabled && scoreForm.cup && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-16">{tCommon('race')}</TableHead>
                    <TableHead>{tCommon('course')}</TableHead>
                    <TableHead className="text-center">{tGp('p1Position')}</TableHead>
                    <TableHead className="text-center">{tGp('p2Position')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {scoreForm.races.map((race, index) => (
                    <TableRow key={`race-${selectedMatch?.id}-${index}`}>
                      <TableCell className="font-medium">
                        {tCommon('race')} {index + 1}
                      </TableCell>
                      <TableCell className="text-sm">
                        {COURSE_INFO.find((c) => c.abbr === race.course)?.name || race.course}
                      </TableCell>
                      <TableCell>
                        <Select
                          value={race.position1?.toString() || ""}
                          onValueChange={(value) => {
                            const newRaces = [...scoreForm.races];
                            newRaces[index] = { ...newRaces[index], position1: value === "" ? null : parseInt(value, 10) };
                            setScoreForm((current) => ({ ...current, races: newRaces }));
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder={tCommon('position')} />
                          </SelectTrigger>
                          <SelectContent>
                            {GP_POSITION_OPTIONS.map((position) => (
                              <SelectItem key={`admin-p1-${index}-${position}`} value={position.toString()}>
                                {fmtPos(position)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Select
                          value={race.position2?.toString() || ""}
                          onValueChange={(value) => {
                            const newRaces = [...scoreForm.races];
                            newRaces[index] = { ...newRaces[index], position2: value === "" ? null : parseInt(value, 10) };
                            setScoreForm((current) => ({ ...current, races: newRaces }));
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder={tCommon('position')} />
                          </SelectTrigger>
                          <SelectContent>
                            {GP_POSITION_OPTIONS.map((position) => (
                              <SelectItem key={`admin-p2-${index}-${position}`} value={position.toString()}>
                                {fmtPos(position)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}

            {/* Live driver points calculation preview */}
            <div className="bg-muted p-4 rounded-lg">
              <p className="text-sm font-medium mb-2">{tGp('driverPoints')}</p>
              {selectedMatch && (
                <div className="flex flex-col gap-2 sm:flex-row sm:justify-center sm:gap-4">
                  <div>
                    <span className="text-sm">{selectedMatch.player1.nickname}:</span>
                    <span className="ml-2 font-bold">{livePoints1} pts</span>
                  </div>
                  <div>
                    <span className="text-sm">{selectedMatch.player2.nickname}:</span>
                    <span className="ml-2 font-bold">{livePoints2} pts</span>
                  </div>
                </div>
              )}
            </div>

            {/* Sudden-death winner selection for tied totals (§7.5). Shown
              whenever the form is otherwise submit-ready and tied, including
              the 0-0 case (manual override or all-game-over race mode). */}
            {tiedAndReady && (
              <div className="space-y-2">
                <Label>{tFinals('suddenDeathWinner')}</Label>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <Button
                    type="button"
                    variant={scoreForm.suddenDeathWinnerId === selectedMatch?.player1Id ? "default" : "outline"}
                    onClick={() => setScoreForm((current) => ({
                      ...current,
                      suddenDeathWinnerId: selectedMatch?.player1Id ?? "",
                    }))}
                  >
                    {selectedMatch?.player1.nickname}
                  </Button>
                  <Button
                    type="button"
                    variant={scoreForm.suddenDeathWinnerId === selectedMatch?.player2Id ? "default" : "outline"}
                    onClick={() => setScoreForm((current) => ({
                      ...current,
                      suddenDeathWinnerId: selectedMatch?.player2Id ?? "",
                    }))}
                  >
                    {selectedMatch?.player2.nickname}
                  </Button>
                </div>
              </div>
            )}
            <p className={`text-sm text-center ${
              tiedAndReady && !scoreForm.suddenDeathWinnerId
                ? 'text-yellow-600' : 'invisible'
            }`}>
              {tFinals('gpTieNeedsWinner')}
            </p>
          </div>
          <DialogFooter>
            <Button
              onClick={handleScoreSubmit}
              disabled={
                !scoreInputsReady ||
                /* Any tie — including 0-0 — needs a sudden-death winner. The
                 * server rejects all tied scores without suddenDeathWinnerId,
                 * so the client must not let a tie slip through even when
                 * both totals are zero (Codex review, PR #588). */
                (tiedAndReady && !scoreForm.suddenDeathWinnerId)
              }
            >
              {tCommon('saveScore')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>}
    </div>
  );
}
