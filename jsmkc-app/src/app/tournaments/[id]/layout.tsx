/**
 * Tournament Detail Layout
 *
 * Shared layout for all tournament sub-pages (/tournaments/[id]/*).
 * Provides:
 * 1. Tournament header: name, status badge, date
 * 2. Admin controls: Start/Complete Tournament, Export
 * 3. Link-based tab navigation for game modes (TA, BM, MR, GP, Overall)
 * 4. "Back to List" navigation
 *
 * The tab navigation uses Next.js <Link> components instead of JS-only tabs,
 * enabling direct URL access to each mode's content without an extra click.
 * The layout is preserved across tab switches, so the header doesn't re-render.
 *
 * For participant pages (URLs containing "/participant") and match pages,
 * the layout skips the header/tabs and renders only {children}, because
 * participants access these pages via their player session and don't need
 * the full tournament admin interface.
 */
"use client";

import { useState, useEffect, useCallback, use } from "react";
import { useSession } from "next-auth/react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ExportButton } from "@/components/tournament/export-button";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { createLogger } from "@/lib/client-logger";

const logger = createLogger({ serviceName: "tournaments-layout" });

/**
 * Tournament data model used by the layout header.
 */
interface Tournament {
  id: string;
  name: string;
  date: string;
  status: string;
}

/**
 * Tab configuration for the game mode navigation bar.
 * Each entry maps a URL path segment to its display label.
 */
const TABS = [
  { href: "ta", label: "Time Trial" },
  { href: "bm", label: "Battle Mode" },
  { href: "mr", label: "Match Race" },
  { href: "gp", label: "Grand Prix" },
  { href: "overall-ranking", label: "Overall" },
] as const;

/**
 * Determines if the current page is a "minimal UI" page where the
 * tournament header and tab bar should be hidden.
 *
 * Pages excluded from the full layout:
 * - /participant: Accessed by logged-in players during live events
 * - /match/: Public-facing shareable match entry pages
 *
 * These pages should show only their own content without the
 * admin navigation chrome (header, status controls, tab bar).
 */
function isMinimalPage(pathname: string): boolean {
  return pathname.includes("/participant") || pathname.includes("/match/");
}

/**
 * Determines which tab should be shown as active based on the current pathname.
 * Returns the matching tab href or empty string if no match.
 *
 * Uses string inclusion matching to support sub-routes:
 * e.g., /tournaments/123/bm/finals still activates the "bm" tab.
 *
 * "overall-ranking" is checked first to avoid false matching with shorter segments.
 */
function getActiveTab(pathname: string): string {
  /* Check "overall-ranking" first since it's the longest segment
     and won't conflict with shorter path segments */
  if (pathname.includes("/overall-ranking")) return "overall-ranking";
  for (const tab of TABS) {
    if (tab.href !== "overall-ranking" && pathname.includes(`/${tab.href}`)) {
      return tab.href;
    }
  }
  return "";
}

export default function TournamentLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const pathname = usePathname();
  const { data: session } = useSession();

  /**
   * Admin role check: controls visibility of status transition buttons,
   * export button, and management labels.
   */
  const isAdmin = session?.user && session.user.role === "admin";

  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [loading, setLoading] = useState(true);

  /**
   * Fetches tournament details from the API.
   * Called on mount and after status updates to refresh the header display.
   */
  const fetchTournament = useCallback(async () => {
    try {
      const response = await fetch(`/api/tournaments/${id}`);
      if (response.ok) {
        const data = await response.json();
        setTournament(data);
      }
    } catch (err) {
      const metadata =
        err instanceof Error
          ? { message: err.message, stack: err.stack }
          : { error: err };
      logger.error("Failed to fetch tournament:", metadata);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchTournament();
  }, [fetchTournament]);

  /**
   * Updates the tournament status via PUT request.
   * Used for one-way status transitions:
   * - "draft" -> "active" (Start Tournament)
   * - "active" -> "completed" (Complete Tournament)
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
      const metadata =
        err instanceof Error
          ? { message: err.message, stack: err.stack }
          : { error: err };
      logger.error("Failed to update status:", metadata);
    }
  };

  /**
   * Returns a styled Badge component based on tournament status.
   * - Draft: Secondary (gray) for setup phase
   * - Active: Default (primary) for in-progress
   * - Completed: Outline for finished tournaments
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

  /**
   * For participant pages, skip the tournament header and tabs entirely.
   * These pages are accessed by logged-in players during live events
   * and should show only the game content.
   */
  if (isMinimalPage(pathname)) {
    return <>{children}</>;
  }

  /* Loading skeleton while tournament data is being fetched */
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
        {/* Tab bar skeleton */}
        <div className="h-10 w-full bg-muted animate-pulse rounded-lg" />
        {/* Content skeleton */}
        <div className="h-64 bg-muted animate-pulse rounded" />
      </div>
    );
  }

  /* 404-like state when tournament is not found or API returned an error */
  if (!tournament) {
    return <div className="text-center py-8">Tournament not found</div>;
  }

  const activeTab = getActiveTab(pathname);

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
            {isAdmin && (
              <ExportButton
                tournamentId={id}
                tournamentName={tournament.name}
              />
            )}
            {/* Back to list navigation */}
            <Button variant="outline" asChild>
              <Link href="/tournaments">Back to List</Link>
            </Button>
          </div>
        </div>

        {/*
         * Link-based Tab Navigation for Game Modes.
         *
         * Uses Next.js <Link> components so each tab is a URL-based navigation.
         * This enables:
         * - Direct content display on tab click (no extra click needed)
         * - Bookmarkable URLs for each game mode
         * - Browser back/forward navigation between tabs
         * - Layout preservation (header doesn't re-render on tab switch)
         *
         * Styling matches the existing TabsList/TabsTrigger components:
         * - Container: bg-muted rounded-lg padding
         * - Active tab: bg-background shadow-sm
         * - Inactive tab: transparent with hover effect
         */}
        <div className="inline-flex h-10 items-center justify-center rounded-lg bg-muted p-1 text-muted-foreground">
          {TABS.map((tab) => (
            <Link
              key={tab.href}
              href={`/tournaments/${id}/${tab.href}`}
              className={`inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                activeTab === tab.href
                  ? "bg-background text-foreground shadow-sm"
                  : "hover:bg-background/50 hover:text-foreground"
              }`}
            >
              {tab.label}
            </Link>
          ))}
        </div>

        {/* Child page content (TA, BM, MR, GP, or Overall sub-page) */}
        {children}
      </div>
    </ErrorBoundary>
  );
}
