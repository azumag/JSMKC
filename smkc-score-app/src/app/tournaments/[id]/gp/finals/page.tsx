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
 * - Real-time polling (3s interval)
 */

import { useState, useEffect, useCallback, use } from "react";
import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
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
import { DoubleEliminationBracket } from "@/components/tournament/double-elimination-bracket";
import { usePolling } from "@/lib/hooks/usePolling";
import { UpdateIndicator } from "@/components/ui/update-indicator";
import { CardSkeleton } from "@/components/ui/loading-skeleton";

interface Player {
  id: string;
  name: string;
  nickname: string;
}

/** GP finals match with score (score1/score2 = game wins in best-of-5) */
interface GPMatch {
  id: string;
  matchNumber: number;
  round: string | null;
  player1Id: string;
  player2Id: string;
  score1: number;
  score2: number;
  completed: boolean;
  player1: Player;
  player2: Player;
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

  const [matches, setMatches] = useState<GPMatch[]>([]);
  const [bracketStructure, setBracketStructure] = useState<BracketMatch[]>([]);
  const [seededPlayers, setSeededPlayers] = useState<SeededPlayer[]>([]);
  const [roundNames, setRoundNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [isScoreDialogOpen, setIsScoreDialogOpen] = useState(false);
  const [selectedMatch, setSelectedMatch] = useState<GPMatch | null>(null);
  const [scoreForm, setScoreForm] = useState({ score1: 0, score2: 0 });
  const [champion, setChampion] = useState<Player | null>(null);

  /** Fetch finals data including matches, bracket structure, and round names */
  const fetchFinalsData = useCallback(async () => {
    const response = await fetch(`/api/tournaments/${tournamentId}/gp/finals`);

    if (!response.ok) {
      throw new Error(`Failed to fetch GP finals data: ${response.status}`);
    }

    const data = await response.json();

    return {
      matches: data.matches || [],
      bracketStructure: data.bracketStructure || [],
      roundNames: data.roundNames || {},
    };
  }, [tournamentId]);

  /* Poll for bracket updates every 3 seconds */
  const { data: pollData, isLoading: pollLoading, lastUpdated, isPolling, refetch } = usePolling(
    fetchFinalsData, {
    interval: 3000,
  });

  useEffect(() => {
    if (pollData) {
      setMatches(pollData.matches);
      setBracketStructure(pollData.bracketStructure);
      setRoundNames(pollData.roundNames);
    }
  }, [pollData]);

  useEffect(() => {
    setLoading(pollLoading);
  }, [pollLoading]);

  /**
   * Generate a new double elimination bracket from the top 8 qualifiers.
   * This creates all 17 match positions (4 WB QF + 2 WB SF + 1 WB Final +
   * 4 LB R1 + 2 LB R2 + 2 LB R3 + 1 LB Final + 1 GF + 1 GF Reset = 17).
   */
  const handleCreateBracket = async () => {
    setCreating(true);
    try {
      const response = await fetch(`/api/tournaments/${tournamentId}/gp/finals`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topN: 8 }),
      });

      if (response.ok) {
        const data = await response.json();
        setMatches(data.matches || []);
        setBracketStructure(data.bracketStructure || []);
        setSeededPlayers(data.seededPlayers || []);
        refetch();
      } else {
        const error = await response.json();
        alert(error.error || "Failed to create bracket");
      }
    } catch (err) {
      console.error("Failed to create bracket:", err);
      alert("Failed to create bracket");
    } finally {
      setCreating(false);
    }
  };

  /** Open score entry dialog for a specific match */
  const openScoreDialog = (match: GPMatch) => {
    setSelectedMatch(match);
    setScoreForm({ score1: match.score1, score2: match.score2 });
    setIsScoreDialogOpen(true);
  };

  /**
   * Submit score for a finals match.
   * The API handles bracket progression (winner/loser advancement)
   * and returns whether the tournament is complete.
   */
  const handleScoreSubmit = async () => {
    if (!selectedMatch) return;

    try {
      const response = await fetch(`/api/tournaments/${tournamentId}/gp/finals`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          matchId: selectedMatch.id,
          score1: scoreForm.score1,
          score2: scoreForm.score2,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setIsScoreDialogOpen(false);
        setSelectedMatch(null);
        setScoreForm({ score1: 0, score2: 0 });
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
        alert(error.error || "Failed to update score");
      }
    } catch (err) {
      console.error("Failed to update score:", err);
      alert("Failed to update score");
    }
  };

  const completedMatches = matches.filter((m) => m.completed).length;
  const totalMatches = matches.length;

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
          {isAdmin && (matches.length === 0 ? (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button disabled={creating}>
                  {/* i18n: Generate bracket button with creating state */}
                  {creating ? tFinals('creating') : tFinals('generateBracket')}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  {/* i18n: Generate bracket confirmation dialog */}
                  <AlertDialogTitle>{tFinals('generateConfirmTitle')}</AlertDialogTitle>
                  <AlertDialogDescription>
                    {tFinals('generateConfirmDesc')}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{tCommon('cancel')}</AlertDialogCancel>
                  <AlertDialogAction onClick={handleCreateBracket}>
                    {tFinals('generate')}
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
            <h2 className="text-2xl font-bold">Champion</h2>
            <p className="text-3xl font-bold text-yellow-500 mt-2">
              {champion.nickname}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Progress indicator */}
      {matches.length > 0 && (
        <div className="flex items-center gap-4">
          <Badge variant="outline" className="text-sm">
            Progress: {completedMatches} / {totalMatches} matches
          </Badge>
          {completedMatches === totalMatches && totalMatches > 0 && (
            <Badge className="bg-green-500">Tournament Complete</Badge>
          )}
        </div>
      )}

      {/* Empty state with bracket format explanation */}
      {matches.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No Finals Bracket Yet</CardTitle>
            <CardDescription>
              Generate a bracket to start the finals tournament.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              The finals bracket will be generated using the top 8 players from
              the qualification standings. The bracket uses a double elimination
              format:
            </p>
            <ul className="list-disc list-inside mt-4 space-y-2 text-sm text-muted-foreground">
              <li>
                <strong>Winners Bracket:</strong> Players who haven&apos;t lost
                yet
              </li>
              <li>
                <strong>Losers Bracket:</strong> Players with one loss get a
                second chance
              </li>
              <li>
                <strong>Grand Final:</strong> Winners champion vs Losers
                champion
              </li>
              <li>
                <strong>Reset Match:</strong> If the Losers champion wins the
                Grand Final, a reset match determines the true champion
              </li>
            </ul>
          </CardContent>
        </Card>
      ) : (
        /* Interactive bracket display */
        <DoubleEliminationBracket
          matches={matches}
          bracketStructure={bracketStructure}
          roundNames={roundNames}
          seededPlayers={seededPlayers}
          onMatchClick={isAdmin ? openScoreDialog : undefined}
        />
      )}

      {/* Score entry dialog: admin-only */}
      {isAdmin && <Dialog open={isScoreDialogOpen} onOpenChange={setIsScoreDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enter Match Score</DialogTitle>
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
            {/* Score input: best of 5 (first to 3 wins) */}
            <div className="flex items-center justify-center gap-4">
              <div className="text-center">
                <Label>{selectedMatch?.player1.nickname}</Label>
                <Input
                  type="number"
                  min={0}
                  max={4}
                  value={scoreForm.score1}
                  onChange={(e) =>
                    setScoreForm({
                      ...scoreForm,
                      score1: parseInt(e.target.value) || 0,
                    })
                  }
                  className="w-20 text-center text-2xl"
                />
              </div>
              <span className="text-2xl">-</span>
              <div className="text-center">
                <Label>{selectedMatch?.player2.nickname}</Label>
                <Input
                  type="number"
                  min={0}
                  max={4}
                  value={scoreForm.score2}
                  onChange={(e) =>
                    setScoreForm({
                      ...scoreForm,
                      score2: parseInt(e.target.value) || 0,
                    })
                  }
                  className="w-20 text-center text-2xl"
                />
              </div>
            </div>
            {/* Warning when neither player has reached 3 wins yet */}
            {scoreForm.score1 + scoreForm.score2 > 0 &&
              scoreForm.score1 < 3 &&
              scoreForm.score2 < 3 && (
                <p className="text-sm text-yellow-600 text-center">
                  Match needs a winner (first to 3)
                </p>
              )}
          </div>
          <DialogFooter>
            <Button
              onClick={handleScoreSubmit}
              disabled={scoreForm.score1 < 3 && scoreForm.score2 < 3}
            >
              Save Score
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>}
    </div>
  );
}
