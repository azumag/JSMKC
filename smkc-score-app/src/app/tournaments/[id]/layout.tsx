/**
 * Tournament Detail Layout
 *
 * Shared layout for all tournament sub-pages (/tournaments/[id]/*).
 * Provides:
 * 1. Tournament header: name, status badge, date
 * 2. Admin controls: Start/Complete Tournament, Export
 * 3. Anchor-based tab navigation for game modes (TA, BM, MR, GP, Overall)
 * 4. "Back to List" navigation
 *
 * The tab navigation uses plain anchors instead of JS-only tabs or Next Link
 * prefetching, enabling direct URL access without speculative production reads.
 *
 * For participant pages (URLs containing "/participant") and match pages,
 * the layout skips the header/tabs and renders only {children}, because
 * participants access these pages via their player session and don't need
 * the full tournament admin interface.
 */
"use client";

import { fetchWithRetry } from "@/lib/fetch-with-retry";
import { useState, useEffect, useCallback, use } from "react";
import { useSession } from "next-auth/react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
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
  publicModes: string[];
}

/**
 * Tab configuration for the game-mode navigation.
 *
 * The active tab is marked with a 3px Racing Red bar via `pit-active`;
 * everything else is plain Manrope text. We deliberately keep the tab
 * label single-line so dense tournament pages don't get a busy header.
 */
const TABS = [
  { href: "ta", labelKey: "timeTrial" },
  { href: "bm", labelKey: "battleMode" },
  { href: "mr", labelKey: "matchRace" },
  { href: "gp", labelKey: "grandPrix" },
  { href: "overall-ranking", labelKey: "overall" },
] as const;

/** Admin-only tabs shown after the main mode tabs */
const ADMIN_TABS = [
  { href: "broadcast", label: "配信管理" },
] as const;

/**
 * Determines if the current page is a "minimal UI" page where the
 * tournament header and tab bar should be hidden.
 *
 * Pages excluded from the full layout:
 * - /participant: Accessed by logged-in players during live events
 * - /match/: Public-facing shareable match entry pages
 * - /overlay: OBS browser-source overlay (transparent background, no chrome)
 *
 * These pages should show only their own content without the
 * admin navigation chrome (header, status controls, tab bar).
 */
function isMinimalPage(pathname: string): boolean {
  return (
    pathname.includes("/participant") ||
    pathname.includes("/match/") ||
    pathname.includes("/overlay")
  );
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
  if (pathname.includes("/broadcast")) return "broadcast";
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
   * Translation hooks for the tournaments namespace and common namespace.
   * t() resolves keys from "tournaments" (e.g., tab labels, status badges).
   * tc() resolves keys from "common" (e.g., generic messages like "not found").
   */
  const t = useTranslations("tournaments");
  const tc = useTranslations("common");

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
      // ?fields=summary skips BM relations — layout only needs name/date/status
      // cache:'no-store' prevents stale publicModes after publicModesChanged re-fetch (issue #662)
      const response = await fetchWithRetry(`/api/tournaments/${id}?fields=summary`, { cache: 'no-store' });
      if (response.ok) {
        const json = await response.json();
        // API uses createSuccessResponse: { success, data: {...} }
        setTournament(json.data ?? json);
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

  const [retryCount, setRetryCount] = useState(0);

  /**
   * Auto-retry: if tournament data fails to load after all fetchWithRetry
   * attempts, schedule one more attempt after 2 seconds. Capped at 2 extra
   * retries to prevent infinite loops on genuinely missing tournaments (404).
   */
  useEffect(() => {
    if (!loading && !tournament && retryCount < 2) {
      const timer = setTimeout(() => {
        setRetryCount(c => c + 1);
        fetchTournament();
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [loading, tournament, retryCount, fetchTournament]);

  useEffect(() => {
    fetchTournament();
  }, [fetchTournament]);

  // Re-fetch when a mode's publish state changes so tab badges update immediately (issue #621)
  useEffect(() => {
    const handler = () => { fetchTournament(); };
    window.addEventListener('publicModesChanged', handler);
    return () => window.removeEventListener('publicModesChanged', handler);
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
   * Status flag — green/active, mustard/draft, black/completed. Mirrors
   * the same flag semantics used on the tournament list and overall
   * ranking, so users learn one color language across the app.
   */
  const getStatusBadge = (status: string) => {
    switch (status) {
      case "draft":
        return <Badge variant="flag-draft">{t("draft")}</Badge>;
      case "active":
        return <Badge variant="flag-active">{t("activeStatus")}</Badge>;
      case "completed":
        return <Badge variant="flag-completed">{t("completed")}</Badge>;
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
    return <div className="text-center py-8">{tc("tournamentNotFound")}</div>;
  }

  const activeTab = getActiveTab(pathname);

  return (
    <ErrorBoundary>
      <div className="space-y-7">
        {/*
         * Tournament header. Status flag and date sit on a single quiet
         * line beside the title — no programme/championship eyebrow.
         */}
        <header className="border-b border-foreground/15 pb-5">
          <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
            <div className="flex items-stretch gap-3">
              {/*
               * 3px Racing Red rule — a quiet "race chapter" mark that
               * runs the full height of the title block. Substitutes for
               * the heavier eyebrow ticker we removed earlier.
               */}
              <span aria-hidden="true" className="block w-[3px] bg-primary self-stretch" />
              <div>
                <h1 className="font-display text-3xl sm:text-4xl lg:text-5xl tracking-wide leading-[0.95] text-foreground">
                  {tournament.name}
                </h1>
                <div className="flex items-center gap-3 mt-2 text-sm text-muted-foreground">
                  {getStatusBadge(tournament.status)}
                  <span className="font-mono tabular">
                    {new Date(tournament.date).toLocaleDateString()}
                  </span>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {/*
               * Status transition buttons (admin only). One-way: there
               * is no revert mechanism — guarding lives in the API.
               */}
              {isAdmin && tournament.status === "draft" && (
                <Button onClick={() => updateStatus("active")}>
                  {t("startTournament")}
                </Button>
              )}
              {isAdmin && tournament.status === "active" && (
                <Button onClick={() => updateStatus("completed")}>
                  {t("completeTournament")}
                </Button>
              )}
              {isAdmin && (
                <ExportButton
                  tournamentId={id}
                  tournamentName={tournament.name}
                />
              )}
              {isAdmin && (
                <ExportButton
                  tournamentId={id}
                  tournamentName={tournament.name}
                  format="cdm"
                >
                  CDM Export
                </ExportButton>
              )}
              <Button variant="outline" asChild>
                <a href="/tournaments">← {t("backToList")}</a>
              </Button>
            </div>
          </div>
        </header>

        {/*
         * Tab navigation. Plain anchors avoid speculative prefetch storms
         * against production Workers/D1 during large tournament operations.
         * The active tab draws a 3px Racing Red bar via `pit-active`.
         */}
        <nav
          aria-label="Tournament sections"
          className="overflow-x-auto -mx-5 sm:-mx-6 px-5 sm:px-6 border-b border-foreground/15"
        >
          <ul className="flex items-stretch gap-0 min-w-max">
            {TABS.map((tab) => {
              const modeName = tab.href === "overall-ranking" ? null : tab.href;
              const isHidden =
                modeName &&
                !isAdmin &&
                !(tournament.publicModes ?? []).includes(modeName);
              if (isHidden) return null;
              const isActive = activeTab === tab.href;
              const adminHidden =
                isAdmin && modeName && !(tournament.publicModes ?? []).includes(modeName);

              return (
                <li key={tab.href}>
                  <a
                    href={`/tournaments/${id}/${tab.href}`}
                    aria-current={isActive ? "page" : undefined}
                    className={`inline-flex items-center gap-2 px-4 py-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background ${
                      isActive
                        ? "pit-active text-foreground font-semibold"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {t(tab.labelKey)}
                    {adminHidden && (
                      <Badge variant="flag-draft" className="px-1 py-0">
                        {t("hidden")}
                      </Badge>
                    )}
                  </a>
                </li>
              );
            })}
            {isAdmin &&
              ADMIN_TABS.map((tab) => {
                const isActive = activeTab === tab.href;
                return (
                  <li key={tab.href}>
                    <a
                      href={`/tournaments/${id}/${tab.href}`}
                      aria-current={isActive ? "page" : undefined}
                      className={`inline-flex items-center px-4 py-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background ${
                        isActive
                          ? "pit-active text-foreground font-semibold"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {tab.label}
                    </a>
                  </li>
                );
              })}
          </ul>
        </nav>

        {/*
         * Per-mode publish controls have moved next to each mode's player
         * settings (issue #618). Each mode's publish state is now independent;
         * the "未公開" badge below still reflects the per-mode state via
         * tournament.publicModes.
         */}

        {/* Child page content (TA, BM, MR, GP, or Overall sub-page) */}
        {children}
      </div>
    </ErrorBoundary>
  );
}
