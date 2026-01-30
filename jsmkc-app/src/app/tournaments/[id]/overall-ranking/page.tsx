"use client";

/**
 * Overall Ranking Page
 *
 * Displays aggregated tournament rankings across all 4 competition modes
 * (TA, BM, MR, GP). Shows qualification and finals points for each mode,
 * along with the grand total and overall rank.
 *
 * Points system:
 * - Qualification: max 1000 points per mode
 *   - TA: Linear interpolation by course rank (50 pts/course max)
 *   - BM/MR/GP: Normalized match points (2×W + 1×T)
 * - Finals: max 2000 points per mode (based on bracket position)
 *   - 1st: 2000 | 2nd: 1600 | 3rd: 1300 | 4th: 1000
 *   - 5th-6th: 750 | 7th-8th: 550 | 9th-12th: 400
 * - Grand total: max 12000 points (4 modes × 3000)
 *
 * Features:
 * - Top 3 podium cards with rank badges
 * - Full rankings table with mode-by-mode breakdown
 * - On-demand recalculation button
 * - Points system legend
 * - Auto-refresh polling (5s interval)
 */

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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { usePolling } from "@/lib/hooks/usePolling";
import { CardSkeleton } from "@/components/ui/loading-skeleton";

/** Player ranking data returned from the overall ranking API */
interface PlayerRanking {
  playerId: string;
  playerName: string;
  playerNickname: string;
  /* Qualification points (max 1000 each) */
  taQualificationPoints: number;
  bmQualificationPoints: number;
  mrQualificationPoints: number;
  gpQualificationPoints: number;
  /* Finals points (max 2000 each) */
  taFinalsPoints: number;
  bmFinalsPoints: number;
  mrFinalsPoints: number;
  gpFinalsPoints: number;
  /* Total tournament points (max 12000) */
  totalPoints: number;
  overallRank: number;
}

/** API response structure for the overall ranking endpoint */
interface OverallRankingData {
  tournamentId: string;
  tournamentName: string;
  lastUpdated: string;
  rankings: PlayerRanking[];
}

export default function OverallRankingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: tournamentId } = use(params);
  const [rankings, setRankings] = useState<PlayerRanking[]>([]);
  const [tournamentName, setTournamentName] = useState<string>("");
  const [lastUpdated, setLastUpdated] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recalculating, setRecalculating] = useState(false);

  /** Fetch ranking data from the overall ranking API */
  const fetchRankings = useCallback(async () => {
    const response = await fetch(`/api/tournaments/${tournamentId}/overall-ranking`);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Failed to fetch rankings: ${response.status}`);
    }

    const data = await response.json();
    if (data.success && data.data) {
      return data.data as OverallRankingData;
    }
    throw new Error(data.error || "Invalid response format");
  }, [tournamentId]);

  /* Auto-refresh rankings every 5 seconds */
  const { data: pollData, isLoading: pollLoading, error: pollError, refetch } = usePolling(
    fetchRankings,
    { interval: 5000 }
  );

  /* Update local state when polling data arrives */
  useEffect(() => {
    if (pollData) {
      setRankings(pollData.rankings);
      setTournamentName(pollData.tournamentName);
      setLastUpdated(pollData.lastUpdated);
    }
  }, [pollData]);

  useEffect(() => {
    setLoading(pollLoading);
  }, [pollLoading]);

  useEffect(() => {
    if (pollError) {
      setError(typeof pollError === 'string' ? pollError : (pollError as Error)?.message || 'Unknown error');
    }
  }, [pollError]);

  /**
   * Trigger a full recalculation of overall rankings.
   * This re-aggregates all mode data and updates the stored rankings.
   */
  const handleRecalculate = async () => {
    setRecalculating(true);
    setError(null);

    try {
      const response = await fetch(`/api/tournaments/${tournamentId}/overall-ranking`, {
        method: "POST",
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to recalculate rankings");
      }

      const data = await response.json();
      if (data.success && data.data) {
        setRankings(data.data.rankings);
        setLastUpdated(data.data.lastUpdated);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to recalculate";
      console.error("Failed to recalculate rankings:", err);
      setError(errorMessage);
    } finally {
      setRecalculating(false);
    }
  };

  /**
   * Format a rank number with ordinal suffix (1st, 2nd, 3rd, 4th, etc.)
   * Handles special cases for 11th, 12th, 13th which use "th" not "st/nd/rd"
   */
  const formatRank = (rank: number): string => {
    const suffixes = ["th", "st", "nd", "rd"];
    const v = rank % 100;
    return rank + (suffixes[(v - 20) % 10] || suffixes[v] || suffixes[0]);
  };

  /** Get badge styling variant based on rank position */
  const getRankBadgeVariant = (rank: number): "default" | "secondary" | "outline" => {
    if (rank === 1) return "default";
    if (rank <= 3) return "secondary";
    return "outline";
  };

  /** Calculate total points for a mode (qualification + finals) */
  const getModeTotal = (ranking: PlayerRanking, mode: "ta" | "bm" | "mr" | "gp"): number => {
    const qual = ranking[`${mode}QualificationPoints` as keyof PlayerRanking] as number;
    const finals = ranking[`${mode}FinalsPoints` as keyof PlayerRanking] as number;
    return qual + finals;
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div className="space-y-3">
            <div className="h-9 w-48 bg-muted animate-pulse rounded" />
            <div className="h-5 w-64 bg-muted animate-pulse rounded" />
          </div>
        </div>
        <CardSkeleton />
      </div>
    );
  }

  /* Error state with retry and calculate options */
  if (error && rankings.length === 0) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold">Overall Ranking</h1>
          <Button variant="outline" asChild>
            <Link href={`/tournaments/${tournamentId}`}>Back</Link>
          </Button>
        </div>
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-destructive mb-4">{error}</p>
            <div className="space-x-2">
              <Button onClick={refetch}>Retry</Button>
              <Button variant="outline" onClick={handleRecalculate}>
                Calculate Rankings
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page header with recalculate and back buttons */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4">
        <div>
          <h1 className="text-3xl font-bold">Overall Ranking</h1>
          <p className="text-muted-foreground">
            {tournamentName} - Total points across all 4 modes
          </p>
          {lastUpdated && (
            <p className="text-sm text-muted-foreground">
              Last updated: {new Date(lastUpdated).toLocaleString()}
            </p>
          )}
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button
            onClick={handleRecalculate}
            disabled={recalculating}
          >
            {recalculating ? "Recalculating..." : "Recalculate"}
          </Button>
          <Button variant="outline" asChild>
            <Link href={`/tournaments/${tournamentId}`}>Back</Link>
          </Button>
        </div>
      </div>

      {/* Inline error message (when rankings exist but refresh fails) */}
      {error && (
        <Card className="border-destructive">
          <CardContent className="py-4">
            <p className="text-destructive text-sm">{error}</p>
          </CardContent>
        </Card>
      )}

      {rankings.length === 0 ? (
        /* Empty state with calculate button */
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            <p className="mb-4">No rankings available yet.</p>
            <Button onClick={handleRecalculate} disabled={recalculating}>
              {recalculating ? "Calculating..." : "Calculate Rankings"}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Top 3 podium summary cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {rankings.slice(0, 3).map((ranking) => (
              <Card key={ranking.playerId}>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2">
                    <Badge variant={getRankBadgeVariant(ranking.overallRank)}>
                      {formatRank(ranking.overallRank)}
                    </Badge>
                    {ranking.playerNickname}
                  </CardTitle>
                  <CardDescription>{ranking.playerName}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-primary">
                    {ranking.totalPoints.toLocaleString()}
                  </div>
                  <p className="text-sm text-muted-foreground">Total Points</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Full rankings table with mode-by-mode breakdown */}
          <Card>
            <CardHeader>
              <CardTitle>Complete Rankings</CardTitle>
              <CardDescription>
                {rankings.length} players ranked by total tournament points
              </CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-16">Rank</TableHead>
                    <TableHead>Player</TableHead>
                    <TableHead className="text-right">TA</TableHead>
                    <TableHead className="text-right">BM</TableHead>
                    <TableHead className="text-right">MR</TableHead>
                    <TableHead className="text-right">GP</TableHead>
                    <TableHead className="text-right font-bold">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rankings.map((ranking) => (
                    <TableRow key={ranking.playerId}>
                      <TableCell>
                        <Badge variant={getRankBadgeVariant(ranking.overallRank)}>
                          {formatRank(ranking.overallRank)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div>
                          <div className="font-medium">{ranking.playerNickname}</div>
                          <div className="text-sm text-muted-foreground">{ranking.playerName}</div>
                        </div>
                      </TableCell>
                      {/* Each mode column shows total with Q/F breakdown */}
                      <TableCell className="text-right">
                        <div className="font-mono">{getModeTotal(ranking, "ta")}</div>
                        <div className="text-xs text-muted-foreground">
                          Q:{ranking.taQualificationPoints} F:{ranking.taFinalsPoints}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="font-mono">{getModeTotal(ranking, "bm")}</div>
                        <div className="text-xs text-muted-foreground">
                          Q:{ranking.bmQualificationPoints} F:{ranking.bmFinalsPoints}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="font-mono">{getModeTotal(ranking, "mr")}</div>
                        <div className="text-xs text-muted-foreground">
                          Q:{ranking.mrQualificationPoints} F:{ranking.mrFinalsPoints}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="font-mono">{getModeTotal(ranking, "gp")}</div>
                        <div className="text-xs text-muted-foreground">
                          Q:{ranking.gpQualificationPoints} F:{ranking.gpFinalsPoints}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="font-bold text-lg font-mono">
                          {ranking.totalPoints.toLocaleString()}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Points system legend explaining qualification and finals scoring */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Points System</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div>
                  <h4 className="font-medium mb-2">Qualification Points (max 1000 per mode)</h4>
                  <ul className="text-muted-foreground space-y-1">
                    <li>TA: Linear interpolation by course rank (50 pts/course max)</li>
                    <li>BM/MR/GP: Normalized match points (2×W + 1×T)</li>
                  </ul>
                </div>
                <div>
                  <h4 className="font-medium mb-2">Finals Points (max 2000 per mode)</h4>
                  <ul className="text-muted-foreground space-y-1">
                    <li>1st: 2000 | 2nd: 1600 | 3rd: 1300 | 4th: 1000</li>
                    <li>5th-6th: 750 | 7th-8th: 550 | 9th-12th: 400</li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
