/**
 * Battle Mode Match Entry Page
 *
 * Public-facing page for individual BM match score entry.
 * This page is accessed via a shareable link (no authentication required)
 * and provides a mobile-friendly interface for players to report scores.
 *
 * Features:
 * - Player self-identification (select "I am Player 1" or "I am Player 2")
 * - Increment/decrement score buttons for easy mobile input
 * - Validation: total rounds must equal 4 (BM qualification format)
 * - Score submission via the /report API endpoint
 * - Real-time polling (3s) to detect when the other player submits or match completes
 * - Three UI states: score entry, submitted (waiting), and completed
 *
 * The page acts as a shared link - either player can use the same URL
 * but must identify which player they are before entering scores.
 */

"use client";

import { useState, useEffect, useCallback, use } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { usePolling } from "@/lib/hooks/usePolling";
import { UpdateIndicator } from "@/components/ui/update-indicator";
import { CardSkeleton } from "@/components/ui/loading-skeleton";

/** Player data structure */
interface Player {
  id: string;
  name: string;
  nickname: string;
}

/** BM Match data with player relations and reported scores */
interface BMMatch {
  id: string;
  matchNumber: number;
  player1Id: string;
  player2Id: string;
  player1Side: number;
  player2Side: number;
  score1: number;
  score2: number;
  completed: boolean;
  player1: Player;
  player2: Player;
  /** Player 1's self-reported scores */
  player1ReportedScore1?: number;
  player1ReportedScore2?: number;
  /** Player 2's self-reported scores */
  player2ReportedScore1?: number;
  player2ReportedScore2?: number;
}

/** Tournament metadata for display */
interface Tournament {
  id: string;
  name: string;
}

/**
 * Match entry page component for individual BM matches.
 * Uses React 19's `use()` hook to unwrap async params (tournamentId + matchId).
 */
export default function MatchEntryPage({
  params,
}: {
  params: Promise<{ id: string; matchId: string }>;
}) {
  const { id: tournamentId, matchId } = use(params);

  /* Core state */
  const [match, setMatch] = useState<BMMatch | null>(null);
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [loading, setLoading] = useState(true);

  /* Score entry state */
  const [submitting, setSubmitting] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState<1 | 2 | null>(null);
  const [score1, setScore1] = useState(0);
  const [score2, setScore2] = useState(0);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  /**
   * Fetch match and tournament data in parallel.
   * This function is used by the polling hook for real-time updates.
   */
  const fetchMatchData = useCallback(async () => {
    const [matchRes, tournamentRes] = await Promise.all([
      fetch(`/api/tournaments/${tournamentId}/bm/match/${matchId}`),
      fetch(`/api/tournaments/${tournamentId}`),
    ]);

    if (!matchRes.ok) {
      throw new Error(`Failed to fetch BM match data: ${matchRes.status}`);
    }

    if (!tournamentRes.ok) {
      throw new Error(`Failed to fetch tournament: ${tournamentRes.status}`);
    }

    const matchData = await matchRes.json();
    const tournamentData = await tournamentRes.json();

    return {
      match: matchData,
      tournament: tournamentData,
    };
  }, [tournamentId, matchId]);

  /* Poll every 3 seconds for real-time match updates */
  const { data: pollData, isLoading: pollLoading, lastUpdated, isPolling, refetch } = usePolling(
    fetchMatchData, {
    interval: 3000,
  });

  /* Update local state when polling returns new data */
  useEffect(() => {
    if (pollData) {
      setMatch(pollData.match);
      setTournament(pollData.tournament);
    }
  }, [pollData]);

  /* Sync loading state with polling status */
  useEffect(() => {
    setLoading(pollLoading);
  }, [pollLoading]);

  /**
   * Handle score submission.
   * Validates that a player is selected and total rounds equal 4,
   * then sends the score report to the API.
   */
  const handleSubmit = async () => {
    if (selectedPlayer === null) {
      setError("Please select which player you are");
      return;
    }
    /* BM qualification matches must total exactly 4 rounds */
    if (score1 + score2 !== 4) {
      setError("Total rounds must equal 4");
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      const response = await fetch(
        `/api/tournaments/${tournamentId}/bm/match/${matchId}/report`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            reportingPlayer: selectedPlayer,
            score1,
            score2,
          }),
        }
      );

      if (response.ok) {
        setSubmitted(true);
        refetch(); // Refresh data to show updated state
      } else {
        const data = await response.json();
        setError(data.error || "Failed to submit score");
      }
    } catch (err) {
      console.error("Failed to submit:", err);
      setError("Failed to submit score");
    } finally {
      setSubmitting(false);
    }
  };

  /* Loading skeleton for initial page load */
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="space-y-6 w-full max-w-2xl px-4">
          <div className="space-y-3">
            <div className="h-9 w-32 bg-muted animate-pulse rounded" />
            <div className="h-5 w-48 bg-muted animate-pulse rounded" />
          </div>
          <CardSkeleton />
        </div>
      </div>
    );
  }

  /* Error state when match or tournament data is not found */
  if (!match || !tournament) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>Match not found</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-md mx-auto space-y-4">
        {/* Header with tournament name and match info */}
        <div className="text-center">
          <h1 className="text-xl font-bold">{tournament.name}</h1>
          <p className="text-muted-foreground">Battle Mode - Match #{match.matchNumber}</p>
          <div className="mt-2">
            <UpdateIndicator lastUpdated={lastUpdated} isPolling={isPolling} />
          </div>
        </div>

        {/* Match Info Card showing players and current score */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex justify-between items-center">
              <span>{match.player1.nickname}</span>
              <span className="text-2xl font-mono">vs</span>
              <span>{match.player2.nickname}</span>
            </CardTitle>
            {/* Show final score badge if match is completed */}
            {match.completed && (
              <CardDescription className="text-center">
                <Badge variant="secondary" className="text-lg px-4 py-1">
                  {match.score1} - {match.score2}
                </Badge>
              </CardDescription>
            )}
          </CardHeader>
        </Card>

        {/* Score Entry UI - shown when match is not completed and score not yet submitted */}
        {!match.completed && !submitted && (
          <Card>
            <CardHeader>
              <CardTitle>Enter Score</CardTitle>
              <CardDescription>
                Select who you are and enter the match result
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Player Self-Identification */}
              <div className="space-y-2">
                <p className="text-sm font-medium">I am:</p>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant={selectedPlayer === 1 ? "default" : "outline"}
                    className="h-16 text-lg"
                    onClick={() => setSelectedPlayer(1)}
                  >
                    {match.player1.nickname}
                  </Button>
                  <Button
                    variant={selectedPlayer === 2 ? "default" : "outline"}
                    className="h-16 text-lg"
                    onClick={() => setSelectedPlayer(2)}
                  >
                    {match.player2.nickname}
                  </Button>
                </div>
              </div>

              {/* Score Input - shown after player selection */}
              {selectedPlayer && (
                <div className="space-y-4">
                  <p className="text-sm font-medium text-center">
                    Score (rounds won)
                  </p>
                  <div className="flex items-center justify-center gap-4">
                    {/* Player 1 score with increment/decrement buttons */}
                    <div className="text-center">
                      <p className="text-sm mb-2">{match.player1.nickname}</p>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="lg"
                          className="h-12 w-12 text-xl"
                          onClick={() => setScore1(Math.max(0, score1 - 1))}
                        >
                          -
                        </Button>
                        <span className="text-4xl font-bold w-12 text-center">
                          {score1}
                        </span>
                        <Button
                          variant="outline"
                          size="lg"
                          className="h-12 w-12 text-xl"
                          onClick={() => setScore1(Math.min(4, score1 + 1))}
                        >
                          +
                        </Button>
                      </div>
                    </div>
                    <span className="text-2xl">-</span>
                    {/* Player 2 score with increment/decrement buttons */}
                    <div className="text-center">
                      <p className="text-sm mb-2">{match.player2.nickname}</p>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="lg"
                          className="h-12 w-12 text-xl"
                          onClick={() => setScore2(Math.max(0, score2 - 1))}
                        >
                          -
                        </Button>
                        <span className="text-4xl font-bold w-12 text-center">
                          {score2}
                        </span>
                        <Button
                          variant="outline"
                          size="lg"
                          className="h-12 w-12 text-xl"
                          onClick={() => setScore2(Math.min(4, score2 + 1))}
                        >
                          +
                        </Button>
                      </div>
                    </div>
                  </div>

                  {/* Validation warning: total rounds must equal 4 */}
                  {score1 + score2 !== 4 && (score1 > 0 || score2 > 0) && (
                    <p className="text-yellow-600 text-sm text-center">
                      Total must equal 4 rounds
                    </p>
                  )}

                  {/* Error message display */}
                  {error && (
                    <p className="text-red-500 text-sm text-center">{error}</p>
                  )}

                  {/* Submit button - disabled until valid score is entered */}
                  <Button
                    className="w-full h-14 text-lg"
                    onClick={handleSubmit}
                    disabled={submitting || score1 + score2 !== 4}
                  >
                    {submitting ? "Submitting..." : "Submit Score"}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Submitted State - waiting for other player's confirmation */}
        {submitted && !match.completed && (
          <Card>
            <CardContent className="py-8 text-center">
              <div className="text-4xl mb-4">✓</div>
              <h3 className="text-lg font-semibold mb-2">Score Submitted!</h3>
              <p className="text-muted-foreground">
                Waiting for the other player to confirm...
              </p>
              <p className="text-sm mt-4">
                Your report: {score1} - {score2}
              </p>
            </CardContent>
          </Card>
        )}

        {/* Completed State - final score display */}
        {match.completed && (
          <Card>
            <CardContent className="py-8 text-center">
              <div className="text-4xl mb-4">🏁</div>
              <h3 className="text-lg font-semibold mb-2">Match Complete</h3>
              <p className="text-muted-foreground">
                Final Score: {match.score1} - {match.score2}
              </p>
              <p className="mt-2">
                {match.score1 >= 3
                  ? `${match.player1.nickname} wins!`
                  : match.score2 >= 3
                  ? `${match.player2.nickname} wins!`
                  : "Draw"}
              </p>
            </CardContent>
          </Card>
        )}

        {/* Back navigation link */}
        <div className="text-center">
          <Link
            href={`/tournaments/${tournamentId}/bm`}
            className="text-sm text-muted-foreground hover:underline"
          >
            ← Back to Battle Mode
          </Link>
        </div>
      </div>
    </div>
  );
}
