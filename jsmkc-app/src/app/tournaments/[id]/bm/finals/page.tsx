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
 * - Real-time polling (3s) for bracket updates
 * - Confirmation dialogs for destructive actions (generate/reset)
 * - Score entry dialog with round-based validation
 * - Champion announcement when tournament completes
 * - Loading overlay during bracket generation
 * - Client-side logging for error tracking
 */

"use client";

import { useState, useEffect, useCallback, use } from "react";
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
import { LoadingOverlay } from "@/components/ui/loading-overlay";
import { CardSkeleton } from "@/components/ui/loading-skeleton";
import { createLogger } from "@/lib/client-logger";

/**
 * Client-side logger for the finals page.
 * Used for tracking bracket generation and score update errors.
 * Note: Client logger is created at module level (unlike server API loggers).
 */
const logger = createLogger({ serviceName: 'tournaments-bm-finals' });

/** Player data structure */
interface Player {
  id: string;
  name: string;
  nickname: string;
}

/** BM Match data with player relations */
interface BMMatch {
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

  /* Bracket data state */
  const [matches, setMatches] = useState<BMMatch[]>([]);
  const [bracketStructure, setBracketStructure] = useState<BracketMatch[]>([]);
  const [seededPlayers, setSeededPlayers] = useState<SeededPlayer[]>([]);
  const [roundNames, setRoundNames] = useState<Record<string, string>>({});

  /* UI state */
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  /* Score entry dialog state */
  const [isScoreDialogOpen, setIsScoreDialogOpen] = useState(false);
  const [selectedMatch, setSelectedMatch] = useState<BMMatch | null>(null);
  const [scoreForm, setScoreForm] = useState({ score1: 0, score2: 0 });

  /* Tournament completion state */
  const [champion, setChampion] = useState<Player | null>(null);

  /**
   * Fetch finals data including matches, bracket structure, and round names.
   * This is the polling function called every 3 seconds.
   */
  const fetchFinalsData = useCallback(async () => {
    const response = await fetch(`/api/tournaments/${tournamentId}/bm/finals`);

    if (!response.ok) {
      throw new Error(`Failed to fetch BM finals data: ${response.status}`);
    }

    const data = await response.json();

    return {
      matches: data.matches || [],
      bracketStructure: data.bracketStructure || [],
      roundNames: data.roundNames || {},
    };
  }, [tournamentId]);

  /* Set up polling with 3-second interval */
  const { data: pollData, isLoading: pollLoading, error, lastETag, refetch } = usePolling(fetchFinalsData, {
    interval: 3000,
  });

  /* Update bracket state when polling data changes */
  useEffect(() => {
    if (pollData) {
      setMatches(pollData.matches);
      setBracketStructure(pollData.bracketStructure);
      setRoundNames(pollData.roundNames);
    }
  }, [pollData]);

  /* Sync loading state with polling status */
  useEffect(() => {
    setLoading(pollLoading);
  }, [pollLoading]);

  /**
   * Generate or regenerate the finals bracket.
   * Creates an 8-player double-elimination bracket from qualification standings.
   * Uses a loading overlay since bracket generation can take a moment.
   */
  const handleCreateBracket = async () => {
    setCreating(true);
    try {
      const response = await fetch(`/api/tournaments/${tournamentId}/bm/finals`, {
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
      /* Log the error with structured metadata for debugging */
      const metadata = err instanceof Error ? { message: err.message, stack: err.stack } : { error: err };
      logger.error("Failed to create bracket:", metadata as any);
      alert("Failed to create bracket");
    } finally {
      setCreating(false);
    }
  };

  /** Open the score entry dialog pre-populated with existing scores */
  const openScoreDialog = (match: BMMatch) => {
    setSelectedMatch(match);
    setScoreForm({ score1: match.score1, score2: match.score2 });
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
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setIsScoreDialogOpen(false);
        setSelectedMatch(null);
        setScoreForm({ score1: 0, score2: 0 });
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
        alert(error.error || "Failed to update score");
      }
    } catch (err) {
      const metadata = err instanceof Error ? { message: err.message, stack: err.stack } : { error: err };
      logger.error("Failed to update score:", metadata as any);
      alert("Failed to update score");
    }
  };

  /* Calculate progress counters for the progress badge */
  const completedMatches = matches.filter((m) => m.completed).length;
  const totalMatches = matches.length;

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
      <LoadingOverlay isOpen={creating} message="Generating bracket... Please wait." />
      <div className="space-y-6">
      {/* Page header with title, update indicator, and action buttons */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4">
        <div>
          <h1 className="text-3xl font-bold">Battle Mode Finals</h1>
          <p className="text-muted-foreground">
            Double Elimination Tournament
          </p>
          <div className="mt-2">
            <UpdateIndicator lastUpdated={new Date(lastETag || 0)} isPolling={!error && pollLoading} />
          </div>
        </div>
        <div className="flex gap-2">
          {/* Generate or Reset bracket buttons with confirmation dialogs */}
          {matches.length === 0 ? (
            <AlertDialog>
               <AlertDialogTrigger asChild>
                 <Button disabled={creating} aria-label="Generate finals bracket">
                   {creating ? "Creating..." : "Generate Bracket"}
                 </Button>
               </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Generate Finals Bracket?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will create a double elimination bracket using top
                    8 players from qualification round. Make sure all
                    qualification matches are completed.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleCreateBracket}>
                    Generate
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          ) : (
            <AlertDialog>
               <AlertDialogTrigger asChild>
                 <Button variant="outline" disabled={creating} aria-label="Reset finals bracket">
                   Reset Bracket
                 </Button>
               </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Reset Finals Bracket?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will delete all existing finals matches and create a
                    new bracket. This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleCreateBracket}>
                    Reset
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
          {/* Back navigation to qualification page */}
          <Button variant="outline" asChild>
            <Link href={`/tournaments/${tournamentId}/bm`}>
              Back to Qualification
            </Link>
          </Button>
        </div>
      </div>

      {/* Champion announcement card - shown when tournament is complete */}
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

      {/* Progress badges showing match completion status */}
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

      {/* Main content: empty state with instructions or bracket visualization */}
      {matches.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No Finals Bracket Yet</CardTitle>
            <CardDescription>
              Generate a bracket to start finals tournament.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              The finals bracket will be generated using the top 8 players from
              qualification standings. The bracket uses a double elimination
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
                <strong>Reset Match:</strong> If Losers champion wins
                Grand Final, a reset match determines the true champion
              </li>
            </ul>
          </CardContent>
        </Card>
      ) : (
        /* Render the full double-elimination bracket visualization */
        <DoubleEliminationBracket
          matches={matches}
          bracketStructure={bracketStructure}
          roundNames={roundNames}
          seededPlayers={seededPlayers}
          onMatchClick={openScoreDialog}
        />
      )}

      {/* Score Entry Dialog for individual finals matches */}
      <Dialog open={isScoreDialogOpen} onOpenChange={setIsScoreDialogOpen}>
        <DialogContent
          onOpenAutoFocus={(e) => {
            /* Auto-focus the first score input for keyboard usability */
            e.preventDefault();
            const firstInput = document.getElementById(`score1-${selectedMatch?.id}`);
            firstInput?.focus();
          }}
        >
          <DialogHeader>
            <DialogTitle>Enter Match Score</DialogTitle>
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
                   max={4}
                   value={scoreForm.score1}
                   onChange={(e) =>
                     setScoreForm({
                       ...scoreForm,
                       score1: parseInt(e.target.value) || 0,
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
                   max={4}
                   value={scoreForm.score2}
                   onChange={(e) =>
                     setScoreForm({
                       ...scoreForm,
                       score2: parseInt(e.target.value) || 0,
                     })
                   }
                   className="w-20 text-center text-2xl"
                   aria-label={`${selectedMatch?.player2.nickname} score`}
                 />
              </div>
            </div>
            {/* Validation warning: finals matches need a winner (first to 3) */}
            {scoreForm.score1 + scoreForm.score2 > 0 &&
              scoreForm.score1 < 3 &&
              scoreForm.score2 < 3 && (
                <p className="text-sm text-yellow-600 text-center">
                  Match needs a winner (first to 3)
                </p>
              )}
          </div>
          <DialogFooter>
            {/* Submit button disabled until a valid winner score is entered */}
            <Button
              onClick={handleScoreSubmit}
              disabled={scoreForm.score1 < 3 && scoreForm.score2 < 3}
            >
              Save Score
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    </>
  );
}
