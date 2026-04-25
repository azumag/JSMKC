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
 * - Auto-refresh polling (3s interval via POLLING_INTERVAL constant)
 */

import { useState, useEffect, useCallback, use } from "react";
import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
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
import { POLLING_INTERVAL } from "@/lib/constants";
import { createLogger } from "@/lib/client-logger";
import { fetchWithRetry } from '@/lib/fetch-with-retry';

/** Client-side logger for error tracking */
const logger = createLogger({ serviceName: 'tournaments-overall-ranking' });

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
  overallRank: number | null;
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
  /* i18n translation hooks for overall ranking and common namespaces */
  const tOverall = useTranslations('overall');
  const tCommon = useTranslations('common');
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "admin";
  const [error, setError] = useState<string | null>(null);
  const [recalculating, setRecalculating] = useState(false);

  /** Fetch ranking data from the overall ranking API */
  const fetchRankings = useCallback(async () => {
    const response = await fetchWithRetry(`/api/tournaments/${tournamentId}/overall-ranking`);

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

  /*
   * Auto-refresh rankings at the standard POLLING_INTERVAL (3s).
   * cacheKey enables instant content display when returning to this tab.
   */
  const { data: pollData, error: pollError, refetch } = usePolling(
    fetchRankings,
    { interval: POLLING_INTERVAL, cacheKey: `tournament/${tournamentId}/overall-ranking` }
  );

  /*
   * Derive display data directly from polling response.
   * Avoids redundant local state and provides instant display from cache.
   */
  const rankings: PlayerRanking[] = pollData?.rankings ?? [];
  const tournamentName: string = pollData?.tournamentName ?? "";
  const lastUpdated: string = pollData?.lastUpdated ?? "";

  /* Sync polling errors to local error state for display */
  useEffect(() => {
    if (pollError) {
      setError(typeof pollError === 'string' ? pollError : (pollError as Error)?.message || 'Unknown error');
    }
  }, [pollError]);

  /**
   * Trigger a full recalculation of overall rankings.
   * This re-aggregates all mode data and updates the stored rankings.
   * After recalculation, refetch polling data to display fresh results.
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

      /* Trigger immediate refetch to display the recalculated data */
      refetch();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to recalculate";
      logger.error("Failed to recalculate rankings:", { error: err, tournamentId });
      setError(errorMessage);
    } finally {
      setRecalculating(false);
    }
  };

  /**
   * Format a rank number with ordinal suffix (1st, 2nd, 3rd, 4th, etc.)
   * Handles special cases for 11th, 12th, 13th which use "th" not "st/nd/rd"
   */
  const formatRank = (rank: number | null): string => {
    if (rank === null) return "-";
    const suffixes = ["th", "st", "nd", "rd"];
    const v = rank % 100;
    return rank + (suffixes[(v - 20) % 10] || suffixes[v] || suffixes[0]);
  };

  /**
   * Rank badge variant — gold (mustard flag-draft) for the lead, red for
   * the rest of the podium (default), neutral outline for the rest.
   */
  const getRankBadgeVariant = (rank: number | null): "default" | "flag-draft" | "outline" => {
    if (rank === null) return "outline";
    if (rank === 1) return "flag-draft";
    if (rank <= 3) return "default";
    return "outline";
  };

  /**
   * Podium tile background — gold for 1st, charcoal for 2nd, copper-tone
   * carbon for 3rd. Mirrors the medal hierarchy without resorting to
   * literal medal icons, keeping the editorial flavor.
   */
  const podiumTone = (rank: number | null) => {
    if (rank === 1) return "bg-accent text-accent-foreground border-accent";
    if (rank === 2) return "bg-foreground text-background border-foreground";
    if (rank === 3) return "bg-secondary text-secondary-foreground border-foreground/30";
    return "bg-card text-card-foreground border-foreground/15";
  };

  /** Calculate total points for a mode (qualification + finals) */
  const getModeTotal = (ranking: PlayerRanking, mode: "ta" | "bm" | "mr" | "gp"): number => {
    const qual = ranking[`${mode}QualificationPoints` as keyof PlayerRanking] as number;
    const finals = ranking[`${mode}FinalsPoints` as keyof PlayerRanking] as number;
    return qual + finals;
  };

  /* Error state with retry and calculate options.
     Must be checked before skeleton to avoid permanent loading on first-load error. */
  if (error && !pollData) {
    return (
      <div className="space-y-6">
        <h1 className="font-display text-4xl tracking-wide">{tOverall('title')}</h1>
        <div className="border border-foreground/15 py-10 text-center space-y-4">
          <p className="text-destructive">{error}</p>
          <div className="space-x-2">
            <Button onClick={refetch}>{tCommon('retry')}</Button>
            {isAdmin && (
              <Button variant="outline" onClick={handleRecalculate}>
                {tOverall('calculateRankings')}
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }

  /* Loading skeleton shown only on first visit (no cached data, no error yet) */
  if (!pollData) {
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

  return (
    <div className="space-y-8">
      <header className="flex flex-col sm:flex-row sm:justify-between sm:items-end gap-4 border-b border-foreground/15 pb-4">
        <div>
          <h1 className="font-display text-3xl sm:text-4xl tracking-wide leading-none">
            {tOverall('title')}
          </h1>
          <p className="text-sm text-muted-foreground mt-2">
            {tOverall('subtitle')}
          </p>
          {lastUpdated && (
            <p className="text-xs text-muted-foreground font-mono tabular mt-1">
              {tOverall('lastUpdated', { date: new Date(lastUpdated).toLocaleString() })}
            </p>
          )}
        </div>
        <div className="flex gap-2 flex-wrap">
          {isAdmin && (
            <Button onClick={handleRecalculate} disabled={recalculating}>
              {recalculating ? tOverall('recalculating') : tOverall('recalculate')}
            </Button>
          )}
        </div>
      </header>

      {/* Inline error message (when rankings exist but refresh fails) */}
      {error && (
        <div className="border-l-[3px] border-destructive bg-destructive/5 py-3 px-4">
          <p className="text-destructive text-sm">{error}</p>
        </div>
      )}

      {rankings.length === 0 ? (
        /* Empty state with calculate button */
        <div className="border border-foreground/15 py-10 text-center text-muted-foreground space-y-4">
          <p>{tOverall('noRankings')}</p>
          {isAdmin && (
            <Button onClick={handleRecalculate} disabled={recalculating}>
              {recalculating ? tOverall('calculating') : tOverall('calculateRankings')}
            </Button>
          )}
        </div>
      ) : (
        <>
          {/*
           * Stepped podium: tiles use Anton + tabular figures, with
           * tone classes that read as gold/silver/bronze without medal
           * icons. The first place sits taller via lg:order/translate to
           * draw the eye to the lead.
           */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
            {rankings.slice(0, 3).map((ranking, idx) => {
              const rank = ranking.overallRank;
              const tone = podiumTone(rank);
              const heightClass =
                rank === 1
                  ? "min-h-[210px] md:order-2"
                  : rank === 2
                  ? "min-h-[180px] md:order-1"
                  : "min-h-[160px] md:order-3";
              return (
                <article
                  key={ranking.playerId ?? idx}
                  className={`relative border ${tone} ${heightClass} flex flex-col p-5`}
                >
                  <span className="font-display text-5xl leading-none tracking-wide">
                    {rank ? `#${String(rank).padStart(2, "0")}` : "—"}
                  </span>
                  <div className="mt-auto">
                    <p className="text-lg font-semibold leading-tight">
                      {ranking.playerNickname}
                    </p>
                    <p className="text-xs opacity-80 mt-0.5">
                      {ranking.playerName}
                    </p>
                    <p className="font-mono tabular text-2xl mt-2">
                      {ranking.totalPoints.toLocaleString()}
                    </p>
                    <p className="text-xs opacity-70 mt-0.5">
                      {tOverall('totalPoints')}
                    </p>
                  </div>
                </article>
              );
            })}
          </div>

          {/* Full rankings table with mode-by-mode breakdown */}
          <section className="space-y-3">
            <header className="flex items-baseline justify-between">
              <h2 className="text-base font-semibold">
                {tOverall('completeRankings')}
              </h2>
              <p className="text-xs text-muted-foreground font-mono tabular">
                {tOverall('rankedByTotal', { count: rankings.length })}
              </p>
            </header>
            <div className="overflow-x-auto border border-foreground/15">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-16">{tOverall('rank')}</TableHead>
                    <TableHead>{tOverall('player')}</TableHead>
                    <TableHead className="text-right">TA</TableHead>
                    <TableHead className="text-right">BM</TableHead>
                    <TableHead className="text-right">MR</TableHead>
                    <TableHead className="text-right">GP</TableHead>
                    <TableHead className="text-right font-bold">{tOverall('total')}</TableHead>
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
                        <div className="font-display text-xl tracking-wider tabular">
                          {ranking.totalPoints.toLocaleString()}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </section>

          {/* Points system legend explaining qualification and finals scoring */}
          <section className="border border-foreground/15 p-6">
            <h2 className="text-base font-semibold mb-4">
              {tOverall('pointsSystem')}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground mb-2">
                  {tOverall('qualificationPoints')}
                </h4>
                <ul className="text-muted-foreground space-y-1">
                  <li>{tOverall('taQualPoints')}</li>
                  <li>{tOverall('otherQualPoints')}</li>
                </ul>
              </div>
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground mb-2">
                  {tOverall('finalsPoints')}
                </h4>
                <ul className="text-muted-foreground space-y-1">
                  <li>{tOverall('finalsBreakdown1')}</li>
                  <li>{tOverall('finalsBreakdown2')}</li>
                </ul>
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
