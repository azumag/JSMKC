/**
 * Playoff Bracket Component
 *
 * Renders the pre-bracket playoff ("barrage") for Top 24 → Top 16 qualification.
 * The playoff is a single-elimination tournament for 12 players (barrage entrants)
 * who compete for 4 spots in the Upper Bracket (seeds 13-16).
 *
 * Structure:
 * - Playoff Round 1: 4 matches (seeds 8v9, 5v12, 6v11, 7v10) — losers eliminated
 * - Playoff Round 2: 4 matches (BYE seeds 1-4 vs R1 winners) — winners advance to Upper Bracket
 *
 * After each playoff_r2 match completes, the winner fills a specific Upper Bracket seed:
 * - M5 (BYE seed 1) winner → Upper seed 16
 * - M6 (BYE seed 4) winner → Upper seed 13
 * - M7 (BYE seed 3) winner → Upper seed 14
 * - M8 (BYE seed 2) winner → Upper seed 15
 */

"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

import type { Player } from "@/lib/types";

/** BM match data from the database including player relations */
interface BMMatch {
  id: string;
  matchNumber: number;
  round: string | null;
  player1Id: string;
  player2Id: string;
  score1: number;
  score2: number;
  completed: boolean;
  player1: Player;
  player2: Player;
}

/** Bracket structure definition for a single match position */
interface BracketMatch {
  matchNumber: number;
  round: string;
  bracket: "winners" | "losers" | "grand_final";
  player1Seed?: number;
  player2Seed?: number;
  /** For playoff_r2 matches: which Upper Bracket seed the winner claims (13-16) */
  advancesToUpperSeed?: number;
}

/** Props for the PlayoffBracket component */
interface PlayoffBracketProps {
  /** All playoff matches from the database (stage='playoff') */
  playoffMatches: BMMatch[];
  /** Bracket structure defining match positions and connections */
  playoffStructure: BracketMatch[];
  /** Human-readable round names mapping */
  roundNames: Record<string, string>;
  /** Optional callback when a match card is clicked (for score entry) */
  onMatchClick?: (match: BMMatch) => void;
  /** Seeded player data for displaying seed numbers */
  seededPlayers?: { seed: number; playerId: string; player: Player }[];
  /** Number of wins required to highlight a completed match winner (BM finals: 5) */
  targetWins?: number;
}

/**
 * Match card for playoff matches.
 * Same visual style as DoubleEliminationBracket.MatchCard but includes
 * advancesToUpperSeed label for playoff_r2 completed matches.
 */
function PlayoffMatchCard({
  match,
  bracketMatch,
  seededPlayers,
  onClick,
  isTBD,
  targetWins,
}: {
  match?: BMMatch;
  bracketMatch: BracketMatch;
  seededPlayers?: { seed: number; playerId: string; player: Player }[];
  onClick?: () => void;
  isTBD: boolean;
  targetWins: number;
}) {
  const seededPlayer1 = bracketMatch.player1Seed
    ? seededPlayers?.find((p) => p.seed === bracketMatch.player1Seed)?.player
    : undefined;
  const seededPlayer2 = bracketMatch.player2Seed
    ? seededPlayers?.find((p) => p.seed === bracketMatch.player2Seed)?.player
    : undefined;

  const player1: Player | undefined = match?.player1 || seededPlayer1;
  const player2: Player | undefined = match?.player2 || seededPlayer2;

  const isWinner1 = match?.completed && match.score1 >= targetWins;
  const isWinner2 = match?.completed && match.score2 >= targetWins;

  return (
    <div
      className={cn(
        "border rounded-lg p-2 bg-card min-w-[180px] cursor-pointer hover:border-primary transition-colors focus:outline-none focus:ring-2 focus:ring-primary",
        match?.completed && "border-green-500/50"
      )}
      onClick={onClick}
      role="button"
      tabIndex={0}
      aria-label={`Match ${bracketMatch.matchNumber}: ${player1?.nickname || 'TBD'} vs ${player2?.nickname || 'TBD'}`}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick?.();
        }
      }}
    >
      {/* Match number label */}
      <div className="text-xs text-muted-foreground mb-1">
        M{bracketMatch.matchNumber}
      </div>

      {/* Player 1 row */}
      <div
        className={cn(
          "flex justify-between items-center py-1 px-2 rounded",
          isWinner1 && "bg-green-500/20 font-bold"
        )}
      >
        <span className="flex items-center gap-1">
          {bracketMatch.player1Seed && (
            <span className="text-xs text-muted-foreground">
              [{bracketMatch.player1Seed}]
            </span>
          )}
          <span className={isTBD ? "text-muted-foreground" : ""}>
            {isTBD ? "TBD" : player1?.nickname || "TBD"}
          </span>
        </span>
        <span className="font-mono">
          {match?.completed ? match.score1 : "-"}
        </span>
      </div>

      {/* Player 2 row */}
      <div
        className={cn(
          "flex justify-between items-center py-1 px-2 rounded",
          isWinner2 && "bg-green-500/20 font-bold"
        )}
      >
        <span className="flex items-center gap-1">
          {bracketMatch.player2Seed !== undefined && bracketMatch.player2Seed > 0 && (
            <span className="text-xs text-muted-foreground">
              [{bracketMatch.player2Seed}]
            </span>
          )}
          <span className={isTBD ? "text-muted-foreground" : ""}>
            {isTBD ? "TBD" : player2?.nickname || "TBD"}
          </span>
        </span>
        <span className="font-mono">
          {match?.completed ? match.score2 : "-"}
        </span>
      </div>

      {/* Upper seed label for completed playoff_r2 matches */}
      {match?.completed && bracketMatch.advancesToUpperSeed && (
        <div className="mt-1 text-xs text-blue-500 font-medium">
          → Upper Seed {bracketMatch.advancesToUpperSeed}
        </div>
      )}
    </div>
  );
}

/**
 * Playoff Bracket component.
 * Renders the 8-match pre-bracket playoff in two columns (R1 | R2).
 */
export function PlayoffBracket({
  playoffMatches,
  playoffStructure,
  roundNames,
  onMatchClick,
  seededPlayers,
  targetWins = 5,
}: PlayoffBracketProps) {
  const getMatch = (matchNumber: number) =>
    playoffMatches.find((m) => m.matchNumber === matchNumber);

  const getBracketMatch = (matchNumber: number) =>
    playoffStructure.find((b) => b.matchNumber === matchNumber);

  const isTBD = (matchNumber: number) => {
    const match = getMatch(matchNumber);
    if (!match) return true;
    return !match.completed && match.player1Id === match.player2Id;
  };

  const playoffR1 = playoffStructure.filter((b) => b.round === "playoff_r1");
  const playoffR2 = playoffStructure.filter((b) => b.round === "playoff_r2");

  const r1RoundName = roundNames["playoff_r1"] || "Playoff Round 1";
  const r2RoundName = roundNames["playoff_r2"] || "Playoff Round 2";

  return (
    <Card className="border-blue-500/30">
      <CardHeader className="py-3">
        <CardTitle className="text-lg flex items-center gap-2">
          Playoff (Barrage)
          <Badge variant="outline" className="text-blue-500 border-blue-500">
            Top 24
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground mb-4">
          {r2RoundName} winners advance to Upper Bracket seeds 13-16
        </p>
        <div className="flex flex-col gap-6 md:flex-row md:items-start md:gap-8 overflow-x-auto pb-4">
          {/* Playoff Round 1 */}
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-muted-foreground">
              {r1RoundName}
            </h4>
            <div className="flex flex-col gap-2">
              {playoffR1.map((b) => (
                <PlayoffMatchCard
                  key={b.matchNumber}
                  match={getMatch(b.matchNumber)}
                  bracketMatch={b}
                  seededPlayers={seededPlayers}
                  onClick={() => {
                    const match = getMatch(b.matchNumber);
                    if (match && onMatchClick) onMatchClick(match);
                  }}
                  isTBD={isTBD(b.matchNumber)}
                  targetWins={targetWins}
                />
              ))}
            </div>
          </div>

          {/* Playoff Round 2 */}
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-muted-foreground">
              {r2RoundName}
            </h4>
            <div className="flex flex-col gap-2">
              {playoffR2.map((b) => (
                <PlayoffMatchCard
                  key={b.matchNumber}
                  match={getMatch(b.matchNumber)}
                  bracketMatch={b}
                  seededPlayers={seededPlayers}
                  onClick={() => {
                    const match = getMatch(b.matchNumber);
                    if (match && onMatchClick) onMatchClick(match);
                  }}
                  isTBD={isTBD(b.matchNumber)}
                  targetWins={targetWins}
                />
              ))}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default PlayoffBracket;
