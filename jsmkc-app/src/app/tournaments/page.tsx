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
 * The API returns paginated responses with shape { data: Tournament[], meta: {...} },
 * so the fetch handler extracts the data array from the response.
 */
"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
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

/**
 * Tournament data model matching the API response shape.
 * Contains the essential fields for list display.
 */
interface Tournament {
  id: string;
  name: string;
  date: string;
  status: string;
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

  /**
   * Admin role check: only OAuth-authenticated users with admin role
   * can create or delete tournaments. All users can view and open them.
   */
  const isAdmin = session?.user && session.user.role === 'admin';

  /* Tournament list and loading state */
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [loading, setLoading] = useState(true);

  /* Create tournament dialog state */
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    date: "",
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
      const response = await fetch("/api/tournaments");
      if (response.ok) {
        const result = await response.json();
        /* Handle both direct array and paginated response formats */
        setTournaments(Array.isArray(result) ? result : result.data || []);
      }
    } catch (err) {
      console.error("Failed to fetch tournaments:", err);
    } finally {
      setLoading(false);
    }
  }, []);

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
        setFormData({ name: "", date: "" });
        setIsAddDialogOpen(false);
        fetchTournaments();
      } else {
        const data = await response.json();
        setError(data.error || "Failed to create tournament");
      }
    } catch (err) {
      console.error("Failed to create tournament:", err);
      setError("Failed to create tournament");
    }
  };

  /**
   * Handles tournament deletion with confirmation dialog.
   * Uses browser confirm() as a guard against accidental deletion.
   */
  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this tournament?")) return;

    try {
      const response = await fetch(`/api/tournaments/${id}`, {
        method: "DELETE",
      });

      if (response.ok) {
        fetchTournaments();
      }
    } catch (err) {
      console.error("Failed to delete tournament:", err);
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

  /* Simple loading text while data is fetched */
  if (loading) {
    return <div className="text-center py-8">Loading tournaments...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Page header with title and Create Tournament button (admin only) */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Tournaments</h1>
          {/* Role-appropriate subtitle text */}
          <p className="text-muted-foreground">
            {isAdmin ? "Create and manage competitions" : "View competitions"}
          </p>
        </div>
        {/* Create Tournament dialog - only rendered for admin users */}
        {isAdmin && (
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => setFormData({ name: "", date: "" })}>
                Create Tournament
              </Button>
            </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Tournament</DialogTitle>
              <DialogDescription>
                Enter the tournament details below.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit}>
              <div className="space-y-4 py-4">
                {error && (
                  <div className="text-red-500 text-sm">{error}</div>
                )}
                <div className="space-y-2">
                  <Label htmlFor="name">Tournament Name</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) =>
                      setFormData({ ...formData, name: e.target.value })
                    }
                    placeholder="e.g., SMKC 2025"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="date">Date</Label>
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
              </div>
              <DialogFooter>
                <Button type="submit">Create Tournament</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
        )}
      </div>

      {/* Tournament list table wrapped in a card */}
      <Card>
        <CardHeader>
          <CardTitle>Tournament List</CardTitle>
          <CardDescription>
            {tournaments.length} tournament{tournaments.length !== 1 ? "s" : ""}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {tournaments.length === 0 ? (
            /* Empty state message - differs by role */
            <div className="text-center py-8 text-muted-foreground">
              {isAdmin
                ? "No tournaments created yet. Create your first tournament to get started."
                : "No tournaments yet."}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tournaments.map((tournament) => (
                  <TableRow key={tournament.id}>
                    {/* Tournament name links to the detail page */}
                    <TableCell className="font-medium">
                      <Link
                        href={`/tournaments/${tournament.id}`}
                        className="hover:underline"
                      >
                        {tournament.name}
                      </Link>
                    </TableCell>
                    <TableCell>
                      {new Date(tournament.date).toLocaleDateString()}
                    </TableCell>
                    <TableCell>{getStatusBadge(tournament.status)}</TableCell>
                    <TableCell className="text-right space-x-2">
                      {/* Open button navigates to tournament detail page */}
                      <Button variant="outline" size="sm" asChild>
                        <Link href={`/tournaments/${tournament.id}`}>
                          Open
                        </Link>
                      </Button>
                      {/* Delete button - admin only, with confirmation */}
                      {isAdmin && (
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => handleDelete(tournament.id)}
                        >
                          Delete
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
