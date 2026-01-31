/**
 * tournaments/[id]/page.tsx - Tournament Detail Page
 *
 * This page displays a single tournament's details and provides:
 * 1. Tournament name, date, and status badge
 * 2. Status transition controls (Draft -> Active -> Completed, admin only)
 * 3. Tournament token management for player score entry (admin only)
 * 4. CSV/data export functionality (admin only)
 * 5. Tabbed navigation to the 4 game modes + overall ranking
 *
 * Game mode tabs:
 * - Time Trial (TA): Individual 20-course time competition
 * - Battle Mode (BM): 1v1 balloon battle with qualification + finals
 * - Match Race (MR): 1v1 random course race with bracket structure
 * - Grand Prix (GP): Cup-based driver points competition
 * - Overall: Combined ranking across all 4 modes (max 12000 points)
 *
 * Role-based access:
 * - All users can view tournament details and navigate to game modes
 * - Admin users see status controls, token management, and export button
 * - Game mode links show "Manage" for admins, "View" for others
 *
 * This uses React 19's `use()` hook to unwrap the Promise-based params,
 * which is the standard pattern for Next.js 16 App Router dynamic routes.
 */
"use client";

import { useState, useEffect, useCallback, use } from "react";
import { useSession } from "next-auth/react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import TournamentTokenManager from "@/components/tournament/tournament-token-manager";
import { ExportButton } from "@/components/tournament/export-button";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { CardSkeleton } from "@/components/ui/loading-skeleton";
import { createLogger } from "@/lib/client-logger";

/**
 * Client-side logger for the tournament detail page.
 * Uses structured logging for consistent error tracking.
 */
const logger = createLogger({ serviceName: 'tournaments' });

/**
 * Tournament data model for the detail view.
 * Includes optional token fields for player score entry access.
 */
interface Tournament {
  id: string;
  name: string;
  date: string;
  status: string;
  /** Token string for player score entry (null if not generated yet) */
  token?: string | null;
  /** ISO date string for token expiration (null if no token) */
  tokenExpiresAt?: string | null;
}

/**
 * TournamentDetailPage - Shows full tournament details with game mode navigation.
 *
 * Uses React 19's `use()` to unwrap the params Promise, which is the
 * Next.js 16 App Router pattern for accessing dynamic route segments.
 *
 * @param params - Promise containing the dynamic route parameter `id`
 */
export default function TournamentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  /**
   * React 19 use() hook unwraps the Promise-based params.
   * This is required in Next.js 16 where route params are
   * always provided as Promises to support streaming and suspense.
   */
  const { id } = use(params);
  const { data: session } = useSession();

  /**
   * Admin role check: controls visibility of status transition buttons,
   * token management panel, export button, and "Manage" vs "View" labels.
   */
  const isAdmin = session?.user && session.user.role === 'admin';

  /* Tournament data and loading state */
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [loading, setLoading] = useState(true);

  /**
   * Fetches tournament details from the API by ID.
   * Called on mount and after status updates to refresh the display.
   * Wrapped in useCallback with `id` dependency for stable reference.
   */
  const fetchTournament = useCallback(async () => {
    try {
      const response = await fetch(`/api/tournaments/${id}`);
      if (response.ok) {
        const data = await response.json();
        setTournament(data);
      }
    } catch (err) {
      const metadata = err instanceof Error ? { message: err.message, stack: err.stack } : { error: err };
      logger.error("Failed to fetch tournament:", metadata);
    } finally {
      setLoading(false);
    }
  }, [id]);

  /* Fetch tournament on component mount */
  useEffect(() => {
    fetchTournament();
  }, [fetchTournament]);

  /**
   * Updates the tournament status via PUT request.
   * Used for status transitions:
   * - "draft" -> "active" (Start Tournament)
   * - "active" -> "completed" (Complete Tournament)
   * After a successful update, re-fetches tournament data.
   */
  const updateStatus = async (status: string) => {
    try {
      const response = await fetch(`/api/tournaments/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (response.ok) {
        fetchTournament();
      }
    } catch (err) {
      const metadata = err instanceof Error ? { message: err.message, stack: err.stack } : { error: err };
      logger.error("Failed to update status:", metadata);
    }
  };

  /**
   * Returns a styled Badge component based on tournament status.
   * Visual differentiation helps users quickly identify tournament states:
   * - Draft: Secondary (gray) badge for setup phase
   * - Active: Default (primary) badge for in-progress tournaments
   * - Completed: Outline badge for finished tournaments
   */
  const getStatusBadge = (status: string) => {
    switch (status) {
      case "draft":
        return <Badge variant="secondary">Draft</Badge>;
      case "active":
        return <Badge variant="default">Active</Badge>;
      case "completed":
        return <Badge variant="outline">Completed</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  /* Loading skeleton: shows animated placeholders while data is fetched */
  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-start">
          <div className="space-y-3">
            <div className="h-9 w-3/4 bg-muted animate-pulse rounded" />
            <div className="h-5 w-48 bg-muted animate-pulse rounded" />
          </div>
          <div className="flex gap-2">
            <div className="h-10 w-32 bg-muted animate-pulse rounded" />
            <div className="h-10 w-24 bg-muted animate-pulse rounded" />
          </div>
        </div>
        <CardSkeleton />
      </div>
    );
  }

  /* 404-like state when tournament is not found or API returned an error */
  if (!tournament) {
    return <div className="text-center py-8">Tournament not found</div>;
  }

  return (
    <ErrorBoundary>
      <div className="space-y-6">
        {/* Tournament header: name, status badge, date, and action buttons */}
        <div className="flex justify-between items-start">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-3xl font-bold">{tournament.name}</h1>
              {getStatusBadge(tournament.status)}
            </div>
            <p className="text-muted-foreground">
              {new Date(tournament.date).toLocaleDateString()}
            </p>
          </div>
          <div className="flex gap-2">
            {/*
             * Status transition buttons (admin only):
             * - Draft -> Active: "Start Tournament" begins the competition
             * - Active -> Completed: "Complete Tournament" finalizes results
             * These are one-way transitions; there is no revert mechanism.
             */}
            {isAdmin && tournament.status === "draft" && (
              <Button onClick={() => updateStatus("active")}>
                Start Tournament
              </Button>
            )}
            {isAdmin && tournament.status === "active" && (
              <Button onClick={() => updateStatus("completed")}>
                Complete Tournament
              </Button>
            )}
            {/* Export button for downloading tournament data (admin only) */}
            {isAdmin && <ExportButton tournamentId={id} tournamentName={tournament.name} />}
            {/* Back to list navigation */}
            <Button variant="outline" asChild>
              <Link href="/tournaments">Back to List</Link>
            </Button>
          </div>
        </div>

        {/*
         * Token Management Section (admin only).
         * Allows admins to generate, view, and manage tournament access tokens.
         * These tokens enable players to submit scores without full authentication,
         * providing a simplified entry flow during live tournament events.
         */}
        {isAdmin && (
          <TournamentTokenManager
            tournamentId={id}
            initialToken={tournament.token}
            initialTokenExpiresAt={tournament.tokenExpiresAt}
          />
        )}

        {/*
         * Game Mode Tabs - Navigate to each competition format.
         * Defaults to Battle Mode (BM) tab as it is the most commonly
         * used mode in JSMKC tournaments.
         *
         * Each tab contains a card with mode description and a navigation
         * button to the dedicated management/viewing page for that mode.
         */}
        <Tabs defaultValue="bm" className="space-y-4">
          <TabsList>
            <TabsTrigger value="tt">Time Trial</TabsTrigger>
            <TabsTrigger value="bm">Battle Mode</TabsTrigger>
            <TabsTrigger value="mr">Match Race</TabsTrigger>
            <TabsTrigger value="gp">Grand Prix</TabsTrigger>
            <TabsTrigger value="overall">Overall</TabsTrigger>
          </TabsList>

          {/* Time Attack (TA) - Individual time-based competition on 20 courses */}
          <TabsContent value="tt">
            <Card>
              <CardHeader>
                <CardTitle>Time Attack</CardTitle>
                <CardDescription>Individual time-based competition - 20 courses total time</CardDescription>
              </CardHeader>
              <CardContent>
                <Button asChild>
                  <Link href={`/tournaments/${id}/ta`}>
                    {isAdmin ? "Manage Time Attack" : "View Time Attack"}
                  </Link>
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Battle Mode (BM) - 1v1 balloon battle with group round-robin + double elimination */}
          <TabsContent value="bm">
            <Card>
              <CardHeader>
                <CardTitle>Battle Mode</CardTitle>
                <CardDescription>1v1 balloon battle qualification and finals</CardDescription>
              </CardHeader>
              <CardContent>
                <Button asChild>
                  <Link href={`/tournaments/${id}/bm`}>
                    {isAdmin ? "Manage Battle Mode" : "View Battle Mode"}
                  </Link>
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Match Race (MR) - 1v1 race on random courses with bracket structure */}
          <TabsContent value="mr">
            <Card>
              <CardHeader>
                <CardTitle>Match Race</CardTitle>
                <CardDescription>1v1 5-race competition</CardDescription>
              </CardHeader>
              <CardContent>
                <Button asChild>
                  <Link href={`/tournaments/${id}/mr`}>
                    {isAdmin ? "Manage Match Race" : "View Match Race"}
                  </Link>
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Grand Prix (GP) - Cup-based driver points (9, 6, 3, 1 for 1st-4th) */}
          <TabsContent value="gp">
            <Card>
              <CardHeader>
                <CardTitle>Grand Prix</CardTitle>
                <CardDescription>Cup-based driver points competition</CardDescription>
            </CardHeader>
              <CardContent>
                <Button asChild>
                  <Link href={`/tournaments/${id}/gp`}>
                    {isAdmin ? "Manage Grand Prix" : "View Grand Prix"}
                  </Link>
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/*
           * Overall Ranking - Combined points from all 4 game modes.
           * Maximum possible score is 12000 points (3000 per mode).
           * This tab is view-only for all users since rankings are
           * automatically calculated from individual mode results.
           */}
          <TabsContent value="overall">
            <Card>
              <CardHeader>
                <CardTitle>Overall Ranking</CardTitle>
                <CardDescription>Combined points from all 4 modes (TA, BM, MR, GP) - max 12000 points</CardDescription>
              </CardHeader>
              <CardContent>
                <Button asChild>
                  <Link href={`/tournaments/${id}/overall-ranking`}>
                    View Overall Ranking
                  </Link>
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </ErrorBoundary>
  );
}
