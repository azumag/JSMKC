/**
 * Double Elimination Bracket Component
 *
 * Renders a complete double-elimination tournament bracket for BM/MR/GP finals.
 * Supports both 8-player (17 matches) and 16-player (31 matches) brackets.
 * The bracket displays three sections:
 * 1. Winners Bracket (R1* -> QF -> SF -> Final) *R1 only in 16-player
 * 2. Losers Bracket (R1 -> R2 -> R3 -> R4* -> SF -> Final) *R4 only in 16-player
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
  winnerGoesTo?: number;
  loserGoesTo?: number;
  /** Position in the receiving match (1 or 2), used for winner routing */
  position?: 1 | 2;
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
  /** Number of wins required to highlight a completed match winner. */
  getTargetWins?: (match: BMMatch | undefined, bracketMatch: BracketMatch) => number;
  /**
   * Optional callback fired the moment an admin picks a TV# from the
   * inline dropdown on the match card. When provided, the static "TV{n}"
   * badge becomes an editable `<select>` so the assignment saves on change
   * without having to open the score-entry dialog (issue: select-to-save TV#).
   */
  onTvNumberChange?: (match: BMMatch, tvNumber: number | null) => void;
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
 * @param isTBD - Per-slot TBD flags: whether player1/player2 slots are undetermined
 */
function MatchCard({
  match,
  bracketMatch,
  seededPlayers,
  onClick,
  isTBD,
  getTargetWins,
  onTvNumberChange,
}: {
  match?: BMMatch;
  bracketMatch: BracketMatch;
  seededPlayers?: { seed: number; playerId: string; player: Player }[];
  onClick?: () => void;
  isTBD: { player1: boolean; player2: boolean };
  getTargetWins?: (match: BMMatch | undefined, bracketMatch: BracketMatch) => number;
  onTvNumberChange?: (match: BMMatch, tvNumber: number | null) => void;
}) {
  const tc = useTranslations("common");
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

  const targetWins = getTargetWins?.(match, bracketMatch) ?? 3;
  const isWinner1 = !!match?.completed && match.score1 >= targetWins && match.score1 > match.score2;
  const isWinner2 = !!match?.completed && match.score2 >= targetWins && match.score2 > match.score1;

  /*
   * Per-slot TBD display. First-round matches (seeded) always show real names.
   * For later rounds, show "TBD" only for the specific slot that hasn't been
   * filled yet by a routing event from a completed prior match (issue #669).
   */
  const isFirstRound =
    bracketMatch.round === "winners_r1" || bracketMatch.round === "winners_qf";
  const showTBD1 = !isFirstRound && isTBD.player1;
  const showTBD2 = !isFirstRound && isTBD.player2;

  /* TV1 gets a subtle amber highlight so broadcast crew can spot it instantly. */
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
      data-testid="bracket-match-card"
      aria-label={`Match ${bracketMatch.matchNumber}: ${showTBD1 ? tc('tbd') : player1?.nickname || tc('tbd')} vs ${showTBD2 ? tc('tbd') : player2?.nickname || tc('tbd')}${(showTBD1 || showTBD2) ? ' (Pending)' : ''}`}
      onKeyDown={(e) => {
        /* Support keyboard activation for accessibility */
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick?.();
        }
      }}
    >
      {/*
       * Match number and TV# control. When an `onTvNumberChange` handler is
       * provided AND the match row exists in the DB, render an inline select
       * so admins can assign/clear TV# without opening the score dialog. The
       * select stops click propagation to avoid triggering the card's score
       * dialog (which would discard the unsaved selection).
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

      {/* Player 1 row with optional seed number and score */}
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
          <span className={showTBD1 ? "text-muted-foreground" : ""}>
            {showTBD1 ? tc("tbd") : player1?.nickname || tc("tbd")}
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
          isWinner2 && "bg-primary/10 font-bold border-l-2 border-l-primary"
        )}
      >
        <span className="flex items-center gap-1">
          {bracketMatch.player2Seed && (
            <span className="text-xs text-muted-foreground">
              [{bracketMatch.player2Seed}]
            </span>
          )}
          <span className={showTBD2 ? "text-muted-foreground" : ""}>
            {showTBD2 ? tc("tbd") : player2?.nickname || tc("tbd")}
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
  const tf = useTranslations("finals");
  return (
    <Card
      className={cn(
        variant === "losers" && "border-orange-500/30",
        variant === "final" && "border-accent/70 bg-accent/5"
      )}
      aria-label={`${title} Bracket`}
    >
      <CardHeader className="py-3">
        <CardTitle className="text-lg flex items-center gap-2">
          {title}
          {/* Badge indicators for losers and final brackets */}
          {variant === "losers" && (
            <Badge variant="outline" className="text-orange-500 border-orange-500">
              {tf("losersBadge")}
            </Badge>
          )}
          {variant === "final" && (
            <Badge variant="flag-draft" className="">
              {tf("grandFinalBadge")}
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
  getTargetWins,
  onTvNumberChange,
}: DoubleEliminationBracketProps) {
  const tf = useTranslations("finals");
  /** Look up a match by its bracket match number */
  const getMatch = (matchNumber: number) =>
    matches.find((m) => m.matchNumber === matchNumber);

  /** Look up a bracket position by match number */
  const getBracketMatch = (matchNumber: number) =>
    bracketStructure.find((b) => b.matchNumber === matchNumber);

  /**
   * Reverse routing map: `${matchNumber}-${slot}` → source match number.
   *
   * When a source match completes, its winner/loser is routed into a specific
   * slot of a later match. A slot is "filled" only after its source match has
   * been completed. This mirrors the getNextMatchInfo server-side logic for
   * computing loser positions (issue #669).
   *
   * Loser position rules (same as getNextMatchInfo in double-elimination.ts):
   *   winners_r1:  (matchNumber - 1) % 2 + 1
   *   winners_qf:  position 2 for 16-player; (matchNumber - 1) % 2 + 1 for 8-player
   *   winners_sf:  always 1
   *   winners_final: always 2
   */
  const slotSourceMap = (() => {
    const map = new Map<string, number>();
    const is16Player = bracketStructure.length > 17;
    for (const bm of bracketStructure) {
      if (bm.winnerGoesTo) {
        const pos = bm.position ?? 1;
        map.set(`${bm.winnerGoesTo}-${pos}`, bm.matchNumber);
      }
      if (bm.loserGoesTo) {
        let loserPos: 1 | 2;
        if (bm.round === 'winners_r1') {
          loserPos = ((bm.matchNumber - 1) % 2 + 1) as 1 | 2;
        } else if (bm.round === 'winners_qf') {
          loserPos = is16Player ? 2 : ((bm.matchNumber - 1) % 2 + 1) as 1 | 2;
        } else if (bm.round === 'winners_sf') {
          loserPos = 1;
        } else if (bm.round === 'winners_final') {
          loserPos = 2;
        } else {
          continue;
        }
        map.set(`${bm.loserGoesTo}-${loserPos}`, bm.matchNumber);
      }
    }
    return map;
  })();

  /**
   * Per-slot TBD detection. A slot is TBD when no completed source match
   * has routed a real player into it yet. Returns per-slot flags so the
   * bracket can show "Player vs TBD" when only one slot has been filled,
   * rather than hiding both names (issue #669).
   */
  const isTBD = (matchNumber: number): { player1: boolean; player2: boolean } => {
    const match = getMatch(matchNumber);
    if (!match) return { player1: true, player2: true };
    const bracket = getBracketMatch(matchNumber);
    /* First-round seeded matches always have real players */
    if (bracket?.round === "winners_qf" || bracket?.round === "winners_r1") {
      return { player1: false, player2: false };
    }
    if (match.completed) return { player1: false, player2: false };

    const isSlotTBD = (slot: 1 | 2): boolean => {
      /* Seeded slots (playoff_r2 BYE seeds) are always filled */
      if (slot === 1 && bracket?.player1Seed != null) return false;
      if (slot === 2 && bracket?.player2Seed != null) return false;
      const sourceMatchNumber = slotSourceMap.get(`${matchNumber}-${slot}`);
      if (sourceMatchNumber == null) return true;
      return !getMatch(sourceMatchNumber)?.completed;
    };

    return { player1: isSlotTBD(1), player2: isSlotTBD(2) };
  };

  /* Group bracket positions by round for organized display */
  const winnersR1 = bracketStructure.filter((b) => b.round === "winners_r1");
  const winnersQF = bracketStructure.filter((b) => b.round === "winners_qf");
  const winnersSF = bracketStructure.filter((b) => b.round === "winners_sf");
  const winnersFinal = bracketStructure.filter(
    (b) => b.round === "winners_final"
  );

  const losersR1 = bracketStructure.filter((b) => b.round === "losers_r1");
  const losersR2 = bracketStructure.filter((b) => b.round === "losers_r2");
  const losersR3 = bracketStructure.filter((b) => b.round === "losers_r3");
  const losersR4 = bracketStructure.filter((b) => b.round === "losers_r4");
  const losersSF = bracketStructure.filter((b) => b.round === "losers_sf");
  const losersFinal = bracketStructure.filter((b) => b.round === "losers_final");

  const grandFinal = bracketStructure.filter((b) => b.round === "grand_final");
  const grandFinalReset = bracketStructure.filter(
    (b) => b.round === "grand_final_reset"
  );

  /* Detect bracket size: 16-player has winners_r1, 8-player doesn't */
  const is16Player = winnersR1.length > 0;

  return (
    <div className="space-y-6" role="region" aria-live="polite" aria-atomic="false">
      {/* Winners Bracket - Players with no losses */}
      <BracketSection title={tf("winnersSection")}>
        {/* overflow-x-auto stays on at every breakpoint: 16-player brackets have
         * five round columns (R1 → QF → SF → Final + gaps) that routinely exceed
         * the container width on desktop. Without horizontal scrolling here the
         * rightmost matches were breaking out of the page pane (issue #424). */}
        <div className="flex flex-col gap-6 md:flex-row md:items-start md:gap-8 overflow-x-auto pb-4">
          {/* Round 1 - Only in 16-player brackets */}
          {is16Player && (
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-muted-foreground">
                {tf("roundOne")}
              </h4>
              <div className="flex flex-col gap-2">
                {winnersR1.map((b) => (
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
                    getTargetWins={getTargetWins}
                    onTvNumberChange={onTvNumberChange}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Quarter Finals */}
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-muted-foreground">
              {tf("quarterFinals")}
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
                  getTargetWins={getTargetWins}
                  onTvNumberChange={onTvNumberChange}
                />
              ))}
            </div>
          </div>

          {/* Semi Finals - Winners of QF matches */}
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-muted-foreground">
              {tf("semiFinals")}
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
                  getTargetWins={getTargetWins}
                  onTvNumberChange={onTvNumberChange}
                />
              ))}
            </div>
          </div>

          {/* Winners Final - Winner proceeds to Grand Final undefeated */}
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-muted-foreground">{tf("bracketFinalRound")}</h4>
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
                  getTargetWins={getTargetWins}
                  onTvNumberChange={onTvNumberChange}
                />
              ))}
            </div>
          </div>
        </div>
      </BracketSection>

      {/* Losers Bracket - Players with one loss get a second chance */}
      <BracketSection title={tf("losersSection")} variant="losers">
        {/* See Winners Bracket above: horizontal scrolling must stay enabled on
         * desktop so wide 16-player losers brackets (up to 6 round columns) can
         * scroll instead of overflowing the containing pane (issue #424). */}
        <div className="flex flex-col gap-6 md:flex-row md:items-start md:gap-8 overflow-x-auto pb-4">
          {/* Losers Round 1 - First matchups of eliminated players */}
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-muted-foreground">
              {tf("roundOne")}
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
                  getTargetWins={getTargetWins}
                  onTvNumberChange={onTvNumberChange}
                />
              ))}
            </div>
          </div>

          {/* Losers Round 2 */}
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-muted-foreground">
              {tf("roundTwo")}
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
                  getTargetWins={getTargetWins}
                  onTvNumberChange={onTvNumberChange}
                />
              ))}
            </div>
          </div>

          {/* Losers Round 3 */}
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-muted-foreground">
              {tf("roundThree")}
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
                  getTargetWins={getTargetWins}
                  onTvNumberChange={onTvNumberChange}
                />
              ))}
            </div>
          </div>

          {/* Losers Round 4 - Only in 16-player brackets */}
          {losersR4.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-muted-foreground">
                {tf("roundFour")}
              </h4>
              <div className="flex flex-col gap-2">
                {losersR4.map((b) => (
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
                    getTargetWins={getTargetWins}
                    onTvNumberChange={onTvNumberChange}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Losers Semi Final */}
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-muted-foreground">
              {tf("semiFinals")}
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
                  getTargetWins={getTargetWins}
                  onTvNumberChange={onTvNumberChange}
                />
              ))}
            </div>
          </div>

          {/* Losers Final - Winner advances to Grand Final */}
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-muted-foreground">{tf("bracketFinalRound")}</h4>
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
                  getTargetWins={getTargetWins}
                  onTvNumberChange={onTvNumberChange}
                />
              ))}
            </div>
          </div>
        </div>
      </BracketSection>

      {/* Grand Final - Winners champion vs Losers champion */}
      <BracketSection title={tf("grandFinalSection")} variant="final">
        {/* Kept consistent with Winners/Losers sections for predictable layout
         * behaviour across all bracket sections (issue #424). */}
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:gap-8 overflow-x-auto pb-4">
          {/* Grand Final match */}
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-muted-foreground">
              {tf("grandFinalMatch")}
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
                getTargetWins={getTargetWins}
                onTvNumberChange={onTvNumberChange}
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
              {tf("resetMatchLabel")}
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
                getTargetWins={getTargetWins}
                onTvNumberChange={onTvNumberChange}
              />
            ))}
          </div>
        </div>
      </BracketSection>
    </div>
  );
}

export default DoubleEliminationBracket;
