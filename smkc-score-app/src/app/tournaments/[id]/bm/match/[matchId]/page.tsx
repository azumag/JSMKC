/**
 * Battle Mode Match Detail Page (View Only)
 *
 * Public-facing page for viewing individual BM match status and results.
 * Score entry has been consolidated into the participant page
 * (/tournaments/[id]/bm/participant) for a unified entry point.
 *
 * Features:
 * - Match info display (players, current score)
 * - Real-time polling (3s) to detect when match completes
 * - Completed state with final score and winner
 */

"use client";
import { fetchWithRetry } from "@/lib/fetch-with-retry";

import { useState, useEffect, useCallback, use } from "react";
import { useTranslations } from "next-intl";
import { useSession } from "next-auth/react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { POLLING_INTERVAL } from "@/lib/constants";
import { usePolling } from "@/lib/hooks/usePolling";
import { UpdateIndicator } from "@/components/ui/update-indicator";
import { CardSkeleton } from "@/components/ui/loading-skeleton";

import type { Player } from "@/lib/types";

/** BM Match data with player relations */
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
  /** Pre-assigned courses for this match (§5.4, §6.3). Set at qualification setup. */
  assignedCourses?: string[];
  player1: Player;
  player2: Player;
}

/** Tournament metadata for display */
interface Tournament {
  id: string;
  name: string;
}

/**
 * Match detail page component for individual BM matches (view only).
 * Uses React 19's `use()` hook to unwrap async params (tournamentId + matchId).
 */
export default function MatchDetailPage({
  params,
}: {
  params: Promise<{ id: string; matchId: string }>;
}) {
  const { id: tournamentId, matchId } = use(params);

  const tMatch = useTranslations('match');
  const tBm = useTranslations('bm');

  /* Core state */
  const [match, setMatch] = useState<BMMatch | null>(null);
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [loading, setLoading] = useState(true);
  const { data: session, status: sessionStatus } = useSession();

  /**
   * Fetch match and tournament data in parallel.
   * This function is used by the polling hook for real-time updates.
   */
  const fetchMatchData = useCallback(async () => {
    const [matchRes, tournamentRes] = await Promise.all([
      fetch(`/api/tournaments/${tournamentId}/bm/match/${matchId}`),
      fetchWithRetry(`/api/tournaments/${tournamentId}?fields=summary`),
    ]);

    if (!matchRes.ok) {
      throw new Error(`Failed to fetch BM match data: ${matchRes.status}`);
    }

    if (!tournamentRes.ok) {
      throw new Error(`Failed to fetch tournament: ${tournamentRes.status}`);
    }

    const matchJson = await matchRes.json();
    const tournamentJson = await tournamentRes.json();

    return {
      // Unwrap createSuccessResponse wrapper: { success, data: match }
      match: matchJson.data ?? matchJson,
      tournament: tournamentJson.data ?? tournamentJson,
    };
  }, [tournamentId, matchId]);

  /* Poll at the standard interval for real-time match updates */
  const { data: pollData, isLoading: pollLoading, lastUpdated, isPolling } = usePolling(
    fetchMatchData, {
    interval: POLLING_INTERVAL,
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
        <p>{tMatch('matchNotFound')}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-md mx-auto space-y-4">
        {/* Header with tournament name and match info */}
        <div className="text-center">
          <h1 className="text-xl font-bold">{tournament.name}</h1>
          <p className="text-muted-foreground">{tBm('matchTitle', { number: match.matchNumber })}</p>
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
            {/* Show score badge if match is completed */}
            {match.completed && (
              <CardDescription className="text-center">
                <Badge variant="secondary" className="text-lg px-4 py-1">
                  {match.score1} - {match.score2}
                </Badge>
              </CardDescription>
            )}
          </CardHeader>
          {/* §5.4: BM always uses battle courses 1-4 in order */}
          {!match.completed && (
            <CardContent className="pt-0 pb-3">
              <p className="text-xs text-muted-foreground">
                {tBm('battleCourseOrder')}
              </p>
            </CardContent>
          )}
        </Card>

        {/* Completed State - final score display */}
        {match.completed && (
          <Card>
            <CardContent className="py-8 text-center">
              <div className="text-4xl mb-4">🏁</div>
              <h3 className="text-lg font-semibold mb-2">{tMatch('matchComplete')}</h3>
              <p className="text-muted-foreground">
                {tMatch('finalScore', { score1: match.score1, score2: match.score2 })}
              </p>
              <p className="mt-2">
                {match.score1 >= 3
                  ? tMatch('playerWins', { player: match.player1.nickname })
                  : match.score2 >= 3
                  ? tMatch('playerWins', { player: match.player2.nickname })
                  : tMatch('draw')}
              </p>
            </CardContent>
          </Card>
        )}

        {/* In-progress state */}
        {!match.completed && (
          <Card>
            <CardContent className="py-6 text-center space-y-4">
              <p className="text-muted-foreground">{tMatch('matchInProgress')}</p>
              {/* Show CTA only when session is loaded to avoid loading flash */}
               {sessionStatus !== 'loading' && (
                 !session ? (
                   <p className="text-sm text-muted-foreground">
                     {tMatch('signInToReportScores')}
                   </p>
                 ) : session.user?.playerId ? (
                   <div className="space-y-2">
                     <p className="text-sm text-muted-foreground">
                       {tMatch('scoreEntryGuidance')}
                     </p>
                     <Button asChild>
                       <a href={`/tournaments/${tournamentId}/bm/participant`}>
                         {tMatch('goToScoreEntry')}
                       </a>
                     </Button>
                   </div>
                 ) : session.user?.role === 'admin' ? (
                   <div className="space-y-2">
                     <p className="text-sm text-muted-foreground">
                       {tMatch('adminSharedPageGuidance')}
                     </p>
                     <Button asChild>
                       <a href={`/tournaments/${tournamentId}/bm`}>
                         {tMatch('openParticipantScoreEntry')}
                       </a>
                     </Button>
                   </div>
                 ) : null
               )}
            </CardContent>
          </Card>
        )}

        {/* Back navigation link */}
        <div className="text-center">
          <a
            href={`/tournaments/${tournamentId}/bm`}
            className="text-sm text-muted-foreground hover:underline"
          >
            {tMatch('backToBM')}
          </a>
        </div>
      </div>
    </div>
  );
}
