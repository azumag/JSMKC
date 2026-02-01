/**
 * page.tsx - Home Page (Dashboard)
 *
 * This is the landing page of the JSMKC application, providing:
 * 1. Application title and description
 * 2. Quick navigation cards to Players and Tournaments sections
 * 3. Overview of the 4 competition game modes
 *
 * Role-based UI:
 * - Admin users (authenticated via OAuth) see management-oriented
 *   labels ("Manage Players", "Create and manage tournaments")
 * - Non-admin users see read-only labels ("View Players", "View tournaments")
 * - Admin detection is based on session.user.role === 'admin',
 *   which is set during OAuth sign-in for authorized Discord users (#132)
 *
 * This is a client component because it uses useSession() to
 * determine the user's role for conditional rendering.
 */
'use client'

import Link from "next/link";
import { useSession } from "next-auth/react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

/**
 * Home - The main dashboard page component.
 *
 * Renders a hero section with the app title, two action cards
 * for Players and Tournaments, and a game modes overview section
 * describing the four competition formats available in SMK tournaments.
 */
export default function Home() {
  const { data: session } = useSession();

  /**
   * Admin role check: OAuth-authenticated users (via Discord) are
   * assigned the 'admin' role in the auth configuration (#132).
   * This flag controls whether UI elements show management or
   * view-only labels and actions.
   */
  const isAdmin = session?.user?.role === 'admin';

  return (
    <div className="space-y-8">
      {/* Hero section with application title and tagline */}
      <div className="text-center space-y-4">
        <h1 className="text-4xl font-bold">SMKC Score System</h1>
          <p className="text-muted-foreground text-lg">
          SMKC Score Management
        </p>
      </div>

      {/* Primary navigation cards - Players and Tournaments */}
      <div className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto">
        {/* Players card - links to the player management/viewing page */}
        <Card>
          <CardHeader>
            <CardTitle>Players</CardTitle>
            {/* Show admin-appropriate description based on role (#132) */}
            <CardDescription>
              {isAdmin ? "Manage tournament participants" : "View tournament participants"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild className="w-full">
              <Link href="/players">
                {isAdmin ? "Manage Players" : "View Players"}
              </Link>
            </Button>
          </CardContent>
        </Card>

        {/* Tournaments card - links to the tournament list page */}
        <Card>
          <CardHeader>
            <CardTitle>Tournaments</CardTitle>
            <CardDescription>
              {isAdmin ? "Create and manage tournaments" : "View tournaments"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild className="w-full">
              <Link href="/tournaments">View Tournaments</Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      {/*
       * Game Modes overview section.
       * Displays the 4 competitive formats supported by the system:
       * - Time Trial (TA): Individual 20-course time competition
       * - Battle Mode (BM): 1v1 balloon-popping battles
       * - Match Race (MR): 1v1 race on random courses
       * - Grand Prix (GP): Cup-based driver points (9, 6, 3, 1)
       */}
      <div className="max-w-4xl mx-auto">
        <Card>
          <CardHeader>
            <CardTitle>Game Modes</CardTitle>
            <CardDescription>Available competition formats</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-4 gap-4">
              <div className="p-4 border rounded-lg text-center">
                <h3 className="font-semibold">Time Trial</h3>
                <p className="text-sm text-muted-foreground">Individual time-based competition</p>
              </div>
              <div className="p-4 border rounded-lg text-center">
                <h3 className="font-semibold">Battle Mode</h3>
                <p className="text-sm text-muted-foreground">1v1 balloon battle</p>
              </div>
              <div className="p-4 border rounded-lg text-center">
                <h3 className="font-semibold">Match Race</h3>
                <p className="text-sm text-muted-foreground">1v1 race competition</p>
              </div>
              <div className="p-4 border rounded-lg text-center">
                <h3 className="font-semibold">Grand Prix</h3>
                <p className="text-sm text-muted-foreground">Cup-based driver points</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
