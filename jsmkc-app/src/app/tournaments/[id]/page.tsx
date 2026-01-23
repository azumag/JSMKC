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

interface Tournament {
  id: string;
  name: string;
  date: string;
  status: string;
  token?: string | null;
  tokenExpiresAt?: string | null;
}

export default function TournamentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { data: session } = useSession();
  const isAdmin = session?.user && session.user.role === 'admin';

  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchTournament = useCallback(async () => {
    try {
      const response = await fetch(`/api/tournaments/${id}`);
      if (response.ok) {
        const data = await response.json();
        setTournament(data);
      }
    } catch (err) {
      console.error("Failed to fetch tournament:", err);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchTournament();
  }, [fetchTournament]);

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
      console.error("Failed to update status:", err);
    }
  };

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

  if (!tournament) {
    return <div className="text-center py-8">Tournament not found</div>;
  }

  return (
    <ErrorBoundary>
      <div className="space-y-6">
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
            {isAdmin && <ExportButton tournamentId={id} tournamentName={tournament.name} />}
            <Button variant="outline" asChild>
              <Link href="/tournaments">Back to List</Link>
            </Button>
          </div>
        </div>

        {/* Token Management Section */}
        {isAdmin && (
          <TournamentTokenManager
            tournamentId={id}
            initialToken={tournament.token}
            initialTokenExpiresAt={tournament.tokenExpiresAt}
          />
        )}

        <Tabs defaultValue="bm" className="space-y-4">
          <TabsList>
            <TabsTrigger value="tt">Time Trial</TabsTrigger>
            <TabsTrigger value="bm">Battle Mode</TabsTrigger>
            <TabsTrigger value="mr">Match Race</TabsTrigger>
            <TabsTrigger value="gp">Grand Prix</TabsTrigger>
          </TabsList>

          <TabsContent value="tt">
            <Card>
              <CardHeader>
                <CardTitle>Time Attack</CardTitle>
                <CardDescription>Individual time-based competition - 20 courses total time</CardDescription>
              </CardHeader>
              <CardContent>
                <Button asChild>
                  <Link href={`/tournaments/${id}/ta`}>
                    Manage Time Attack
                  </Link>
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="bm">
            <Card>
              <CardHeader>
                <CardTitle>Battle Mode</CardTitle>
                <CardDescription>1v1 balloon battle qualification and finals</CardDescription>
              </CardHeader>
              <CardContent>
                <Button asChild>
                  <Link href={`/tournaments/${id}/bm`}>
                    Manage Battle Mode
                  </Link>
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="mr">
            <Card>
              <CardHeader>
                <CardTitle>Match Race</CardTitle>
                <CardDescription>1v1 5-race competition</CardDescription>
              </CardHeader>
              <CardContent>
                <Button asChild>
                  <Link href={`/tournaments/${id}/mr`}>
                    Manage Match Race
                  </Link>
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="gp">
            <Card>
              <CardHeader>
                <CardTitle>Grand Prix</CardTitle>
                <CardDescription>Cup-based driver points competition</CardDescription>
            </CardHeader>
              <CardContent>
                <Button asChild>
                  <Link href={`/tournaments/${id}/gp`}>
                    Manage Grand Prix
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
