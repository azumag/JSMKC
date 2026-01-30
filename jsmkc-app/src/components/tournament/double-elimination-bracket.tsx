/**
 * Double Elimination Bracket Component
 *
 * Renders a complete double-elimination tournament bracket for Battle Mode finals.
 * The bracket displays three sections:
 * 1. Winners Bracket (QF -> SF -> Final)
 * 2. Losers Bracket (R1 -> R2 -> R3 -> SF -> Final)
 * 3. Grand Final (Grand Final + optional Reset match)
 *
 * Each match is displayed as a clickable card showing:
 * - Match number and seed numbers
 * - Player nicknames with "TBD" for undetermined matchups
 * - Scores for completed matches
 * - Visual highlighting for winners (green background)
 *
 * Accessibility features:
 * - Keyboard navigation (Enter/Space to click)
 * - ARIA labels for screen readers
 * - Live region for bracket updates
 * - Proper role and tabIndex attributes
 */

"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/** Player data structure used throughout the bracket */
interface Player {
  id: string;
  name: string;
  nickname: string;
}

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
}

/** Props for the main DoubleEliminationBracket component */
interface DoubleEliminationBracketProps {
  /** All finals matches from the database */
  matches: BMMatch[];
  /** Bracket structure defining match positions and connections */
  bracketStructure: BracketMatch[];
  /** Human-readable round names mapping (e.g., "winners_qf" -> "Quarter Finals") */
  roundNames: Record<string, string>;
  /** Optional callback when a match card is clicked (for score entry) */
  onMatchClick?: (match: BMMatch) => void;
  /** Optional seeded player data for displaying seed numbers */
  seededPlayers?: { seed: number; playerId: string; player: Player }[];
}

/**
 * Individual match card within the bracket.
 * Displays two player rows with their nicknames, seed numbers, and scores.
 * Completed matches show a green border; winners have highlighted rows.
 *
 * @param match - Actual match data (may be undefined for unfilled bracket positions)
 * @param bracketMatch - Bracket structure definition for this position
 * @param seededPlayers - Seeded player data for seed number display
 * @param onClick - Click handler for score entry
 * @param isTBD - Whether this match has undetermined players
 */
function MatchCard({
  match,
  bracketMatch,
  seededPlayers,
  onClick,
  isTBD,
}: {
  match?: BMMatch;
  bracketMatch: BracketMatch;
  seededPlayers?: { seed: number; playerId: string; player: Player }[];
  onClick?: () => void;
  isTBD: boolean;
}) {
  /* Look up seeded players for displaying seed numbers in first-round matches */
  const seededPlayer1 = bracketMatch.player1Seed
    ? seededPlayers?.find((p) => p.seed === bracketMatch.player1Seed)?.player
    : undefined;
  const seededPlayer2 = bracketMatch.player2Seed
    ? seededPlayers?.find((p) => p.seed === bracketMatch.player2Seed)?.player
    : undefined;

  /* Use actual match players if available, fall back to seeded player data */
  const player1: Player | undefined = match?.player1 || seededPlayer1;
  const player2: Player | undefined = match?.player2 || seededPlayer2;

  /* Determine winners for visual highlighting (3 wins needed in BM finals) */
  const isWinner1 = match?.completed && match.score1 >= 3;
  const isWinner2 = match?.completed && match.score2 >= 3;

  /*
   * Determine if this match should show "TBD" for players.
   * First-round matches (winners_qf, losers_r1) always show actual players.
   * Later rounds show TBD until players are determined from previous results.
   */
  const isFirstRound =
    bracketMatch.round === "winners_qf" || bracketMatch.round === "losers_r1";
  const showTBD = !isFirstRound && isTBD;

  return (
    <div
      className={cn(
        "border rounded-lg p-2 bg-card min-w-[180px] cursor-pointer hover:border-primary transition-colors focus:outline-none focus:ring-2 focus:ring-primary",
        match?.completed && "border-green-500/50"
      )}
      onClick={onClick}
      role="button"
      tabIndex={0}
      aria-label={`Match ${bracketMatch.matchNumber}: ${player1?.nickname || 'TBD'} vs ${player2?.nickname || 'TBD'}${showTBD ? ' (Pending)' : ''}`}
      onKeyDown={(e) => {
        /* Support keyboard activation for accessibility */
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

      {/* Player 1 row with optional seed number and score */}
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
          <span className={showTBD ? "text-muted-foreground" : ""}>
            {showTBD ? "TBD" : player1?.nickname || "TBD"}
          </span>
        </span>
        <span className="font-mono">
          {match?.completed ? match.score1 : "-"}
        </span>
      </div>

      {/* Player 2 row with optional seed number and score */}
      <div
        className={cn(
          "flex justify-between items-center py-1 px-2 rounded",
          isWinner2 && "bg-green-500/20 font-bold"
        )}
      >
        <span className="flex items-center gap-1">
          {bracketMatch.player2Seed && (
            <span className="text-xs text-muted-foreground">
              [{bracketMatch.player2Seed}]
            </span>
          )}
          <span className={showTBD ? "text-muted-foreground" : ""}>
            {showTBD ? "TBD" : player2?.nickname || "TBD"}
          </span>
        </span>
        <span className="font-mono">
          {match?.completed ? match.score2 : "-"}
        </span>
      </div>
    </div>
  );
}

/**
 * Section wrapper for grouping bracket matches by type.
 * Applies visual theming based on the bracket variant:
 * - default: Standard border for winners bracket
 * - losers: Orange border accent for losers bracket
 * - final: Gold/yellow border accent for grand final
 *
 * @param title - Section heading text
 * @param children - Match cards to render inside the section
 * @param variant - Visual variant for theming
 */
function BracketSection({
  title,
  children,
  variant = "default",
}: {
  title: string;
  children: React.ReactNode;
  variant?: "default" | "losers" | "final";
}) {
  return (
    <Card
      className={cn(
        variant === "losers" && "border-orange-500/30",
        variant === "final" && "border-yellow-500/50"
      )}
      aria-label={`${title} Bracket`}
    >
      <CardHeader className="py-3">
        <CardTitle className="text-lg flex items-center gap-2">
          {title}
          {/* Badge indicators for losers and final brackets */}
          {variant === "losers" && (
            <Badge variant="outline" className="text-orange-500 border-orange-500">
              Losers
            </Badge>
          )}
          {variant === "final" && (
            <Badge variant="outline" className="text-yellow-500 border-yellow-500">
              Grand Final
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

/**
 * Main Double Elimination Bracket component.
 * Renders the complete bracket with winners, losers, and grand final sections.
 * Each section displays matches grouped by round in a horizontal layout
 * that scrolls on mobile and displays inline on desktop.
 *
 * The bracket uses aria-live="polite" to announce updates to screen readers
 * when match results change during real-time polling.
 */
export function DoubleEliminationBracket({
  matches,
  bracketStructure,
  onMatchClick,
  seededPlayers,
}: DoubleEliminationBracketProps) {
  /** Look up a match by its bracket match number */
  const getMatch = (matchNumber: number) =>
    matches.find((m) => m.matchNumber === matchNumber);

  /** Look up a bracket position by match number */
  const getBracketMatch = (matchNumber: number) =>
    bracketStructure.find((b) => b.matchNumber === matchNumber);

  /**
   * Determine if a match should display "TBD" for its players.
   * A match is TBD when:
   * - No match data exists for this position
   * - It's not a first-round match AND both player IDs are the same
   *   (indicating placeholder players that haven't been filled in yet)
   */
  const isTBD = (matchNumber: number) => {
    const match = getMatch(matchNumber);
    if (!match) return true;
    const bracket = getBracketMatch(matchNumber);
    /* First round matches always have real players from seeding */
    if (bracket?.round === "winners_qf") return false;
    /* Later rounds: check if both player IDs are the same (placeholder state) */
    return !match.completed && match.player1Id === match.player2Id;
  };

  /* Group bracket positions by round for organized display */
  const winnersQF = bracketStructure.filter((b) => b.round === "winners_qf");
  const winnersSF = bracketStructure.filter((b) => b.round === "winners_sf");
  const winnersFinal = bracketStructure.filter(
    (b) => b.round === "winners_final"
  );

  const losersR1 = bracketStructure.filter((b) => b.round === "losers_r1");
  const losersR2 = bracketStructure.filter((b) => b.round === "losers_r2");
  const losersR3 = bracketStructure.filter((b) => b.round === "losers_r3");
  const losersSF = bracketStructure.filter((b) => b.round === "losers_sf");
  const losersFinal = bracketStructure.filter((b) => b.round === "losers_final");

  const grandFinal = bracketStructure.filter((b) => b.round === "grand_final");
  const grandFinalReset = bracketStructure.filter(
    (b) => b.round === "grand_final_reset"
  );

  return (
    <div className="space-y-6" role="region" aria-live="polite" aria-atomic="false">
      {/* Winners Bracket - Players with no losses */}
      <BracketSection title="Winners Bracket">
        <div className="flex flex-col gap-6 md:flex-row md:items-start md:gap-8 overflow-x-auto pb-4 md:overflow-visible md:pb-0">
          {/* Quarter Finals - First round of 8-player bracket */}
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-muted-foreground">
              Quarter Finals
            </h4>
            <div className="flex flex-col gap-2">
              {winnersQF.map((b) => (
                <MatchCard
                  key={b.matchNumber}
                  match={getMatch(b.matchNumber)}
                  bracketMatch={b}
                  seededPlayers={seededPlayers}
                  onClick={() => {
                    const match = getMatch(b.matchNumber);
                    if (match && onMatchClick) onMatchClick(match);
                  }}
                  isTBD={isTBD(b.matchNumber)}
                />
              ))}
            </div>
          </div>

          {/* Semi Finals - Winners of QF matches */}
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-muted-foreground">
              Semi Finals
            </h4>
            <div className="flex flex-col gap-2 justify-center h-full">
              {winnersSF.map((b) => (
                <MatchCard
                  key={b.matchNumber}
                  match={getMatch(b.matchNumber)}
                  bracketMatch={b}
                  seededPlayers={seededPlayers}
                  onClick={() => {
                    const match = getMatch(b.matchNumber);
                    if (match && onMatchClick) onMatchClick(match);
                  }}
                  isTBD={isTBD(b.matchNumber)}
                />
              ))}
            </div>
          </div>

          {/* Winners Final - Winner proceeds to Grand Final undefeated */}
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-muted-foreground">Final</h4>
            <div className="flex flex-col gap-2 justify-center h-full">
              {winnersFinal.map((b) => (
                <MatchCard
                  key={b.matchNumber}
                  match={getMatch(b.matchNumber)}
                  bracketMatch={b}
                  seededPlayers={seededPlayers}
                  onClick={() => {
                    const match = getMatch(b.matchNumber);
                    if (match && onMatchClick) onMatchClick(match);
                  }}
                  isTBD={isTBD(b.matchNumber)}
                />
              ))}
            </div>
          </div>
        </div>
      </BracketSection>

      {/* Losers Bracket - Players with one loss get a second chance */}
      <BracketSection title="Losers Bracket" variant="losers">
        <div className="flex flex-col gap-6 md:flex-row md:items-start md:gap-8 overflow-x-auto pb-4 md:overflow-visible md:pb-0">
          {/* Losers Round 1 - First matchups of eliminated players */}
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-muted-foreground">
              Round 1
            </h4>
            <div className="flex flex-col gap-2">
              {losersR1.map((b) => (
                <MatchCard
                  key={b.matchNumber}
                  match={getMatch(b.matchNumber)}
                  bracketMatch={b}
                  seededPlayers={seededPlayers}
                  onClick={() => {
                    const match = getMatch(b.matchNumber);
                    if (match && onMatchClick) onMatchClick(match);
                  }}
                  isTBD={isTBD(b.matchNumber)}
                />
              ))}
            </div>
          </div>

          {/* Losers Round 2 */}
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-muted-foreground">
              Round 2
            </h4>
            <div className="flex flex-col gap-2">
              {losersR2.map((b) => (
                <MatchCard
                  key={b.matchNumber}
                  match={getMatch(b.matchNumber)}
                  bracketMatch={b}
                  seededPlayers={seededPlayers}
                  onClick={() => {
                    const match = getMatch(b.matchNumber);
                    if (match && onMatchClick) onMatchClick(match);
                  }}
                  isTBD={isTBD(b.matchNumber)}
                />
              ))}
            </div>
          </div>

          {/* Losers Round 3 */}
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-muted-foreground">
              Round 3
            </h4>
            <div className="flex flex-col gap-2">
              {losersR3.map((b) => (
                <MatchCard
                  key={b.matchNumber}
                  match={getMatch(b.matchNumber)}
                  bracketMatch={b}
                  seededPlayers={seededPlayers}
                  onClick={() => {
                    const match = getMatch(b.matchNumber);
                    if (match && onMatchClick) onMatchClick(match);
                  }}
                  isTBD={isTBD(b.matchNumber)}
                />
              ))}
            </div>
          </div>

          {/* Losers Semi Final */}
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-muted-foreground">
              Semi Final
            </h4>
            <div className="flex flex-col gap-2">
              {losersSF.map((b) => (
                <MatchCard
                  key={b.matchNumber}
                  match={getMatch(b.matchNumber)}
                  bracketMatch={b}
                  seededPlayers={seededPlayers}
                  onClick={() => {
                    const match = getMatch(b.matchNumber);
                    if (match && onMatchClick) onMatchClick(match);
                  }}
                  isTBD={isTBD(b.matchNumber)}
                />
              ))}
            </div>
          </div>

          {/* Losers Final - Winner advances to Grand Final */}
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-muted-foreground">Final</h4>
            <div className="flex flex-col gap-2">
              {losersFinal.map((b) => (
                <MatchCard
                  key={b.matchNumber}
                  match={getMatch(b.matchNumber)}
                  bracketMatch={b}
                  seededPlayers={seededPlayers}
                  onClick={() => {
                    const match = getMatch(b.matchNumber);
                    if (match && onMatchClick) onMatchClick(match);
                  }}
                  isTBD={isTBD(b.matchNumber)}
                />
              ))}
            </div>
          </div>
        </div>
      </BracketSection>

      {/* Grand Final - Winners champion vs Losers champion */}
      <BracketSection title="Grand Final" variant="final">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:gap-8 overflow-x-auto pb-4 md:overflow-visible md:pb-0">
          {/* Grand Final match */}
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-muted-foreground">
              Grand Final
            </h4>
            {grandFinal.map((b) => (
              <MatchCard
                key={b.matchNumber}
                match={getMatch(b.matchNumber)}
                bracketMatch={b}
                seededPlayers={seededPlayers}
                onClick={() => {
                  const match = getMatch(b.matchNumber);
                  if (match && onMatchClick) onMatchClick(match);
                }}
                isTBD={isTBD(b.matchNumber)}
              />
            ))}
          </div>

          {/*
           * Reset match - only played if the losers bracket champion wins
           * the Grand Final, since the winners bracket champion hasn't lost yet.
           * In true double elimination, both players must lose to be eliminated.
           */}
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-muted-foreground">
              Reset (if needed)
            </h4>
            {grandFinalReset.map((b) => (
              <MatchCard
                key={b.matchNumber}
                match={getMatch(b.matchNumber)}
                bracketMatch={b}
                seededPlayers={seededPlayers}
                onClick={() => {
                  const match = getMatch(b.matchNumber);
                  if (match && onMatchClick) onMatchClick(match);
                }}
                isTBD={isTBD(b.matchNumber)}
              />
            ))}
          </div>
        </div>
      </BracketSection>
    </div>
  );
}

export default DoubleEliminationBracket;
