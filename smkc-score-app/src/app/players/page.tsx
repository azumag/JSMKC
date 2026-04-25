/**
 * players/page.tsx - Player Management Page
 *
 * This page provides CRUD operations for tournament participants:
 * 1. View all registered players in a table format
 * 2. Add new players (admin only) with name, nickname, and country
 * 3. Edit existing player details (admin only)
 * 4. Delete players with confirmation (admin only)
 * 5. Display temporary passwords for newly created players
 *
 * Role-based access:
 * - All users can view the player list (public read access)
 * - Only admin users see Add/Edit/Delete controls
 * - Admin detection uses session.user.role === 'admin'
 *
 * API integration:
 * - GET /api/players: Fetch paginated player list
 * - POST /api/players: Create a new player (returns temporaryPassword)
 * - PUT /api/players/:id: Update player details
 * - DELETE /api/players/:id: Delete a player
 *
 * The API may return either legacy list payloads or the standardized
 * success wrapper, so the fetch handler normalizes both formats.
 */
"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
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
import { TableSkeleton } from "@/components/ui/loading-skeleton";
import { extractArrayData, extractPaginationMeta, type PaginationMeta } from "@/lib/api-response";
import { fetchWithRetry } from "@/lib/fetch-with-retry";
import { createLogger } from "@/lib/client-logger";

/**
 * Client-side logger for the players page.
 * Uses structured logging for consistent error tracking.
 */
const logger = createLogger({ serviceName: 'players' });

/**
 * Page size for the player list. Matches the tournaments list page
 * and stays at or below the API default so the server does not need
 * to clamp the requested limit.
 */
const PLAYERS_PAGE_SIZE = 50;

/**
 * Player data model matching the API response shape.
 * Represents a tournament participant with optional country.
 */
interface Player {
  id: string;
  name: string;
  nickname: string;
  country: string | null;
  noCamera: boolean;
  createdAt: string;
  /** Set by the API for admin users: true if the player is registered in any tournament. */
  hasTournamentData?: boolean;
}

/**
 * PlayersPage - Main component for player management.
 *
 * Manages multiple dialog states (add, edit, password display)
 * and coordinates with the players API for CRUD operations.
 * Admin actions are conditionally rendered based on session role.
 */
export default function PlayersPage() {
  const { data: session } = useSession();
  const t = useTranslations('players');
  const tc = useTranslations('common');

  /**
   * Admin role check: only sessions with the admin role can create,
   * edit, or delete players. Regular users and anonymous visitors
   * can only view the player list.
   */
  const isAdmin = session?.user && session.user.role === 'admin';

  /* Player list, loading state, and fetch error tracking */
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [paginationMeta, setPaginationMeta] = useState<PaginationMeta | null>(null);

  /* Dialog visibility states for add, edit, and password display modals */
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isPasswordDialogOpen, setIsPasswordDialogOpen] = useState(false);
  /* Whether the password dialog is for a reset (true) or new creation (false) */
  const [isPasswordReset, setIsPasswordReset] = useState(false);

  /**
   * Temporary password storage: When a new player is created, the API
   * generates a one-time password. This is displayed in a separate
   * dialog and must be saved by the admin before closing, as it
   * cannot be retrieved again (passwords are hashed in the database).
   */
  const [temporaryPassword, setTemporaryPassword] = useState("");

  /* Shared form data used by both add and edit dialogs */
  const [formData, setFormData] = useState({
    name: "",
    nickname: "",
    country: "",
    noCamera: false,
  });

  /* Currently editing player ID (null when adding a new player) */
  const [editingPlayerId, setEditingPlayerId] = useState<string | null>(null);

  /* Form validation error message */
  const [error, setError] = useState("");

  /* Prevents double-submit on add/edit/delete operations */
  const [submitting, setSubmitting] = useState(false);

  /**
   * Fetches the player list from the API.
   * Handles both array responses and paginated responses
   * (shape: { data: Player[], meta: {...} }) for backward compatibility.
   * Wrapped in useCallback to prevent unnecessary re-renders.
   */
  const fetchPlayers = useCallback(async () => {
    try {
      setFetchError(false);
      const response = await fetchWithRetry(
        `/api/players?page=${currentPage}&limit=${PLAYERS_PAGE_SIZE}`
      );
      if (response.ok) {
        const result = await response.json();
        const meta = extractPaginationMeta(result);

        /*
         * If the current page is past the last page (e.g. the last player on
         * a page was just deleted), bounce back to the last valid page and
         * let the effect re-fetch. Skip when totalPages is 0 so an empty
         * dataset does not push the page index to 0.
         */
        if (meta && meta.totalPages > 0 && meta.page > meta.totalPages) {
          setLoading(true);
          setCurrentPage(meta.totalPages);
          return;
        }

        setPlayers(extractArrayData<Player>(result));
        setPaginationMeta(meta);
      } else {
        setFetchError(true);
        logger.error("API returned error status", { status: response.status });
      }
    } catch (err) {
      setFetchError(true);
      const metadata = err instanceof Error ? { message: err.message, stack: err.stack } : { error: err };
      logger.error("Failed to fetch players:", metadata);
    } finally {
      setLoading(false);
    }
  }, [currentPage]);

  /* Fetch players on component mount */
  useEffect(() => {
    fetchPlayers();
  }, [fetchPlayers]);

  /**
   * Handles new player creation form submission.
   * On success, clears the form, closes the dialog, and optionally
   * shows the temporary password dialog if a password was generated.
   * Then refreshes the player list to show the new entry.
   */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setError("");
    setSubmitting(true);

    try {
      /**
       * Retry on Workers 1101 crash (non-JSON 500 response).
       * POST is idempotent here because nickname has a unique constraint:
       * if the first attempt created the player but the response was lost,
       * the retry returns 409 which we treat as success (minus password).
       */
      let response: Response | null = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        response = await fetch("/api/players", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(formData),
        });
        if (response.ok) break;
        // 409 on retry = player was created on a previous attempt that crashed
        // before sending the response. Treat as success (but password is lost).
        if (response.status === 409 && attempt > 0) break;
        if (response.status < 500) break;
        if (attempt < 2) await new Promise(r => setTimeout(r, 800));
      }

      if (response!.ok || (response!.status === 409)) {
        // 409 means the player was created but we lost the response.
        // Skip the password dialog since the plaintext is unrecoverable.
        const isLostResponse = response!.status === 409;
        const rawJson = isLostResponse ? {} : await response!.json().catch(() => ({}));
        /* Unwrap createSuccessResponse wrapper: { success, data: { player, temporaryPassword } } */
        const data = rawJson.data ?? rawJson;

        // Optimistic update: immediately add the new player to the list
        const newPlayer: Player = data.player ?? {
          id: crypto.randomUUID(),
          name: formData.name,
          nickname: formData.nickname,
          country: formData.country || null,
          createdAt: new Date().toISOString(),
        };
        setPlayers(prev => [...prev, newPlayer]);

        setFormData({ name: "", nickname: "", country: "", noCamera: false });
        setIsAddDialogOpen(false);

        if (!isLostResponse && data.temporaryPassword) {
          setIsPasswordReset(false);
          setTemporaryPassword(data.temporaryPassword);
          setIsPasswordDialogOpen(true);
        }

        // No fetchPlayers() here — the optimistic update is sufficient.
        // Background sync would overwrite it with stale/failed data.
      } else {
        const text = await response!.text();
        try {
          const data = JSON.parse(text);
          setError(data.error || t('failedToCreate'));
        } catch {
          setError(t('failedToCreate'));
        }
      }
    } catch (err) {
      const metadata = err instanceof Error ? { message: err.message, stack: err.stack } : { error: err };
      logger.error("Failed to create player:", metadata);
      setError(t('failedToCreate'));
    } finally {
      setSubmitting(false);
    }
  };

  /**
   * Handles player update form submission.
   * Sends a PUT request to update the player identified by editingPlayerId.
   * On failure, displays the error message from the API response.
   */
  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setError("");
    setSubmitting(true);

    try {
      let response: Response | null = null;
      for (let attempt = 0; attempt < 2; attempt++) {
        response = await fetch(`/api/players/${editingPlayerId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(formData),
        });
        if (response.ok || response.status < 500) break;
        if (attempt === 0) await new Promise(r => setTimeout(r, 800));
      }

      if (response!.ok) {
        // Optimistic update: immediately reflect changes in the list
        setPlayers(prev => prev.map(p =>
          p.id === editingPlayerId
            ? { ...p, name: formData.name, nickname: formData.nickname, country: formData.country || null, noCamera: formData.noCamera }
            : p
        ));
        setIsEditDialogOpen(false);
        setEditingPlayerId(null);
        setFormData({ name: "", nickname: "", country: "", noCamera: false });
      } else {
        const text = await response!.text();
        try {
          const data = JSON.parse(text);
          setError(data.error || t('failedToUpdate'));
        } catch {
          setError(t('failedToUpdate'));
        }
      }
    } catch (err) {
      const metadata = err instanceof Error ? { message: err.message, stack: err.stack } : { error: err };
      logger.error("Failed to update player:", metadata);
      setError(t('failedToUpdate'));
    } finally {
      setSubmitting(false);
    }
  };

  /**
   * Handles player deletion with confirmation dialog.
   * Uses browser confirm() as a simple guard against accidental deletion.
   */
  const handleDelete = async (id: string) => {
    if (submitting) return;
    if (!confirm(tc('confirmDeletePlayer'))) return;
    setSubmitting(true);

    try {
      let response: Response | null = null;
      for (let attempt = 0; attempt < 2; attempt++) {
        response = await fetch(`/api/players/${id}`, { method: "DELETE" });
        if (response.ok || response.status < 500) break;
        if (attempt === 0) await new Promise(r => setTimeout(r, 800));
      }

      if (response!.ok) {
        // Optimistic update: immediately remove from list, then re-fetch so
        // paginationMeta (total, totalPages) stays accurate and we bounce
        // back a page if the delete emptied the current one.
        setPlayers(prev => prev.filter(p => p.id !== id));
        fetchPlayers();
      } else {
        const text = await response!.text();
        try {
          const data = JSON.parse(text);
          alert(data.error || t('failedToDelete'));
        } catch {
          alert(t('failedToDelete'));
        }
      }
    } catch (err) {
      const metadata = err instanceof Error ? { message: err.message, stack: err.stack } : { error: err };
      logger.error("Failed to delete player:", metadata);
      alert(t('failedToDelete'));
    } finally {
      setSubmitting(false);
    }
  };

  /**
   * Resets a player's password and shows the new temporary password.
   * Uses the same password dialog as player creation for consistent UX.
   */
  const handleResetPassword = async (playerId: string) => {
    if (submitting) return;
    if (!confirm(t('confirmResetPassword'))) return;
    setSubmitting(true);

    try {
      let response: Response | null = null;
      for (let attempt = 0; attempt < 2; attempt++) {
        response = await fetch(`/api/players/${playerId}/reset-password`, {
          method: 'POST',
        });
        if (response.ok || response.status < 500) break;
        if (attempt === 0) await new Promise(r => setTimeout(r, 800));
      }

      if (response!.ok) {
        const json = await response!.json();
        /* Unwrap createSuccessResponse wrapper: { success, data: { temporaryPassword } } */
        const data = json.data ?? json;
        setIsPasswordReset(true);
        setTemporaryPassword(data.temporaryPassword);
        setIsPasswordDialogOpen(true);
      } else {
        const text = await response!.text();
        try {
          const data = JSON.parse(text);
          alert(data.error || t('failedToResetPassword'));
        } catch {
          alert(t('failedToResetPassword'));
        }
      }
    } catch (err) {
      const metadata = err instanceof Error ? { message: err.message, stack: err.stack } : { error: err };
      logger.error('Failed to reset password:', metadata);
      alert(t('failedToResetPassword'));
    } finally {
      setSubmitting(false);
    }
  };

  /**
   * Opens the edit dialog pre-populated with the selected player's data.
   * Resets the error state and sets the editing player ID for the
   * update handler to reference.
   */
  const openEditDialog = (player: Player) => {
    setFormData({
      name: player.name,
      nickname: player.nickname,
      country: player.country || "",
      noCamera: player.noCamera,
    });
    setEditingPlayerId(player.id);
    setError("");
    setIsEditDialogOpen(true);
  };

  /**
   * Handles edit dialog close: resets form data and editing state
   * when the dialog is dismissed without saving.
   */
  const handleEditDialogClose = (open: boolean) => {
    setIsEditDialogOpen(open);
    if (!open) {
      setEditingPlayerId(null);
      setFormData({ name: "", nickname: "", country: "", noCamera: false });
    }
  };

  /* Pagination derived values; hidden when there is only one page. */
  const totalPages = paginationMeta?.totalPages ?? 1;
  const canGoPrevious = currentPage > 1;
  const canGoNext = currentPage < totalPages;
  /* Count in the card description uses the API-reported total so the
     figure does not collapse to the current page size when paginated. */
  const totalPlayers = paginationMeta?.total ?? players.length;

  /* Loading skeleton: shows animated placeholders while data is fetched */
  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div className="space-y-3">
            <div className="h-9 w-24 bg-muted animate-pulse rounded" />
            <div className="h-5 w-48 bg-muted animate-pulse rounded" />
          </div>
          <div className="h-10 w-32 bg-muted animate-pulse rounded" />
        </div>
        <Card>
          <CardHeader>
            <div className="h-6 w-32 bg-muted animate-pulse rounded" />
            <div className="h-4 w-40 bg-muted animate-pulse rounded mt-2" />
          </CardHeader>
          <CardContent>
            <TableSkeleton rows={5} columns={4} />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page header with title and Add Player button (admin only) */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">{t('title')}</h1>
          {/* Role-appropriate subtitle text */}
          <p className="text-muted-foreground">
            {isAdmin ? t('subtitleAdmin') : t('subtitleView')}
          </p>
        </div>
        {/* Add Player dialog - only rendered for admin users */}
        {isAdmin && (
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => setFormData({ name: "", nickname: "", country: "", noCamera: false })}>
                {tc('addPlayer')}
              </Button>
            </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('addNewPlayer')}</DialogTitle>
              <DialogDescription>
                {t('enterPlayerInfo')}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit}>
              <div className="space-y-4 py-4">
                {error && (
                  <div className="text-red-500 text-sm">{error}</div>
                )}
                <div className="space-y-2">
                  <Label htmlFor="name">{t('fullName')}</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) =>
                      setFormData({ ...formData, name: e.target.value })
                    }
                    placeholder={t('fullNamePlaceholder')}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="nickname">{t('nickname')}</Label>
                  <Input
                    id="nickname"
                    value={formData.nickname}
                    onChange={(e) =>
                      setFormData({ ...formData, nickname: e.target.value })
                    }
                    placeholder={t('nicknamePlaceholder')}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="country">{t('countryOptional')}</Label>
                  <Input
                    id="country"
                    value={formData.country}
                    onChange={(e) =>
                      setFormData({ ...formData, country: e.target.value })
                    }
                    placeholder={t('countryPlaceholder')}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="noCamera"
                    checked={formData.noCamera}
                    onCheckedChange={(checked) =>
                      setFormData({ ...formData, noCamera: checked === true })
                    }
                  />
                  <Label htmlFor="noCamera">{t('noCamera')}</Label>
                </div>
              </div>
              <DialogFooter>
                <Button type="submit" disabled={submitting}>
                  {submitting ? tc('saving') : tc('addPlayer')}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
        )}
      </div>

      {/* Player list table wrapped in a card */}
      <Card>
        <CardHeader>
          <CardTitle>{t('playerList')}</CardTitle>
          <CardDescription>
            {t('playersRegistered', { count: totalPlayers })}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {fetchError ? (
            /* Error state: API failed — show message with retry button */
            <div className="text-center py-8 space-y-3">
              <p className="text-destructive">{t('fetchError')}</p>
              <Button variant="outline" size="sm" onClick={() => { setLoading(true); fetchPlayers(); }}>
                {tc('retry')}
              </Button>
            </div>
          ) : players.length === 0 ? (
            /* Empty state message - differs by role */
            <div className="text-center py-8 text-muted-foreground">
              {isAdmin
                ? t('noPlayersAdmin')
                : t('noPlayersView')}
            </div>
          ) : (
            <div className="space-y-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('nickname')}</TableHead>
                    <TableHead>{t('fullName')}</TableHead>
                    <TableHead>{t('country')}</TableHead>
                    <TableHead>{t('noCamera')}</TableHead>
                    {/* Actions column only visible to admins */}
                    {isAdmin && <TableHead className="text-right">{tc('actions')}</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {players.map((player) => (
                    <TableRow key={player.id}>
                      <TableCell className="font-medium">
                        {player.nickname}
                      </TableCell>
                      <TableCell>{player.name}</TableCell>
                      <TableCell>{player.country || "-"}</TableCell>
                      <TableCell>{player.noCamera ? "✗" : "-"}</TableCell>
                      {/* Admin-only action buttons: Edit and Delete */}
                      {isAdmin && (
                        <TableCell className="text-right space-x-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openEditDialog(player)}
                          >
                            {tc('edit')}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={submitting}
                            onClick={() => handleResetPassword(player.id)}
                          >
                            {t('resetPassword')}
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            disabled={submitting || !!player.hasTournamentData}
                            title={player.hasTournamentData ? t('cannotDeleteTournamentPlayer') : undefined}
                            onClick={() => handleDelete(player.id)}
                          >
                            {tc('delete')}
                          </Button>
                        </TableCell>
                      )}
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

      {/* Edit Player Dialog - controlled externally via state */}
      <Dialog open={isEditDialogOpen} onOpenChange={handleEditDialogClose}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('editPlayer')}</DialogTitle>
            <DialogDescription>
              {t('updatePlayerInfo')}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleUpdate}>
            <div className="space-y-4 py-4">
              {error && <div className="text-red-500 text-sm">{error}</div>}
              <div className="space-y-2">
                <Label htmlFor="edit-name">{t('fullName')}</Label>
                <Input
                  id="edit-name"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-nickname">{t('nickname')}</Label>
                <Input
                  id="edit-nickname"
                  value={formData.nickname}
                  onChange={(e) =>
                    setFormData({ ...formData, nickname: e.target.value })
                  }
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-country">{t('countryOptional')}</Label>
                <Input
                  id="edit-country"
                  value={formData.country}
                  onChange={(e) =>
                    setFormData({ ...formData, country: e.target.value })
                  }
                />
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="edit-noCamera"
                  checked={formData.noCamera}
                  onCheckedChange={(checked) =>
                    setFormData({ ...formData, noCamera: checked === true })
                  }
                />
                <Label htmlFor="edit-noCamera">{t('noCamera')}</Label>
              </div>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={submitting}>
                  {submitting ? tc('saving') : t('saveChanges')}
                </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/*
       * Temporary Password Display Dialog
       * Shown after a new player is successfully created.
       * The password is generated server-side and only displayed once.
       * Admin must copy and share it with the player, as it cannot
       * be retrieved again (stored as a hash in the database).
       */}
      <Dialog open={isPasswordDialogOpen} onOpenChange={(open) => {
        setIsPasswordDialogOpen(open);
        if (!open) setTemporaryPassword("");
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{isPasswordReset ? t('passwordResetSuccess') : t('createdSuccess')}</DialogTitle>
            <DialogDescription>
              {t('savePasswordWarning')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>{t('temporaryPassword')}</Label>
              <div className="flex gap-2">
                <Input
                  value={temporaryPassword}
                  readOnly
                  className="font-mono"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    navigator.clipboard.writeText(temporaryPassword);
                  }}
                >
                  {tc('copy')}
                </Button>
              </div>
            </div>
            <div className="text-sm text-muted-foreground">
              {t('passwordNote')}
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setIsPasswordDialogOpen(false)}>
              {t('savedIt')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
