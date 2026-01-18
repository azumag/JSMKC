"use client";

import { useState, useEffect, useCallback, use } from "react";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { COURSE_INFO, type CourseAbbr } from "@/lib/constants";

interface Player {
  id: string;
  name: string;
  nickname: string;
}

interface GPMatch {
  id: string;
  matchNumber: number;
  player1Id: string;
  player2Id: string;
  points1: number;
  points2: number;
  completed: boolean;
  cup?: string;
  player1: Player;
  player2: Player;
  races?: {
    course: string;
    position1: number;
    position2: number;
    points1: number;
    points2: number;
  }[];
}

interface Tournament {
  id: string;
  name: string;
}

export default function GPMatchPage({
  params,
}: {
  params: Promise<{ id: string; matchId: string }>;
}) {
  const { id: tournamentId, matchId } = use(params);
  const [match, setMatch] = useState<GPMatch | null>(null);
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const [matchRes, tournamentRes] = await Promise.all([
        fetch(`/api/tournaments/${tournamentId}/gp/match/${matchId}`),
        fetch(`/api/tournaments/${tournamentId}`),
      ]);

      if (matchRes.ok) {
        const matchData = await matchRes.json();
        setMatch(matchData);
      }
      if (tournamentRes.ok) {
        const tournamentData = await tournamentRes.json();
        setTournament(tournamentData);
      }
    } catch (err) {
      console.error("Failed to fetch data:", err);
    } finally {
      setLoading(false);
    }
  }, [tournamentId, matchId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const getCourseName = (abbr: CourseAbbr) => {
    return COURSE_INFO.find((c) => c.abbr === abbr)?.name || abbr;
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>Loading...</p>
      </div>
    );
  }

  if (!match || !tournament) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>Match not found</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-2xl mx-auto space-y-4">
        <div className="text-center">
          <h1 className="text-xl font-bold">{tournament.name}</h1>
          <p className="text-muted-foreground">
            Grand Prix - Match #{match.matchNumber}
          </p>
        </div>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex justify-between items-center">
              <span>{match.player1.nickname}</span>
              <span className="text-2xl font-mono">vs</span>
              <span>{match.player2.nickname}</span>
            </CardTitle>
            {match.completed && (
              <CardDescription className="text-center">
                <Badge variant="secondary" className="text-lg px-4 py-1">
                  {match.points1} - {match.points2}
                </Badge>
              </CardDescription>
            )}
          </CardHeader>
        </Card>

        {match.cup && match.races && (
          <Card>
            <CardHeader>
              <CardTitle>
                {match.cup} Cup - Race Results
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {match.races.map((race, index) => (
                  <div key={index} className="border rounded-lg p-4">
                    <h3 className="font-medium mb-3">
                      Race {index + 1}: {getCourseName(race.course as CourseAbbr)}
                    </h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div
                        className={`p-3 rounded-lg ${
                          race.position1 === 1
                            ? "bg-green-500/20 border border-green-500"
                            : "bg-muted"
                        }`}
                      >
                        <p className="text-sm text-muted-foreground">
                          {match.player1.nickname}
                        </p>
                        <p className="text-2xl font-bold">
                          {race.position1 === 1 ? "1st" : "2nd"}
                        </p>
                        <p className="text-sm font-bold text-green-600">
                          {race.points1} pts
                        </p>
                      </div>
                      <div
                        className={`p-3 rounded-lg ${
                          race.position2 === 1
                            ? "bg-green-500/20 border border-green-500"
                            : "bg-muted"
                        }`}
                      >
                        <p className="text-sm text-muted-foreground">
                          {match.player2.nickname}
                        </p>
                        <p className="text-2xl font-bold">
                          {race.position2 === 1 ? "1st" : "2nd"}
                        </p>
                        <p className="text-sm font-bold text-green-600">
                          {race.points2} pts
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-4 pt-4 border-t">
                <div className="flex justify-center gap-8">
                  <div className="text-center">
                    <p className="text-sm text-muted-foreground">
                      {match.player1.nickname}
                    </p>
                    <p className="text-3xl font-bold">{match.points1} pts</p>
                  </div>
                  <div className="text-center">
                    <p className="text-sm text-muted-foreground">
                      {match.player2.nickname}
                    </p>
                    <p className="text-3xl font-bold">{match.points2} pts</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {match.completed && (
          <Card>
            <CardContent className="py-8 text-center">
              <div className="text-4xl mb-4">🏁</div>
              <h3 className="text-lg font-semibold mb-2">Match Complete</h3>
              <p className="text-muted-foreground">
                {match.points1 > match.points2
                  ? `${match.player1.nickname} wins!`
                  : match.points2 > match.points1
                  ? `${match.player2.nickname} wins!`
                  : "Draw"}
              </p>
            </CardContent>
          </Card>
        )}

        <div className="text-center">
          <Link
            href={`/tournaments/${tournamentId}/gp`}
            className="text-sm text-muted-foreground hover:underline"
          >
            ← Back to Grand Prix
          </Link>
        </div>
      </div>
    </div>
  );
}
