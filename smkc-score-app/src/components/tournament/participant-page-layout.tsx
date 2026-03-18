/**
 * ParticipantPageLayout — Shared layout for BM/MR/GP participant pages
 *
 * Renders the common structure:
 * - Loading spinner, login prompt, tournament-not-found screens
 * - Page header (mode title, tournament name, date)
 * - Player identity card
 * - Error alert
 * - Empty state or match list with card headers + player cards
 * - Footer navigation
 *
 * Mode-specific content (score form, previous reports) is injected via render props.
 */
"use client";

import { ReactNode } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  LogIn, Trophy, Users, Clock, CheckCircle, AlertTriangle,
  type LucideIcon,
} from "lucide-react";
import type { BaseMatch, ParticipantTournament } from "@/lib/hooks/useParticipantMatches";

interface ParticipantPageLayoutProps<TMatch extends BaseMatch> {
  /** Game mode — resolves mode-specific translations */
  mode: "bm" | "mr" | "gp";
  /** Icon for the section header (Trophy, Flag, Star, etc.) */
  sectionIcon: LucideIcon;
  /** Max container width class (e.g., "max-w-4xl", "max-w-6xl") */
  maxWidth?: string;
  /** i18n key in 'participant' namespace for the empty state message */
  noPendingKey: string;
  /* Data from useParticipantMatches */
  sessionStatus: string;
  hasAccess: boolean;
  loading: boolean;
  tournament: ParticipantTournament | null;
  session: { user?: { nickname?: string; name?: string | null } } | null;
  error: string | null;
  myMatches: TMatch[];
  tournamentId: string;
  playerId: string | undefined;
  submitting: string | null;
  /** Render extra content in the match card header (e.g., GP cup info) */
  renderCardHeaderExtra?: (match: TMatch) => ReactNode;
  /** Render the mode-specific score entry form inside each match card */
  renderMatchForm: (match: TMatch) => ReactNode;
  /** Render previous score reports section inside each match card */
  renderPreviousReports: (match: TMatch) => ReactNode;
}

export function ParticipantPageLayout<TMatch extends BaseMatch>({
  mode,
  sectionIcon: SectionIcon,
  maxWidth = "max-w-4xl",
  noPendingKey,
  sessionStatus,
  hasAccess,
  loading,
  tournament,
  session,
  error,
  myMatches,
  tournamentId,
  playerId,
  submitting: _submitting,
  renderCardHeaderExtra,
  renderMatchForm,
  renderPreviousReports,
}: ParticipantPageLayoutProps<TMatch>) {
  const tPart = useTranslations("participant");
  const tMode = useTranslations(mode);

  /* Loading state */
  if (sessionStatus === "loading" || loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="h-12 w-12 mx-auto mb-4 animate-pulse rounded-full bg-muted" />
          <p className="text-lg">{tPart("loadingTournament")}</p>
        </div>
      </div>
    );
  }

  /* Not logged in — show login prompt */
  if (!hasAccess) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <LogIn className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <CardTitle>{tPart("playerLoginRequired")}</CardTitle>
            <CardDescription>{tPart("loginToReport")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button asChild className="w-full">
              <Link href="/auth/signin">{tPart("logIn")}</Link>
            </Button>
            <p className="text-sm text-muted-foreground text-center">
              {tPart("loginHelp")}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  /* Tournament not found */
  if (!tournament) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <Trophy className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <CardTitle>{tPart("tournamentNotFound")}</CardTitle>
            <CardDescription>{tPart("tournamentNotFoundDesc")}</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold mb-2">{tMode("scoreEntry")}</h1>
          <p className="text-lg text-muted-foreground">{tournament.name}</p>
          <p className="text-sm text-muted-foreground">
            {new Date(tournament.date).toLocaleDateString()}
          </p>
        </div>

        <div className={`${maxWidth} mx-auto`}>
          {/* Player identity card */}
          <Card className="mb-6">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <Users className="h-8 w-8 text-blue-600" />
                <div>
                  <h3 className="font-semibold">
                    {session?.user?.nickname || session?.user?.name}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {tPart("loggedInAsPlayer")}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Error alert */}
          {error && (
            <Alert variant="destructive" className="mb-6">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Matches or empty state */}
          {myMatches.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Clock className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <h3 className="text-lg font-semibold mb-2">
                  {tPart("noPendingMatches")}
                </h3>
                <p className="text-muted-foreground">{tPart(noPendingKey)}</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-6">
              <div className="flex items-center gap-2">
                <SectionIcon className="h-6 w-6 text-yellow-600" />
                <h2 className="text-2xl font-semibold">
                  {tPart("yourPendingMatches")}
                </h2>
              </div>

              {myMatches.map((match) => (
                <Card key={match.id}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="text-lg">
                          {tPart("matchNumber", { number: match.matchNumber })}
                        </CardTitle>
                        <CardDescription>
                          {tPart("tvInfo", { tv: match.tvNumber ?? "" })} •{" "}
                          {match.stage === "qualification"
                            ? tPart("qualification")
                            : "Finals"}
                          {renderCardHeaderExtra?.(match)}
                        </CardDescription>
                      </div>
                      {match.completed ? (
                        <Badge variant="default" className="bg-green-600">
                          <CheckCircle className="h-3 w-3 mr-1" />
                          {tPart("completed")}
                        </Badge>
                      ) : (
                        <Badge variant="outline">
                          <Clock className="h-3 w-3 mr-1" />
                          {tPart("pending")}
                        </Badge>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {/* Player cards with "You" badge */}
                      <div className="grid grid-cols-2 gap-4">
                        {[match.player1, match.player2].map((player, idx) => {
                          const side = idx === 0 ? match.player1Side : match.player2Side;
                          const isYou = player.id === playerId;
                          return (
                            <div
                              key={player.id}
                              className={`p-3 rounded-lg border ${isYou ? "bg-blue-50 border-blue-200" : "bg-gray-50 border-gray-200"}`}
                            >
                              <div className="font-medium">
                                {player.nickname}
                                {isYou && (
                                  <Badge variant="default" className="ml-2 bg-blue-600">
                                    {tPart("you")}
                                  </Badge>
                                )}
                              </div>
                              <div className="text-sm text-muted-foreground">
                                {tPart("controller", { side })}
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* Mode-specific form (injected by each page) */}
                      {!match.completed && renderMatchForm(match)}

                      {/* Mode-specific previous reports (injected by each page) */}
                      {renderPreviousReports(match)}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* Footer nav */}
        <div className="text-center mt-8">
          <Button variant="outline" asChild>
            <Link href={`/tournaments/${tournamentId}/participant`}>
              {tPart("backToGameSelection")}
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
