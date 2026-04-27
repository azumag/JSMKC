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

import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { TV_NUMBER_OPTIONS } from "@/lib/constants";

import type { Player } from "@/lib/types";

/** BM match data from the database including player relations */
interface BMMatch {
  id: string;
  matchNumber: number;
  round: string | null;
  stage?: string | null;
  tvNumber?: number | null;
  startingCourseNumber?: number | null;
  player1Id: string;
  player2Id: string;
  score1: number;
  score2: number;
  cup?: string | null;
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
  /** Number of wins required to highlight a completed match winner */
  getTargetWins?: (match: BMMatch | undefined, bracketMatch: BracketMatch) => number;
  /** See `DoubleEliminationBracket.onTvNumberChange` — same select-to-save UX. */
  onTvNumberChange?: (match: BMMatch, tvNumber: number | null) => void;
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
  isPlayer1TBD,
  isPlayer2TBD,
  getTargetWins,
  onTvNumberChange,
}: {
  match?: BMMatch;
  bracketMatch: BracketMatch;
  seededPlayers?: { seed: number; playerId: string; player: Player }[];
  onClick?: () => void;
  isPlayer1TBD: boolean;
  isPlayer2TBD: boolean;
  getTargetWins?: (match: BMMatch | undefined, bracketMatch: BracketMatch) => number;
  onTvNumberChange?: (match: BMMatch, tvNumber: number | null) => void;
}) {
  const tc = useTranslations("common");
  const tf = useTranslations("finals");
  const seededPlayer1 = bracketMatch.player1Seed
    ? seededPlayers?.find((p) => p.seed === bracketMatch.player1Seed)?.player
    : undefined;
  const seededPlayer2 = bracketMatch.player2Seed
    ? seededPlayers?.find((p) => p.seed === bracketMatch.player2Seed)?.player
    : undefined;

  const player1: Player | undefined = match?.player1 || seededPlayer1;
  const player2: Player | undefined = match?.player2 || seededPlayer2;

  const targetWins = getTargetWins?.(match, bracketMatch) ?? 3;
  const isWinner1 = !!match?.completed && match.score1 >= targetWins && match.score1 > match.score2;
  const isWinner2 = !!match?.completed && match.score2 >= targetWins && match.score2 > match.score1;

  const isTV1 = match?.tvNumber === 1;

  return (
    <div
      className={cn(
        "border rounded-lg p-2 bg-card min-w-[180px] cursor-pointer hover:border-primary transition-colors focus:outline-none focus:ring-2 focus:ring-primary",
        match?.completed && "border-green-500/50",
        isTV1 && "bg-amber-50 border-amber-300 dark:bg-amber-950/30 dark:border-amber-700"
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
      {/*
       * Match number + TV# control. See DoubleEliminationBracket.MatchCard
       * for the rationale: when admins are interacting with the bracket,
       * the TV badge becomes a `<select>` so the assignment is saved on
       * change without opening the score dialog.
       */}
      <div className="text-xs text-muted-foreground mb-1 flex justify-between items-center">
        <span>M{bracketMatch.matchNumber}</span>
        {onTvNumberChange && match ? (
          <select
            value={match.tvNumber ?? ""}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => {
              e.stopPropagation();
              const v = e.target.value;
              onTvNumberChange(match, v === "" ? null : parseInt(v, 10));
            }}
            className="text-blue-500 bg-transparent border border-input rounded px-1 py-0.5 text-xs cursor-pointer focus:outline-none focus:ring-1 focus:ring-primary"
            aria-label={tc("tvNumber")}
          >
            <option value="">{tc("tvNumber")}</option>
            {TV_NUMBER_OPTIONS.map((n) => (
              <option key={n} value={n}>TV{n}</option>
            ))}
          </select>
        ) : (
          match?.tvNumber && <span className="text-blue-500">TV{match.tvNumber}</span>
        )}
      </div>
      {match?.cup && (
        <div className="mb-1 text-[11px] text-blue-600">
          {tf("cupLabel", { name: match.cup })}
        </div>
      )}

      {/* Player 1 row */}
      <div
        className={cn(
          "flex justify-between items-center py-1 px-2 rounded",
          isWinner1 && "bg-primary/10 font-bold border-l-2 border-l-primary"
        )}
      >
        <span className="flex items-center gap-1">
          {bracketMatch.player1Seed && (
            <span className="text-xs text-muted-foreground">
              [{bracketMatch.player1Seed}]
            </span>
          )}
          <span className={isPlayer1TBD ? "text-muted-foreground" : ""}>
            {isPlayer1TBD ? tc("tbd") : player1?.nickname || tc("tbd")}
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
          isWinner2 && "bg-primary/10 font-bold border-l-2 border-l-primary"
        )}
      >
        <span className="flex items-center gap-1">
          {bracketMatch.player2Seed !== undefined && bracketMatch.player2Seed > 0 && (
            <span className="text-xs text-muted-foreground">
              [{bracketMatch.player2Seed}]
            </span>
          )}
          <span className={isPlayer2TBD ? "text-muted-foreground" : ""}>
            {isPlayer2TBD ? tc("tbd") : player2?.nickname || tc("tbd")}
          </span>
        </span>
        <span className="font-mono">
          {match?.completed ? match.score2 : "-"}
        </span>
      </div>

      {/* Upper seed label for completed playoff_r2 matches */}
      {match?.completed && bracketMatch.advancesToUpperSeed && (
        <div className="mt-1 text-xs text-blue-500 font-medium">
          {tf("upperSeedLabel", { seed: bracketMatch.advancesToUpperSeed })}
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
  getTargetWins,
  onTvNumberChange,
}: PlayoffBracketProps) {
  const tf = useTranslations("finals");
  const getMatch = (matchNumber: number) =>
    playoffMatches.find((m) => m.matchNumber === matchNumber);

  const getBracketMatch = (matchNumber: number) =>
    playoffStructure.find((b) => b.matchNumber === matchNumber);

  const isTBD = (matchNumber: number, playerPosition: 1 | 2) => {
    const match = getMatch(matchNumber);
    if (!match) return true;
    const bracketMatch = getBracketMatch(matchNumber);

    if (playerPosition === 1) {
      /* Player1 is TBD only when both seeds are explicitly assigned AND the
       * two player IDs are identical (placeholder match before real setup).
       * BYE seeds (player1Seed only, e.g. R2) are never TBD — the player is
       * already determined at bracket creation time. */
      if (
        bracketMatch?.player1Seed != null &&
        bracketMatch?.player2Seed != null
      ) {
        return !match.completed && match.player1Id === match.player2Id;
      }
      return false;
    }

    /* Player2 is TBD when player2Seed is null (R1 winner not yet known,
     * e.g. R2 matches before R1 completes). Once the R1 winner is routed
     * (player2Id is set and differs from player1Id), it is no longer TBD. */
    if (bracketMatch?.player2Seed == null) {
      return !match.completed && match.player1Id === match.player2Id;
    }
    if (
      bracketMatch?.player1Seed != null &&
      bracketMatch?.player2Seed != null
    ) {
      return !match.completed && match.player1Id === match.player2Id;
    }
    return false;
  };

  const playoffR1 = playoffStructure.filter((b) => b.round === "playoff_r1");
  const playoffR2 = playoffStructure.filter((b) => b.round === "playoff_r2");

  const r1RoundName = roundNames["playoff_r1"] || tf("roundOne");
  const r2RoundName = roundNames["playoff_r2"] || tf("roundTwo");

  const courseR1 = playoffMatches.find((m) => m.round === "playoff_r1" && m.startingCourseNumber != null)?.startingCourseNumber ?? null;
  const courseR2 = playoffMatches.find((m) => m.round === "playoff_r2" && m.startingCourseNumber != null)?.startingCourseNumber ?? null;

  return (
    <Card className="border-blue-500/30">
      <CardHeader className="py-3">
        <CardTitle className="text-lg flex items-center gap-2">
          {tf("playoffTitle")}
          <Badge variant="outline" className="text-blue-500 border-blue-500">
            {tf("top24")}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground mb-4">
          {tf("playoffAdvanceDesc", { round: r2RoundName })}
        </p>
        <div className="flex flex-col gap-6 md:flex-row md:items-start md:gap-8 overflow-x-auto pb-4">
          {/* Playoff Round 1 */}
          <div className="space-y-2">
            <div>
              <h4 className="text-sm font-medium text-muted-foreground">{r1RoundName}</h4>
              {courseR1 != null && <p className="text-xs font-semibold text-blue-500">{tf("battleCourse", { number: courseR1 })}</p>}
            </div>
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
                  isPlayer1TBD={isTBD(b.matchNumber, 1)}
                  isPlayer2TBD={isTBD(b.matchNumber, 2)}
                  getTargetWins={getTargetWins}
                  onTvNumberChange={onTvNumberChange}
                />
              ))}
            </div>
          </div>

          {/* Playoff Round 2 */}
          <div className="space-y-2">
            <div>
              <h4 className="text-sm font-medium text-muted-foreground">{r2RoundName}</h4>
              {courseR2 != null && <p className="text-xs font-semibold text-blue-500">{tf("battleCourse", { number: courseR2 })}</p>}
            </div>
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
                  isPlayer1TBD={isTBD(b.matchNumber, 1)}
                  isPlayer2TBD={isTBD(b.matchNumber, 2)}
                  getTargetWins={getTargetWins}
                  onTvNumberChange={onTvNumberChange}
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
