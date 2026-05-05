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

import { useState, useEffect, useCallback, useMemo, use } from "react";
import { useSession } from "next-auth/react";
import { useLocale, useTranslations } from "next-intl";
import { XIcon } from "lucide-react";
import { toast } from "sonner";
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
import { COURSE_INFO, CUPS, CUP_SUBSTITUTIONS, GP_POSITION_OPTIONS, POLLING_INTERVAL, TOTAL_GP_RACES, TV_NUMBER_OPTIONS, getDriverPoints, type CourseAbbr } from "@/lib/constants";
import { formatGpPosition } from "@/lib/gp-utils";
import { usePolling } from "@/lib/hooks/usePolling";
import { UpdateIndicator } from "@/components/ui/update-indicator";
import { CardSkeleton } from "@/components/ui/loading-skeleton";
import { createLogger } from "@/lib/client-logger";
import { canResetFinalsFromQualification } from "@/lib/finals-action-availability";
import { parseManualScore } from "@/lib/parse-manual-score";
import type { Player } from "@/lib/types";
import { buildMatchLabel } from "@/lib/overlay/phase";
import { getGpFinalsTargetWins } from "@/lib/finals-target-wins";
import { getCupForFormIndex, isRemovableCupForm, removeCupFormAt } from "@/lib/gp-finals-score-form";
import { GP_DRIVER_POINTS_INPUT_PROPS } from "@/lib/gp-driver-points-input";

/** Client-side logger for error tracking */
const logger = createLogger({ serviceName: 'tournaments-gp-finals' });

/** Individual race entry in the finals score form */
interface Race {
  course: CourseAbbr | "";
  position1: number | null;
  position2: number | null;
}

interface CupScoreForm {
  cup: string;
  races: Race[];
  manualEnabled: boolean;
  manualPoints1: string;
  manualPoints2: string;
}

/** GP finals match with cup-based race results and driver points (§7.5) */
interface GPMatch {
  id: string;
  matchNumber: number;
  stage?: string | null;
  player1Id: string;
  player2Id: string;
  points1: number;
  points2: number;
  completed: boolean;
  cup?: string;
  assignedCups?: string[];
  tvNumber?: number | null;
  player1: Player;
  player2: Player;
  races?: {
    course: string;
    position1: number;
    position2: number;
    points1: number;
    points2: number;
  }[];
  cupResults?: {
    cup: string;
    points1: number;
    points2: number;
    winner: 1 | 2 | null;
    races?: {
      course: string;
      position1: number;
      position2: number;
      points1: number;
      points2: number;
    }[];
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
    cup: string;
    races: Race[];
    tvNumber: number | null;
  }>({ cup: "", races: [], tvNumber: null });
  const [cupForms, setCupForms] = useState<CupScoreForm[]>([]);
  const [champion, setChampion] = useState<Player | null>(null);
  const [broadcasting, setBroadcasting] = useState(false);
  const [tvSaving, setTvSaving] = useState(false);

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

  const nextCupName = (index: number, preferred?: string, assignedCups?: string[]) => {
    return getCupForFormIndex(index, assignedCups, CUPS, preferred);
  };

  const makeBlankCupForm = (index: number, preferred?: string, assignedCups?: string[]): CupScoreForm => {
    const cup = nextCupName(index, preferred, assignedCups);
    return {
      cup,
      races: getCupCourses(cup).map((course) => ({ course, position1: null, position2: null })),
      manualEnabled: false,
      manualPoints1: "",
      manualPoints2: "",
    };
  };

  const getTargetWinsForMatch = (match?: Pick<GPMatch, "round"> & { stage?: string | null } | null) =>
    getGpFinalsTargetWins({ round: match?.round, stage: match?.stage ?? "finals" });

  const getLockedCupCountForMatch = (match?: Pick<GPMatch, "round"> & { stage?: string | null } | null) =>
    getTargetWinsForMatch(match);

  const calculateCupPoints = (cup: CupScoreForm) => {
    if (cup.manualEnabled) {
      const p1 = parseManualScore(cup.manualPoints1);
      const p2 = parseManualScore(cup.manualPoints2);
      return { valid: p1 !== null && p2 !== null, points1: p1 ?? 0, points2: p2 ?? 0 };
    }
    const ready = cup.races.length === TOTAL_GP_RACES &&
      cup.races.every((r) => r.position1 !== null && r.position2 !== null);
    return {
      valid: ready,
      points1: cup.races.reduce((acc, r) => acc + (r.position1 ? getDriverPoints(r.position1) : 0), 0),
      points2: cup.races.reduce((acc, r) => acc + (r.position2 ? getDriverPoints(r.position2) : 0), 0),
    };
  };

  const calculateCupWins = (forms: CupScoreForm[]) => forms.reduce(
    (acc, cup) => {
      const points = calculateCupPoints(cup);
      if (!points.valid) return acc;
      if (points.points1 > points.points2) acc.p1 += 1;
      else if (points.points2 > points.points1) acc.p2 += 1;
      return acc;
    },
    { p1: 0, p2: 0 },
  );

  /**
   * Persist a TV# selection from the bracket card immediately. See BM/MR
   * finals pages for rationale — the dropdown saves on change so admins
   * don't have to enter the score dialog just to assign a broadcast slot.
   */
  const handleBracketTvNumberChange = async (
    match: { id: string; matchNumber: number; player1?: { noCamera?: boolean } | null; player2?: { noCamera?: boolean } | null },
    tvNumber: number | null,
  ) => {
    try {
      const response = await fetch(`/api/tournaments/${tournamentId}/gp/finals`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matchId: match.id, tvNumber }),
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
        /* Warn when assigning a TV slot to a match containing a NoCamera player (issue #674). */
        if (match.player1?.noCamera || match.player2?.noCamera) {
          toast.warning(tFinals('noCameraWarning'));
        }
      }
      refetch();
    } catch (err) {
      const metadata = err instanceof Error ? { message: err.message, stack: err.stack } : { error: err };
      logger.error('Failed to assign TV number from bracket:', metadata);
      toast.error(tFinals('failedAssignTv'));
    }
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
      races = match.races.map((r) => ({
        course: r.course as CourseAbbr,
        position1: r.position1,
        position2: r.position2,
      }));
    } else if (cup) {
      races = getCupCourses(cup).map((course) => ({ course, position1: null, position2: null }));
    } else {
      races = Array.from({ length: TOTAL_GP_RACES }, () => ({ course: "" as CourseAbbr, position1: null, position2: null }));
    }
    const savedForms = match.cupResults && match.cupResults.length > 0
      ? match.cupResults.map((result, index) => {
          const resultCup = result.cup || nextCupName(index, cup, match.assignedCups);
          return {
            cup: resultCup,
            races: result.races && result.races.length === TOTAL_GP_RACES
              ? result.races.map((r) => ({
                  course: r.course as CourseAbbr,
                  position1: r.position1,
                  position2: r.position2,
                }))
              : getCupCourses(resultCup).map((course) => ({ course, position1: null, position2: null })),
            manualEnabled: !(result.races && result.races.length === TOTAL_GP_RACES),
            manualPoints1: String(result.points1 ?? 0),
            manualPoints2: String(result.points2 ?? 0),
          };
        })
      : [makeBlankCupForm(0, cup, match.assignedCups)];
    const lockedCupCount = getLockedCupCountForMatch(match);
    const forms = Array.from(
      { length: Math.max(savedForms.length, lockedCupCount) },
      (_, index) => savedForms[index] ?? makeBlankCupForm(index, cup, match.assignedCups),
    );
    setScoreForm({
      cup,
      races,
      tvNumber: match.tvNumber ?? null,
    });
    setCupForms(forms);
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

    const body: Record<string, unknown> = { matchId: selectedMatch.id };

    const cupResults = [];
    for (const cup of cupForms) {
      const points = calculateCupPoints(cup);
      if (!points.valid) {
        alert(tGp('manualScoreValidation'));
        return;
      }
      cupResults.push({
        cup: cup.cup,
        points1: points.points1,
        points2: points.points2,
        races: cup.manualEnabled ? undefined : cup.races.map((r) => ({
          course: r.course,
          position1: r.position1,
          position2: r.position2,
          points1: r.position1 ? getDriverPoints(r.position1) : 0,
          points2: r.position2 ? getDriverPoints(r.position2) : 0,
        })),
      });
    }
    const wins = calculateCupWins(cupForms);
    body.score1 = wins.p1;
    body.score2 = wins.p2;
    body.cupResults = cupResults;
    body.cup = cupResults[cupResults.length - 1]?.cup ?? scoreForm.cup;
    body.races = cupResults[cupResults.length - 1]?.races;
    body.tvNumber = scoreForm.tvNumber;

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
        setScoreForm({ cup: "", races: [], tvNumber: null });
        setCupForms([]);
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

  const qualificationConfirmed = pollData?.qualificationConfirmed ?? false;
  const bracketExists = matches.length > 0 || phase === 'playoff' || playoffMatches.length > 0;
  const canGenerateBracket = isAdmin && qualificationConfirmed && !bracketExists;
  const canResetBracket = isAdmin && canResetFinalsFromQualification({
    qualificationConfirmed,
    finalsExists: bracketExists,
  });
  const cupWins = calculateCupWins(cupForms);
  const scoreInputsReady = cupForms.length > 0 && cupForms.every((cup) => calculateCupPoints(cup).valid);

  // GP stores driver points in points1/points2 (not score1/score2 like BM/MR).
  // DoubleEliminationBracket reads match.score1/score2 for winner highlighting (#759).
  // These must be declared before any early returns to satisfy rules-of-hooks.
  const gpBracketMatches = useMemo(
    () => matches.map((m) => ({ ...m, score1: m.points1, score2: m.points2 })),
    [matches],
  );
  const gpPlayoffBracketMatches = useMemo(
    () => playoffMatches.map((m) => ({ ...m, score1: m.points1, score2: m.points2 })),
    [playoffMatches],
  );

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
          {canGenerateBracket && (
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
                  <Button size="sm" variant={bracketSize === 8 ? "default" : "outline"} onClick={() => setBracketSize(8)}>{tFinals('top8')}</Button>
                  <Button size="sm" variant={bracketSize === 16 ? "default" : "outline"} onClick={() => setBracketSize(16)}>{tFinals('top16')}</Button>
                  <Button size="sm" variant={bracketSize === 24 ? "default" : "outline"} onClick={() => setBracketSize(24)}>{tFinals('top24')}</Button>
                </div>
                <AlertDialogFooter>
                  <AlertDialogCancel>{tCommon('cancel')}</AlertDialogCancel>
                  <AlertDialogAction onClick={handleCreateBracket}>
                    {tFinals('generate')} ({bracketSize} players)
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
          {canResetBracket && (
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
          )}
          <Button variant="outline" asChild>
            <a href={`/tournaments/${tournamentId}/gp`}>
              {/* i18n: Back navigation to qualification page */}
              {tFinals('backToQualification')}
            </a>
          </Button>
        </div>
      </div>

      {/* Champion announcement banner */}
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

      {/* Playoff progress badges */}
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
      ) : playoffMatches.length > 0 && bracketStructure.length > 0 ? (
        <Tabs defaultValue="finals" className="space-y-4">
          <TabsList>
            <TabsTrigger value="finals">{tFinals('upperBracket')}</TabsTrigger>
            <TabsTrigger value="playoff">{tFinals('playoffBracket')}</TabsTrigger>
          </TabsList>
          <TabsContent value="finals">
            <DoubleEliminationBracket
              matches={gpBracketMatches}
              bracketStructure={bracketStructure}
              roundNames={roundNames}
              seededPlayers={seededPlayers}
              getTargetWins={(match) => getTargetWinsForMatch(match as GPMatch | undefined)}
              onMatchClick={isAdmin ? (openScoreDialog as unknown as (match: { id: string }) => void) : undefined}
              onTvNumberChange={isAdmin ? handleBracketTvNumberChange : undefined}
            />
          </TabsContent>
          <TabsContent value="playoff">
            <PlayoffBracket
              playoffMatches={gpPlayoffBracketMatches}
              playoffStructure={playoffStructure}
              roundNames={roundNames}
              seededPlayers={playoffSeededPlayers}
              getTargetWins={(match) => getTargetWinsForMatch(match as GPMatch | undefined)}
              onMatchClick={isAdmin ? (openScoreDialog as unknown as (match: { id: string }) => void) : undefined}
              onTvNumberChange={isAdmin ? handleBracketTvNumberChange : undefined}
            />
            {matches.length === 0 && playoffComplete && isAdmin && (
              <Card className="mt-4 border-green-500/50 bg-green-500/10">
                <CardContent className="py-4 text-center">
                  <p className="text-sm text-muted-foreground mb-3">{tFinals('allPlayoffMatchesComplete')}</p>
                  <Button onClick={handleCreateUpperBracket}>{tFinals('createUpperBracket')}</Button>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      ) : playoffMatches.length > 0 ? (
        <>
          <PlayoffBracket
            playoffMatches={gpPlayoffBracketMatches}
            playoffStructure={playoffStructure}
            roundNames={roundNames}
            seededPlayers={playoffSeededPlayers}
            getTargetWins={(match) => getTargetWinsForMatch(match as GPMatch | undefined)}
            onMatchClick={isAdmin ? (openScoreDialog as unknown as (match: { id: string }) => void) : undefined}
            onTvNumberChange={isAdmin ? handleBracketTvNumberChange : undefined}
          />
          {playoffComplete && isAdmin && (
            <Card className="border-green-500/50 bg-green-500/10">
              <CardContent className="py-4 text-center">
                <p className="text-sm text-muted-foreground mb-3">{tFinals('allPlayoffMatchesComplete')}</p>
                <Button onClick={handleCreateUpperBracket}>{tFinals('createUpperBracket')}</Button>
              </CardContent>
            </Card>
          )}
        </>
      ) : (
        <DoubleEliminationBracket
          matches={gpBracketMatches}
          bracketStructure={bracketStructure}
          roundNames={roundNames}
          seededPlayers={seededPlayers}
          getTargetWins={(match) => getTargetWinsForMatch(match as GPMatch | undefined)}
          onMatchClick={isAdmin ? (openScoreDialog as unknown as (match: { id: string }) => void) : undefined}
          onTvNumberChange={isAdmin ? handleBracketTvNumberChange : undefined}
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
                      setCupForms((current) => {
                        const updated = [...current];
                        updated[0] = makeBlankCupForm(0, next, selectedMatch.assignedCups);
                        return updated.length > 0 ? updated : [makeBlankCupForm(0, next, selectedMatch.assignedCups)];
                      });
                    }}
                  >
                    {scoreForm.cup === selectedMatch.cup
                      ? tGp('switchToSubstitute', { cup: CUP_SUBSTITUTIONS[selectedMatch.cup] })
                      : tGp('switchBackToAssigned', { cup: selectedMatch.cup })}
                  </Button>
                )}
              </div>
            )}

            <div className="space-y-4">
              {cupForms.map((cup, cupIndex) => {
                const points = calculateCupPoints(cup);
                const setRacePosition = (
                  raceIndex: number,
                  field: "position1" | "position2",
                  value: string,
                ) => {
                  const next = [...cupForms];
                  const races = [...cup.races];
                  races[raceIndex] = {
                    ...races[raceIndex],
                    [field]: value === "" ? null : parseInt(value, 10),
                  };
                  next[cupIndex] = { ...cup, races };
                  setCupForms(next);
                };
                return (
                  <div
                    key={`cup-${cupIndex}`}
                    className="space-y-3 rounded-lg border p-4"
                    data-testid={`gp-finals-cup-form-${cupIndex}`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">Cup {cupIndex + 1}</Badge>
                        <Badge>{tGp('cupLabel', { cup: cup.cup })}</Badge>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="text-sm font-medium">
                          {selectedMatch?.player1.nickname}: {points.points1} pts / {selectedMatch?.player2.nickname}: {points.points2} pts
                        </div>
                        {isRemovableCupForm(cupIndex, selectedMatch ? getLockedCupCountForMatch(selectedMatch) : 1) && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Remove Cup ${cupIndex + 1}`}
                            title={`Remove Cup ${cupIndex + 1}`}
                            onClick={() => setCupForms((current) => removeCupFormAt(
                              current,
                              cupIndex,
                              selectedMatch ? getLockedCupCountForMatch(selectedMatch) : 1,
                            ))}
                          >
                            <XIcon className="size-4" />
                          </Button>
                        )}
                      </div>
                    </div>

                    <div className="flex items-start gap-3">
                      <Checkbox
                        id={`gp-finals-manual-score-${cupIndex}`}
                        checked={cup.manualEnabled}
                        onCheckedChange={(checked) => {
                          const next = [...cupForms];
                          next[cupIndex] = { ...cup, manualEnabled: checked === true };
                          setCupForms(next);
                        }}
                      />
                      <Label htmlFor={`gp-finals-manual-score-${cupIndex}`}>{tGp('manualTotalScore')}</Label>
                    </div>

                    {cup.manualEnabled && selectedMatch ? (
                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                          <Label>{selectedMatch.player1.nickname}</Label>
                          <Input
                            data-testid={`gp-finals-cup-${cupIndex}-manual-p1`}
                            {...GP_DRIVER_POINTS_INPUT_PROPS}
                            value={cup.manualPoints1}
                            onChange={(e) => {
                              const next = [...cupForms];
                              next[cupIndex] = { ...cup, manualPoints1: e.target.value };
                              setCupForms(next);
                            }}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>{selectedMatch.player2.nickname}</Label>
                          <Input
                            data-testid={`gp-finals-cup-${cupIndex}-manual-p2`}
                            {...GP_DRIVER_POINTS_INPUT_PROPS}
                            value={cup.manualPoints2}
                            onChange={(e) => {
                              const next = [...cupForms];
                              next[cupIndex] = { ...cup, manualPoints2: e.target.value };
                              setCupForms(next);
                            }}
                          />
                        </div>
                      </div>
                    ) : (
                      <>
                      <div className="space-y-3 sm:hidden" data-testid={`gp-finals-mobile-race-list-${cupIndex}`}>
                        {cup.races.map((race, raceIndex) => (
                          <div
                            key={`mobile-race-${selectedMatch?.id}-${cupIndex}-${raceIndex}`}
                            className="space-y-3 border-t border-foreground/10 pt-3 first:border-t-0 first:pt-0"
                            data-testid="gp-finals-mobile-race-entry"
                          >
                            <div className="space-y-1">
                              <div className="text-xs font-semibold uppercase text-muted-foreground">
                                {tCommon('race')} {raceIndex + 1}
                              </div>
                              <div className="text-sm font-medium break-words">
                                {COURSE_INFO.find((c) => c.abbr === race.course)?.name || race.course}
                              </div>
                            </div>
                            <div className="grid gap-3">
                              <div className="space-y-1.5">
                                <Label className="text-xs text-muted-foreground">{tGp('p1Position')}</Label>
                                <Select
                                  value={race.position1?.toString() || ""}
                                  onValueChange={(value) => setRacePosition(raceIndex, "position1", value)}
                                >
                                  <SelectTrigger className="w-full">
                                    <SelectValue placeholder={tCommon('position')} />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {GP_POSITION_OPTIONS.map((position) => (
                                      <SelectItem key={`mobile-admin-p1-${cupIndex}-${raceIndex}-${position}`} value={position.toString()}>
                                        {fmtPos(position)}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="space-y-1.5">
                                <Label className="text-xs text-muted-foreground">{tGp('p2Position')}</Label>
                                <Select
                                  value={race.position2?.toString() || ""}
                                  onValueChange={(value) => setRacePosition(raceIndex, "position2", value)}
                                >
                                  <SelectTrigger className="w-full">
                                    <SelectValue placeholder={tCommon('position')} />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {GP_POSITION_OPTIONS.map((position) => (
                                      <SelectItem key={`mobile-admin-p2-${cupIndex}-${raceIndex}-${position}`} value={position.toString()}>
                                        {fmtPos(position)}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="hidden overflow-x-auto sm:block">
                        {/* Keep enough intrinsic width for race, course, and two position selects:
                            64 + ~220 + 136 * 2 = ~556px. */}
                        <Table className="min-w-[560px]">
                          <TableHeader>
                            <TableRow>
                              <TableHead className="w-16">{tCommon('race')}</TableHead>
                              <TableHead>{tCommon('course')}</TableHead>
                              <TableHead className="text-center">{tGp('p1Position')}</TableHead>
                              <TableHead className="text-center">{tGp('p2Position')}</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {cup.races.map((race, raceIndex) => (
                              <TableRow key={`race-${selectedMatch?.id}-${cupIndex}-${raceIndex}`}>
                                <TableCell className="font-medium">{tCommon('race')} {raceIndex + 1}</TableCell>
                                <TableCell className="text-sm">
                                  {COURSE_INFO.find((c) => c.abbr === race.course)?.name || race.course}
                                </TableCell>
                                <TableCell>
                                  <Select
                                    value={race.position1?.toString() || ""}
                                    onValueChange={(value) => setRacePosition(raceIndex, "position1", value)}
                                  >
                                    <SelectTrigger>
                                      <SelectValue placeholder={tCommon('position')} />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {GP_POSITION_OPTIONS.map((position) => (
                                        <SelectItem key={`admin-p1-${cupIndex}-${raceIndex}-${position}`} value={position.toString()}>
                                          {fmtPos(position)}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </TableCell>
                                <TableCell>
                                  <Select
                                    value={race.position2?.toString() || ""}
                                    onValueChange={(value) => setRacePosition(raceIndex, "position2", value)}
                                  >
                                    <SelectTrigger>
                                      <SelectValue placeholder={tCommon('position')} />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {GP_POSITION_OPTIONS.map((position) => (
                                        <SelectItem key={`admin-p2-${cupIndex}-${raceIndex}-${position}`} value={position.toString()}>
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
                      </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-muted p-4">
              <div className="text-sm font-medium">
                Cups: {selectedMatch?.player1.nickname} {cupWins.p1} - {cupWins.p2} {selectedMatch?.player2.nickname}
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline">FT{selectedMatch ? getTargetWinsForMatch(selectedMatch) : 1}</Badge>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setCupForms((current) => [...current, makeBlankCupForm(current.length, selectedMatch?.cup, selectedMatch?.assignedCups)])}
                >
                  Add Cup
                </Button>
              </div>
            </div>
          </div>
          {/* TV number assignment for broadcast: explicit save button (#651)
              lets admins assign TV# before scores are entered. */}
          <div className="flex items-center gap-3 px-1 pb-2">
            <Label htmlFor="gp-finals-tv" className="text-sm text-muted-foreground shrink-0">TV#</Label>
            <select
              id="gp-finals-tv"
              className="w-20 h-8 text-center text-sm border rounded bg-background"
              value={scoreForm.tvNumber ?? ""}
              onChange={(e) => setScoreForm({ ...scoreForm, tvNumber: e.target.value ? parseInt(e.target.value) : null })}
            >
              <option value="">-</option>
              {TV_NUMBER_OPTIONS.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
            {selectedMatch && (
              <Button
                variant="outline"
                size="sm"
                disabled={tvSaving}
                onClick={async () => {
                  setTvSaving(true);
                  await handleBracketTvNumberChange(selectedMatch, scoreForm.tvNumber);
                  setTvSaving(false);
                }}
              >
                {tvSaving ? tCommon("saving") : tFinals("saveTvNumber")}
              </Button>
            )}
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
                    const matchLabel = buildMatchLabel(selectedMatch.round, roundNames, "gp");
                    const targetWins = getTargetWinsForMatch(selectedMatch);
                    const currentWins = calculateCupWins(cupForms);
                    const res = await fetch(`/api/tournaments/${tournamentId}/broadcast`, {
                      method: "PUT",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        player1Name: selectedMatch.player1.nickname,
                        player2Name: selectedMatch.player2.nickname,
                        player1NoCamera: selectedMatch.player1.noCamera === true,
                        player2NoCamera: selectedMatch.player2.noCamera === true,
                        matchLabel,
                        player1Wins: currentWins.p1,
                        player2Wins: currentWins.p2,
                        matchFt: targetWins,
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
              disabled={!scoreInputsReady}
            >
              {tCommon('saveScore')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>}
    </div>
  );
}
