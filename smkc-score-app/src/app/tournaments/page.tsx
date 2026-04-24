/**
 * tournaments/page.tsx - Tournament List Page
 *
 * This page provides tournament management functionality:
 * 1. View all tournaments in a table with name, date, and status
 * 2. Create new tournaments (admin only) with name and date
 * 3. Delete tournaments with confirmation (admin only)
 * 4. Navigate to individual tournament detail pages
 *
 * Role-based access:
 * - All users can view the tournament list and open individual tournaments
 * - Only admin users see Create Tournament and Delete buttons
 * - Admin detection uses session.user.role === 'admin'
 *
 * Tournament status lifecycle:
 * - "draft": Tournament is being set up, not yet started
 * - "active": Tournament is currently in progress
 * - "completed": Tournament has finished, results are final
 *
 * API integration:
 * - GET /api/tournaments: Fetch paginated tournament list
 * - POST /api/tournaments: Create a new tournament
 * - DELETE /api/tournaments/:id: Delete a tournament
 *
 * The API may return either legacy list payloads or the standardized
 * success wrapper, so the fetch handler normalizes both formats.
 */
"use client";

import { useState, useEffect, useCallback } from "react";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { extractArrayData, extractPaginationMeta, type PaginationMeta } from "@/lib/api-response";
import { createLogger } from "@/lib/client-logger";
import { fetchWithRetry } from '@/lib/fetch-with-retry';
import { getTournamentUrlIdentifier } from "@/lib/tournament-identifier";

/** Client-side logger for error tracking */
const logger = createLogger({ serviceName: 'tournaments-list' });

const TOURNAMENTS_PAGE_SIZE = 50;

/**
 * Tournament data model matching the API response shape.
 * Contains the essential fields for list display.
 */
interface Tournament {
  id: string;
  slug?: string | null;
  name: string;
  date: string;
  status: string;
  publicModes: string[];
  createdAt: string;
}

/**
 * TournamentsPage - Main component for tournament list and creation.
 *
 * Manages the tournament list, create dialog state, and coordinates
 * with the tournaments API for CRUD operations.
 */
export default function TournamentsPage() {
  const { data: session } = useSession();
  const t = useTranslations('tournaments');
  const tc = useTranslations('common');

  /**
   * Admin role check: only sessions with the admin role can create
   * or delete tournaments. All users can view and open them.
   */
  const isAdmin = session?.user && session.user.role === 'admin';

  /* Tournament list, loading state, and fetch error tracking */
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [paginationMeta, setPaginationMeta] = useState<PaginationMeta | null>(null);

  /* Create tournament dialog state */
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    slug: "",
    date: "",
    dualReportEnabled: false,
    taPlayerSelfEdit: true,
  });
  const [error, setError] = useState("");

  /**
   * Fetches the tournament list from the API.
   * Handles both array responses and paginated responses
   * (shape: { data: Tournament[], meta: {...} }) for backward compatibility.
   * Wrapped in useCallback to prevent unnecessary re-renders.
   */
  const fetchTournaments = useCallback(async () => {
    try {
      setFetchError(false);
      // fetchWithRetry handles transient Workers errors
      const response = await fetchWithRetry(`/api/tournaments?page=${currentPage}&limit=${TOURNAMENTS_PAGE_SIZE}`);
      if (response.ok) {
        const result = await response.json();
        const meta = extractPaginationMeta(result);

        if (meta && meta.page > meta.totalPages) {
          setLoading(true);
          setCurrentPage(meta.totalPages);
          return;
        }

        setTournaments(extractArrayData<Tournament>(result));
        setPaginationMeta(meta);
      } else {
        setFetchError(true);
        logger.error("API returned error status", { status: response.status });
      }
    } catch (err) {
      setFetchError(true);
      const metadata = err instanceof Error ? { message: err.message, stack: err.stack } : { error: err };
      logger.error("Failed to fetch tournaments:", metadata);
    } finally {
      setLoading(false);
    }
  }, [currentPage]);

  /* Fetch tournaments on component mount */
  useEffect(() => {
    fetchTournaments();
  }, [fetchTournaments]);

  /**
   * Handles new tournament creation form submission.
   * On success, resets the form, closes the dialog, and refreshes the list.
   */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    try {
      const response = await fetch("/api/tournaments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        setFormData({ name: "", slug: "", date: "", dualReportEnabled: false, taPlayerSelfEdit: true });
        setIsAddDialogOpen(false);
        if (currentPage === 1) {
          fetchTournaments();
        } else {
          setCurrentPage(1);
        }
      } else {
        const data = await response.json();
        setError(data.error || t('failedToCreate'));
      }
    } catch (err) {
      logger.error("Failed to create tournament:", { error: err });
      setError(t('failedToCreate'));
    }
  };

  /**
   * Handles tournament deletion with confirmation dialog.
   * Uses browser confirm() as a guard against accidental deletion.
   */
  const handleDelete = async (id: string, status: string) => {
    if (status !== "draft") {
      alert(t('cannotDeleteStartedTournament'));
      return;
    }

    if (!confirm(tc('confirmDeleteTournament'))) return;

    try {
      const response = await fetch(`/api/tournaments/${id}`, {
        method: "DELETE",
      });

      if (response.ok) {
        fetchTournaments();
      } else {
        const data = await response.json().catch(() => null);
        alert(
          response.status === 409
            ? t('cannotDeleteStartedTournament')
            : data?.error || t('failedToDelete')
        );
      }
    } catch (err) {
      logger.error("Failed to delete tournament:", { error: err, tournamentId: id });
      alert(t('failedToDelete'));
    }
  };

  const totalTournaments = paginationMeta?.total ?? tournaments.length;
  const totalPages = paginationMeta?.totalPages ?? 1;
  const canGoPrevious = currentPage > 1;
  const canGoNext = currentPage < totalPages;

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
        return <Badge variant="secondary">{t('draft')}</Badge>;
      case "active":
        return <Badge variant="default">{t('activeStatus')}</Badge>;
      case "completed":
        return <Badge variant="outline">{t('completed')}</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  /* Simple loading text while data is fetched */
  if (loading) {
    return <div className="text-center py-8">{t('loadingTournaments')}</div>;
  }

  return (
    <div className="space-y-6">
      {/* Page header with title and Create Tournament button (admin only) */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">{t('title')}</h1>
          {/* Role-appropriate subtitle text */}
          <p className="text-muted-foreground">
            {isAdmin ? t('subtitleAdmin') : t('subtitleView')}
          </p>
        </div>
        {/* Create Tournament dialog - only rendered for admin users */}
        {isAdmin && (
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => setFormData({ name: "", slug: "", date: "", dualReportEnabled: false, taPlayerSelfEdit: true })}>
                {t('createTournament')}
              </Button>
            </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('createNewTournament')}</DialogTitle>
              <DialogDescription>
                {t('enterTournamentDetails')}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit}>
              <div className="space-y-4 py-4">
                {error && (
                  <div className="text-red-500 text-sm">{error}</div>
                )}
                <div className="space-y-2">
                  <Label htmlFor="name">{t('tournamentName')}</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) =>
                      setFormData({ ...formData, name: e.target.value })
                    }
                    placeholder={t('tournamentNamePlaceholder')}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="date">{t('date')}</Label>
                  <Input
                    id="date"
                    type="date"
                    value={formData.date}
                    onChange={(e) =>
                      setFormData({ ...formData, date: e.target.value })
                    }
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="slug">{t('customUrl')}</Label>
                  <Input
                    id="slug"
                    value={formData.slug}
                    onChange={(e) =>
                      setFormData({ ...formData, slug: e.target.value.toLowerCase() })
                    }
                    placeholder={t('customUrlPlaceholder')}
                  />
                  <p className="text-xs text-muted-foreground">
                    {t('customUrlHelp')}
                  </p>
                </div>
                <div className="flex items-center gap-3 pt-2">
                  <input
                    id="dualReport"
                    type="checkbox"
                    checked={formData.dualReportEnabled}
                    onChange={(e) =>
                      setFormData({ ...formData, dualReportEnabled: e.target.checked })
                    }
                    className="h-4 w-4 rounded border-gray-300"
                  />
                  <Label htmlFor="dualReport" className="text-sm font-normal cursor-pointer">
                    {t('dualReportEnabled')}
                  </Label>
                </div>
                <div className="flex items-center gap-3 pt-2">
                  <input
                    id="taPlayerSelfEdit"
                    type="checkbox"
                    checked={formData.taPlayerSelfEdit}
                    onChange={(e) =>
                      setFormData({ ...formData, taPlayerSelfEdit: e.target.checked })
                    }
                    className="h-4 w-4 rounded border-gray-300"
                  />
                  <Label htmlFor="taPlayerSelfEdit" className="text-sm font-normal cursor-pointer">
                    {t('taPlayerSelfEdit')}
                  </Label>
                </div>
              </div>
              <DialogFooter>
                <Button type="submit">{t('createTournament')}</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
        )}
      </div>

      {/* Tournament list table wrapped in a card */}
      <Card>
        <CardHeader>
          <CardTitle>{t('tournamentList')}</CardTitle>
          <CardDescription>
            {t('tournamentCount', { count: totalTournaments })}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {fetchError ? (
            /* Error state: API failed — show message with retry button */
            <div className="text-center py-8 space-y-3">
              <p className="text-destructive">{t('fetchError')}</p>
              <Button variant="outline" size="sm" onClick={() => { setLoading(true); fetchTournaments(); }}>
                {tc('retry')}
              </Button>
            </div>
          ) : tournaments.length === 0 ? (
            /* Empty state message - differs by role */
            <div className="text-center py-8 text-muted-foreground">
              {isAdmin
                ? t('noTournamentsAdmin')
                : t('noTournamentsView')}
            </div>
          ) : (
            <div className="space-y-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('name')}</TableHead>
                    <TableHead>{t('date')}</TableHead>
                    <TableHead>{t('status')}</TableHead>
                    <TableHead className="text-right">{tc('actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tournaments.map((tournament) => (
                    <TableRow key={tournament.id}>
                      {/* Tournament name links to the detail page */}
                      <TableCell className="font-medium">
                        <Link
                          href={`/tournaments/${getTournamentUrlIdentifier(tournament)}`}
                          className="hover:underline"
                        >
                          {tournament.name}
                        </Link>
                      </TableCell>
                      <TableCell>
                        {new Date(tournament.date).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {getStatusBadge(tournament.status)}
                          {/* Private badge: visible to admins when no modes are public */}
                          {isAdmin && (tournament.publicModes ?? []).length === 0 && (
                            <Badge variant="destructive">{t('hiddenModes')}</Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right space-x-2">
                        {/* Open button navigates to tournament detail page */}
                        <Button variant="outline" size="sm" asChild>
                          <Link href={`/tournaments/${getTournamentUrlIdentifier(tournament)}`}>
                            {tc('open')}
                          </Link>
                        </Button>
                        {/* Delete button - admin only, with confirmation */}
                        {isAdmin && (
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => handleDelete(tournament.id, tournament.status)}
                            disabled={tournament.status !== "draft"}
                            title={
                              tournament.status !== "draft"
                                ? t('cannotDeleteStartedTournament')
                                : undefined
                            }
                          >
                            {tc('delete')}
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {totalPages > 1 && (
                <div className="flex items-center justify-between gap-3">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!canGoPrevious}
                    onClick={() => {
                      setLoading(true);
                      setCurrentPage((page) => Math.max(1, page - 1));
                    }}
                  >
                    {t('previousPage')}
                  </Button>
                  <div className="text-sm text-muted-foreground">
                    {t('pageStatus', { page: currentPage, totalPages })}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!canGoNext}
                    onClick={() => {
                      setLoading(true);
                      setCurrentPage((page) => Math.min(totalPages, page + 1));
                    }}
                  >
                    {t('nextPage')}
                  </Button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
