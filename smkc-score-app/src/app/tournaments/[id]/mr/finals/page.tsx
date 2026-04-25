/**
 * Match Race Finals Page
 *
 * Double elimination tournament bracket page for MR finals.
 * Features:
 * - Visual bracket display using DoubleEliminationBracket component
 * - Bracket generation from top 8 qualifiers
 * - Match result entry via dialog
 * - Champion announcement
 * - Real-time polling for live tournament updates
 * - Bracket reset with confirmation dialog
 *
 * MR finals use best-of-5 races with course selection.
 * The bracket follows standard double elimination with
 * winners bracket, losers bracket, grand final, and reset.
 *
 * @route /tournaments/[id]/mr/finals
 */
"use client";

import { useState, useEffect, useCallback, use } from "react";
import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import Link from "next/link";
import { Button } from "@/components/ui/button";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { COURSE_INFO, POLLING_INTERVAL, TV_NUMBER_OPTIONS, type CourseAbbr } from "@/lib/constants";
import { getMrFinalsMaxRounds, getMrFinalsTargetWins } from "@/lib/finals-target-wins";
import { usePolling } from "@/lib/hooks/usePolling";
import { UpdateIndicator } from "@/components/ui/update-indicator";
import { CardSkeleton } from "@/components/ui/loading-skeleton";
import { createLogger } from "@/lib/client-logger";
import { parseManualScore } from "@/lib/parse-manual-score";
import type { Player } from "@/lib/types";

/** Client-side logger for error tracking */
const logger = createLogger({ serviceName: 'tournaments-mr-finals' });

/** MR finals match record */
interface MRMatch {
  id: string;
  matchNumber: number;
  round: string | null;
  stage?: string | null;
  tvNumber?: number | null;
  player1Id: string;
  player2Id: string;
  score1: number;
  score2: number;
  completed: boolean;
  assignedCourses?: string[];
  rounds?: { course: string; winner: number }[];
  player1: Player;
  player2: Player;
}

/** Abstract bracket match structure */
interface BracketMatch {
  matchNumber: number;
  round: string;
  bracket: "winners" | "losers" | "grand_final";
  player1Seed?: number;
  player2Seed?: number;
}

/** Player with seed number from qualification */
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

function getMatchWinner(match: MRMatch): Player | null {
  if (!match.completed) return null;
  if (match.score1 > match.score2) return match.player1;
  if (match.score2 > match.score1) return match.player2;
  return null;
}

function getCompletedChampion(matches: MRMatch[]): Player | null {
  const reset = matches.find((m) => m.round === "grand_final_reset" && m.completed);
  if (reset) return getMatchWinner(reset);

  const grandFinal = matches.find((m) => m.round === "grand_final" && m.completed);
  if (!grandFinal || grandFinal.score1 <= grandFinal.score2) return null;
  return grandFinal.player1;
}

/** Individual race round entry */
interface Round {
  course: CourseAbbr | "";
  winner: number | null;
}

function createEmptyRounds(count: number): Round[] {
  return Array.from({ length: count }, () => ({ course: "", winner: null }));
}

function buildInitialRounds(match: MRMatch): Round[] {
  const maxRounds = getMrFinalsMaxRounds(match);

  if (match.rounds && match.rounds.length > 0) {
    const existingRounds = match.rounds.map((round) => ({
      course: (round.course as CourseAbbr) ?? "",
      winner: round.winner,
    })).slice(0, maxRounds); // Limit to maxRounds to avoid displaying extra rounds
    return [
      ...existingRounds,
      ...createEmptyRounds(Math.max(0, maxRounds - existingRounds.length)),
    ];
  }

  if (Array.isArray(match.assignedCourses) && match.assignedCourses.length > 0) {
    const assignedRounds = match.assignedCourses.slice(0, maxRounds).map((course) => ({
      course: course as CourseAbbr,
      winner: null,
    }));
    return [
      ...assignedRounds,
      ...createEmptyRounds(Math.max(0, maxRounds - assignedRounds.length)),
    ];
  }

  return createEmptyRounds(maxRounds);
}

function hasFixedAssignedCourses(match: MRMatch | null): boolean {
  return Boolean(match && Array.isArray(match.assignedCourses) && match.assignedCourses.length > 0);
}

export default function MatchRaceFinals({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: tournamentId } = use(params);
  const { data: session } = useSession();

  /** Admin role check: only admins can generate/reset brackets and enter scores */
  const isAdmin = session?.user && session.user.role === 'admin';

  /**
   * i18n translation hooks for Match Race Finals page.
   * - 'finals': Shared finals bracket strings (generate, reset, champion, etc.)
   * - 'mr': Match Race mode-specific strings (page title)
   * - 'common': Shared UI strings (cancel, save, etc.)
   * Hooks must be called at the top of the component before any state/effect hooks.
   */
  const tFinals = useTranslations('finals');
  const tMr = useTranslations('mr');
  const tCommon = useTranslations('common');

  const [matches, setMatches] = useState<MRMatch[]>([]);
  const [bracketStructure, setBracketStructure] = useState<BracketMatch[]>([]);
  const [seededPlayers, setSeededPlayers] = useState<SeededPlayer[]>([]);
  const [roundNames, setRoundNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [bracketSize, setBracketSize] = useState<8 | 16 | 24>(8);
  /** Apply topN from sessionStorage if set by qualification page */
  useEffect(() => {
    const stored = sessionStorage.getItem('mr_finals_topN');
    if (stored === '24' || stored === '16') {
      setBracketSize(parseInt(stored) as 8 | 16 | 24);
    }
    sessionStorage.removeItem('mr_finals_topN');
  }, []);
  const [phase, setPhase] = useState<'playoff' | 'finals' | undefined>(undefined);
  const [playoffMatches, setPlayoffMatches] = useState<MRMatch[]>([]);
  const [playoffStructure, setPlayoffStructure] = useState<BracketMatch[]>([]);
  const [playoffSeededPlayers, setPlayoffSeededPlayers] = useState<SeededPlayer[]>([]);
  const [playoffComplete, setPlayoffComplete] = useState(false);
  const [isMatchDialogOpen, setIsMatchDialogOpen] = useState(false);
  const [selectedMatch, setSelectedMatch] = useState<MRMatch | null>(null);
  const [rounds, setRounds] = useState<Round[]>(createEmptyRounds(getMrFinalsMaxRounds()));
  /* Admin override: skip round entry and write raw best-of-N totals.
   * Mirrors the qualification page's manual-total form. */
  const [manualScoreEnabled, setManualScoreEnabled] = useState(false);
  const [manualScore1, setManualScore1] = useState<string>("");
  const [manualScore2, setManualScore2] = useState<string>("");
  const [selectedTvNumber, setSelectedTvNumber] = useState<number | null>(null);
  const [broadcasting, setBroadcasting] = useState(false);
  const [tvSaving, setTvSaving] = useState(false);
  const [champion, setChampion] = useState<Player | null>(null);
  const selectedMatchTargetWins = selectedMatch ? getMrFinalsTargetWins(selectedMatch) : getMrFinalsTargetWins();

  /**
   * Fetch finals bracket data including matches,
   * bracket structure, and round display names.
   */
  const fetchFinalsData = useCallback(async () => {
    const response = await fetch(`/api/tournaments/${tournamentId}/mr/finals`);

    if (!response.ok) {
      throw new Error(`Failed to fetch MR finals data: ${response.status}`);
    }

    const json = await response.json();
    const data = unwrapApiData<{
      matches?: MRMatch[];
      playoffMatches?: MRMatch[];
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

  /* Poll at the standard interval for live tournament updates */
  const { data: pollData, isLoading: pollLoading, lastUpdated, isPolling, refetch } = usePolling(
    fetchFinalsData, {
    interval: POLLING_INTERVAL,
  });

  /* Update local state from polling data */
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
   * Generate the finals bracket from top 8 qualification results.
   * For Top 24, Phase 1 creates the playoff bracket.
   */
  const handleCreateBracket = async () => {
    setCreating(true);
    try {
      const response = await fetch(`/api/tournaments/${tournamentId}/mr/finals`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topN: bracketSize }),
      });

      if (response.ok) {
        const json = await response.json();
        const data = unwrapApiData<{
          matches?: MRMatch[];
          playoffMatches?: MRMatch[];
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
      const metadata = err instanceof Error ? { message: err.message, stack: err.stack } : { error: err };
      logger.error("Failed to create bracket:", metadata);
      alert(tFinals('failedCreateBracket'));
    } finally {
      setCreating(false);
    }
  };

  const handleCreateUpperBracket = async () => {
    setCreating(true);
    try {
      const response = await fetch(`/api/tournaments/${tournamentId}/mr/finals`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topN: 24 }),
      });

      if (response.ok) {
        const json = await response.json();
        const data = unwrapApiData<{
          matches?: MRMatch[];
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
   * Persist a TV# selection from the bracket card immediately. See
   * BM finals page for rationale — the bracket dropdown saves on change so
   * the score dialog isn't required just to assign a broadcast slot.
   */
  const handleBracketTvNumberChange = async (
    match: MRMatch,
    tvNumber: number | null,
  ) => {
    try {
      const response = await fetch(`/api/tournaments/${tournamentId}/mr/finals`, {
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
      }
      refetch();
    } catch (err) {
      const metadata = err instanceof Error ? { message: err.message, stack: err.stack } : { error: err };
      logger.error('Failed to assign TV number from bracket:', metadata);
      toast.error(tFinals('failedAssignTv'));
    }
  };

  /**
   * Open match result dialog, pre-filling existing round data if available.
   */
  const openMatchDialog = (match: MRMatch) => {
    setSelectedMatch(match);
    setRounds(buildInitialRounds(match));
    /* Reset manual override; pre-fill inputs with the stored totals so
     * toggling on doesn't clobber them. */
    setManualScoreEnabled(false);
    setManualScore1(String(match.score1 ?? 0));
    setManualScore2(String(match.score2 ?? 0));
    setSelectedTvNumber(match.tvNumber ?? null);
    setIsMatchDialogOpen(true);
  };

  /**
   * Submit match result for a finals match.
   * Validates courses and winner, then updates via API.
   * Checks response for tournament completion.
   */
  const handleMatchSubmit = async () => {
    if (!selectedMatch) return;

    /* Manual-override path: skip round entry and write the raw totals.
     * Server preserves the existing rounds[] because `rounds` is undefined
     * in the body (putAdditionalFields only copies defined keys). */
    const body: Record<string, unknown> = { matchId: selectedMatch.id };

    if (manualScoreEnabled) {
      /* Strict parse: reject "5.9", "1e2", etc. that parseInt would
       * silently truncate into a valid-looking integer and slip past the
       * target-wins check below. */
      const score1 = parseManualScore(manualScore1);
      const score2 = parseManualScore(manualScore2);
      if (score1 === null || score2 === null) {
        alert(tMr('manualScoreValidation'));
        return;
      }
      const target = selectedMatchTargetWins;
      /* Best-of-N contract: exactly one side reaches target, the other stays
       * strictly below. This matches the race-entry validation below. */
      if (
        (score1 !== target || score2 >= target) &&
        (score2 !== target || score1 >= target)
      ) {
        alert(tCommon('matchMustHaveWinner'));
        return;
      }
      body.score1 = score1;
      body.score2 = score2;
    } else {
      if (rounds.some((round) => round.course === "")) {
        alert(tCommon('select5UniqueCourses'));
        return;
      }

      const usedCourses = rounds.map((round) => round.course).filter((course) => course !== "");
      if (new Set(usedCourses).size !== usedCourses.length) {
        alert(tCommon('select5UniqueCourses'));
        return;
      }

      /* Count wins and validate a winner */
      const winnerCount = rounds.filter(r => r.winner === 1).length;
      const loserCount = rounds.filter(r => r.winner === 2).length;

      if (
        (winnerCount !== selectedMatchTargetWins || loserCount >= selectedMatchTargetWins) &&
        (loserCount !== selectedMatchTargetWins || winnerCount >= selectedMatchTargetWins)
      ) {
        alert(tCommon('matchMustHaveWinner'));
        return;
      }

      body.score1 = winnerCount;
      body.score2 = loserCount;
      body.rounds = rounds;
    }
    body.tvNumber = selectedTvNumber;

    try {
      const response = await fetch(`/api/tournaments/${tournamentId}/mr/finals`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (response.ok) {
        const json = await response.json();
        const data = unwrapApiData<{ isComplete?: boolean; champion?: string; playoffComplete?: boolean }>(json);
        setIsMatchDialogOpen(false);
        setSelectedMatch(null);
        setRounds(createEmptyRounds(getMrFinalsMaxRounds()));
        setManualScoreEnabled(false);
        setManualScore1("");
        setManualScore2("");
        if (data.playoffComplete !== undefined) {
          setPlayoffComplete(data.playoffComplete);
        }
        refetch();

        /* Check if tournament is complete and announce champion */
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
        alert(error.error || tFinals('failedUpdateMatch'));
      }
    } catch (err) {
      const metadata = err instanceof Error ? { message: err.message, stack: err.stack } : { error: err };
      logger.error("Failed to update match:", metadata);
      alert(tFinals('failedUpdateMatch'));
    }
  };

  /* Track tournament progress */
  const completedMatches = matches.filter((m) => m.completed).length;
  const totalMatches = matches.length;
  const qualificationConfirmed = pollData?.qualificationConfirmed ?? false;

  /* Loading skeleton */
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
      {/* Page header with action buttons */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4">
        <div>
          {/* i18n: Page title from 'mr' namespace, subtitle from 'finals' namespace */}
          <h1 className="text-3xl font-bold">{tMr('finalsTitle')}</h1>
          <p className="text-muted-foreground">
            {tFinals('doubleElimination')}
          </p>
          <div className="mt-2">
            <UpdateIndicator lastUpdated={lastUpdated} isPolling={isPolling} />
          </div>
        </div>
        <div className="flex gap-2">
          {/* Generate or Reset bracket: admin-only */}
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
            <Link href={`/tournaments/${tournamentId}/mr`}>
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
            <div className="text-4xl mb-2">&#127942;</div>
            {/* i18n: Champion announcement */}
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
              <li><strong>{tFinals('fiveRaces')}</strong> {tFinals('fiveRacesDesc')}</li>
              <li><strong>{tFinals('firstTo3')}</strong> {tFinals('firstTo3Desc')}</li>
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
              onMatchClick={isAdmin ? openMatchDialog : undefined}
              onTvNumberChange={isAdmin ? handleBracketTvNumberChange : undefined}
            />
          </TabsContent>
          <TabsContent value="playoff">
            <PlayoffBracket
              playoffMatches={playoffMatches}
              playoffStructure={playoffStructure}
              roundNames={roundNames}
              seededPlayers={playoffSeededPlayers}
              onMatchClick={isAdmin ? openMatchDialog : undefined}
              onTvNumberChange={isAdmin ? handleBracketTvNumberChange : undefined}
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
            onMatchClick={isAdmin ? openMatchDialog : undefined}
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
          matches={matches}
          bracketStructure={bracketStructure}
          roundNames={roundNames}
          seededPlayers={seededPlayers}
          onMatchClick={isAdmin ? openMatchDialog : undefined}
          onTvNumberChange={isAdmin ? handleBracketTvNumberChange : undefined}
        />
      )}

      {/* Match result entry dialog: admin-only */}
      {isAdmin && <Dialog open={isMatchDialogOpen} onOpenChange={setIsMatchDialogOpen}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-[calc(100vw-2rem)] sm:max-w-3xl max-h-[90vh] overflow-y-auto p-4 sm:p-6">
          <DialogHeader>
            {/* i18n: Match result dialog title */}
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
            {/* Manual total-score override (mirrors the qualification page).
              When enabled, race-by-race entry is hidden and the raw
              best-of-N totals are written directly. */}
            <div className="space-y-3 rounded-lg border p-4">
              <div className="flex items-start gap-3">
                <Checkbox
                  id="mr-finals-manual-score"
                  checked={manualScoreEnabled}
                  onCheckedChange={(checked) => setManualScoreEnabled(checked === true)}
                />
                <div className="space-y-1">
                  <Label htmlFor="mr-finals-manual-score">{tMr('manualTotalScore')}</Label>
                  <p className="text-sm text-muted-foreground">
                    {tMr('manualTotalScoreDesc')}
                  </p>
                </div>
              </div>

              {manualScoreEnabled && selectedMatch && (
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="mr-finals-manual-score1">{selectedMatch.player1.nickname}</Label>
                    <Input
                      id="mr-finals-manual-score1"
                      type="number"
                      min="0"
                      step="1"
                      inputMode="numeric"
                      value={manualScore1}
                      onChange={(e) => setManualScore1(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="mr-finals-manual-score2">{selectedMatch.player2.nickname}</Label>
                    <Input
                      id="mr-finals-manual-score2"
                      type="number"
                      min="0"
                      step="1"
                      inputMode="numeric"
                      value={manualScore2}
                      onChange={(e) => setManualScore2(e.target.value)}
                    />
                  </div>
                </div>
              )}
            </div>

            {!manualScoreEnabled && <Table>
              <TableHeader>
                <TableRow>
                  {/* i18n: Table headers for race entry */}
                  <TableHead className="w-16">{tCommon('race')}</TableHead>
                  <TableHead>{tCommon('course')}</TableHead>
                  <TableHead className="text-center">{tCommon('winner')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rounds.map((round, index) => (
                  <TableRow key={index}>
                    {/* i18n: Race number label */}
                    <TableCell className="font-medium">{tCommon('race')} {index + 1}</TableCell>
                    <TableCell>
                      {hasFixedAssignedCourses(selectedMatch) ? (
                        <span className="block rounded-md border bg-muted px-3 py-2 text-sm text-muted-foreground">
                          {round.course
                            ? `${COURSE_INFO.find((course) => course.abbr === round.course)?.name || round.course} (${COURSE_INFO.find((course) => course.abbr === round.course)?.cup || ""})`
                            : "—"}
                        </span>
                      ) : (
                        <Select
                          value={round.course}
                          onValueChange={(value) => {
                            const newRounds = [...rounds];
                            newRounds[index].course = value as CourseAbbr;
                            setRounds(newRounds);
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder={tCommon('selectCourse')} />
                          </SelectTrigger>
                          <SelectContent>
                            {COURSE_INFO.map((course) => (
                              <SelectItem key={course.abbr} value={course.abbr}>
                                {course.name} ({course.cup})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="min-w-0 max-w-28 truncate text-sm" title={selectedMatch?.player1.nickname}>
                          {selectedMatch?.player1.nickname}
                        </span>
                        <Button
                          variant={round.winner === 1 ? "default" : "outline"}
                          size="sm"
                          className="w-10 px-0"
                          onClick={() => {
                            const newRounds = [...rounds];
                            newRounds[index].winner = round.winner === 1 ? null : 1;
                            setRounds(newRounds);
                          }}
                        >
                          {round.winner === 1 ? "\u2713" : "-"}
                        </Button>
                        <Button
                          variant={round.winner === 2 ? "default" : "outline"}
                          size="sm"
                          className="w-10 px-0"
                          onClick={() => {
                            const newRounds = [...rounds];
                            newRounds[index].winner = round.winner === 2 ? null : 2;
                            setRounds(newRounds);
                          }}
                        >
                          {round.winner === 2 ? "\u2713" : "-"}
                        </Button>
                        <span className="min-w-0 max-w-28 truncate text-sm" title={selectedMatch?.player2.nickname}>
                          {selectedMatch?.player2.nickname}
                        </span>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>}
          </div>
          {/* TV number assignment for broadcast: explicit save button (#651)
              lets admins assign TV# before scores are entered. */}
          <div className="flex items-center gap-3 px-1">
            <Label htmlFor="mr-finals-tv" className="text-sm text-muted-foreground shrink-0">TV#</Label>
            <select
              id="mr-finals-tv"
              className="w-20 h-8 text-center text-sm border rounded bg-background"
              value={selectedTvNumber ?? ""}
              onChange={(e) => setSelectedTvNumber(e.target.value ? parseInt(e.target.value) : null)}
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
                  await handleBracketTvNumberChange(selectedMatch, selectedTvNumber);
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
                    const roundKey = selectedMatch.round ?? "";
                    const roundName = roundNames[roundKey] || roundKey;
                    const matchLabel = roundName ? `決勝 ${roundName}` : "決勝";
                    const res = await fetch(`/api/tournaments/${tournamentId}/broadcast`, {
                      method: "PUT",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        player1Name: selectedMatch.player1.nickname,
                        player2Name: selectedMatch.player2.nickname,
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
            {/* i18n: Save result button */}
            <Button
              onClick={handleMatchSubmit}
              disabled={(() => {
                if (manualScoreEnabled) {
                  const s1 = parseManualScore(manualScore1);
                  const s2 = parseManualScore(manualScore2);
                  if (s1 === null || s2 === null) return true;
                  const target = selectedMatchTargetWins;
                  const validWinner =
                    (s1 === target && s2 < target) || (s2 === target && s1 < target);
                  return !validWinner;
                }
                return (
                  (
                    rounds.filter(r => r.winner === 1).length !== selectedMatchTargetWins ||
                    rounds.filter(r => r.winner === 2).length >= selectedMatchTargetWins
                  ) &&
                  (
                    rounds.filter(r => r.winner === 2).length !== selectedMatchTargetWins ||
                    rounds.filter(r => r.winner === 1).length >= selectedMatchTargetWins
                  )
                );
              })()}
            >
              {tCommon('saveResult')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>}
    </div>
  );
}
