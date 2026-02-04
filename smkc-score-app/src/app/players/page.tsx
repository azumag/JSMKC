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
 * The API returns paginated responses with shape { data: Player[], meta: {...} },
 * so the fetch handler extracts the data array from the response.
 */
"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
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
import { TableSkeleton } from "@/components/ui/loading-skeleton";
import { createLogger } from "@/lib/client-logger";

/**
 * Client-side logger for the players page.
 * Uses structured logging for consistent error tracking.
 */
const logger = createLogger({ serviceName: 'players' });

/**
 * Player data model matching the API response shape.
 * Represents a tournament participant with optional country.
 */
interface Player {
  id: string;
  name: string;
  nickname: string;
  country: string | null;
  createdAt: string;
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
   * Admin role check: only OAuth-authenticated users with admin role
   * can create, edit, or delete players. Regular users and anonymous
   * visitors can only view the player list.
   */
  const isAdmin = session?.user && session.user.role === 'admin';

  /* Player list and loading state */
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);

  /* Dialog visibility states for add, edit, and password display modals */
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isPasswordDialogOpen, setIsPasswordDialogOpen] = useState(false);

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
  });

  /* Currently editing player ID (null when adding a new player) */
  const [editingPlayerId, setEditingPlayerId] = useState<string | null>(null);

  /* Form validation error message */
  const [error, setError] = useState("");

  /**
   * Fetches the player list from the API.
   * Handles both array responses and paginated responses
   * (shape: { data: Player[], meta: {...} }) for backward compatibility.
   * Wrapped in useCallback to prevent unnecessary re-renders.
   */
  const fetchPlayers = useCallback(async () => {
    try {
      const response = await fetch("/api/players");
      if (response.ok) {
        const result = await response.json();
        /* Handle both direct array and paginated response formats */
        setPlayers(Array.isArray(result) ? result : result.data || []);
      }
    } catch (err) {
      const metadata = err instanceof Error ? { message: err.message, stack: err.stack } : { error: err };
      logger.error("Failed to fetch players:", metadata);
    } finally {
      setLoading(false);
    }
  }, []);

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
    setError("");

    try {
      const response = await fetch("/api/players", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        const data = await response.json();
        setFormData({ name: "", nickname: "", country: "" });
        setIsAddDialogOpen(false);

        /*
         * If the API returned a temporary password, show it in a
         * dedicated dialog. The admin must save this password because
         * it is only displayed once (hashed in DB, not retrievable).
         */
        if (data.temporaryPassword) {
          setTemporaryPassword(data.temporaryPassword);
          setIsPasswordDialogOpen(true);
        }

        fetchPlayers();
      } else {
        const data = await response.json();
        setError(data.error || t('failedToCreate'));
      }
    } catch (err) {
      const metadata = err instanceof Error ? { message: err.message, stack: err.stack } : { error: err };
      logger.error("Failed to create player:", metadata);
      setError(t('failedToCreate'));
    }
  };

  /**
   * Handles player update form submission.
   * Sends a PUT request to update the player identified by editingPlayerId.
   * On failure, displays the error message from the API response.
   */
  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const response = await fetch(`/api/players/${editingPlayerId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        // Success: close dialog, reset form, refresh list
        setIsEditDialogOpen(false);
        setEditingPlayerId(null);
        setFormData({ name: "", nickname: "", country: "" });
        fetchPlayers();
      } else {
        const data = await response.json();
        setError(data.error || t('failedToUpdate'));
      }
    } catch (err) {
      const metadata = err instanceof Error ? { message: err.message, stack: err.stack } : { error: err };
      logger.error("Failed to update player:", metadata);
      setError(t('failedToUpdate'));
    } finally {
      setLoading(false);
    }
  };

  /**
   * Handles player deletion with confirmation dialog.
   * Uses browser confirm() as a simple guard against accidental deletion.
   */
  const handleDelete = async (id: string) => {
    if (!confirm(tc('confirmDeletePlayer'))) return;

    try {
      const response = await fetch(`/api/players/${id}`, {
        method: "DELETE",
      });

      if (response.ok) {
        fetchPlayers();
      }
    } catch (err) {
      const metadata = err instanceof Error ? { message: err.message, stack: err.stack } : { error: err };
      logger.error("Failed to delete player:", metadata);
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
      setFormData({ name: "", nickname: "", country: "" });
    }
  };

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
              <Button onClick={() => setFormData({ name: "", nickname: "", country: "" })}>
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
              </div>
              <DialogFooter>
                <Button type="submit">{tc('addPlayer')}</Button>
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
            {t('playersRegistered', { count: players.length })}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {players.length === 0 ? (
            /* Empty state message - differs by role */
            <div className="text-center py-8 text-muted-foreground">
              {isAdmin
                ? t('noPlayersAdmin')
                : t('noPlayersView')}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('nickname')}</TableHead>
                  <TableHead>{t('fullName')}</TableHead>
                  <TableHead>{t('country')}</TableHead>
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
                          variant="destructive"
                          size="sm"
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
            </div>
            <DialogFooter>
              <Button type="submit">{t('saveChanges')}</Button>
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
      <Dialog open={isPasswordDialogOpen} onOpenChange={setIsPasswordDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('createdSuccess')}</DialogTitle>
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
