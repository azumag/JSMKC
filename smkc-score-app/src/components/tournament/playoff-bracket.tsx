/**
 * Playoff Bracket Component
 *
 * Renders the pre-bracket playoff ("barrage") for Top 24 → Top 16 qualification.
 * The playoff is a single-elimination tournament for 12 players (barrage entrants)
 * who compete for 4 spots in the Upper Bracket barrage slots.
 *
 * Three-group structure (verified against the CDM 2025 official results workbook):
 * - Playoff Round 1: 4 matches (seeds 17v24, 20v21, 18v23, 19v22) — losers eliminated
 * - Playoff Round 2: 4 matches (BYE seeds 16/13/15/14 vs R1 winners) — winners advance to Upper Bracket
 *
 * In that three-group layout, the winner fills the Upper seed matching the BYE:
 * - M5 (BYE seed 16) winner → Upper seed 16
 * - M6 (BYE seed 13) winner → Upper seed 13
 * - M7 (BYE seed 15) winner → Upper seed 15
 * - M8 (BYE seed 14) winner → Upper seed 14
 *
 * Two groups receive a different structure from the API: the fixed paper map
 * routes the four winners to Upper seeds 16/12/14/10.
 */

'use client';

import { useLocale, useTranslations } from 'next-intl';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PlayerName } from '@/components/ui/player-name';
import { cn } from '@/lib/utils';
import { TV_NUMBER_OPTIONS } from '@/lib/constants';
import { resolveBracketWinnerFlags, type BracketWinnerResolver } from '@/lib/bracket-winner-flags';

import type { Player } from '@/lib/types';
import type { BracketMatch, SeededPlayer } from '@/types/bracket';

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
  slotOverrideAt?: string | Date | null;
  player1: Player;
  player2: Player;
}

/** Props for the PlayoffBracket component */
interface PlayoffBracketProps<TMatch extends BMMatch = BMMatch> {
  /** All playoff matches from the database (stage='playoff') */
  playoffMatches: TMatch[];
  /** Bracket structure defining match positions and connections */
  playoffStructure: BracketMatch[];
  /** Human-readable round names mapping */
  roundNames: Record<string, string>;
  /** Optional callback when a match card is clicked (for score entry) */
  onMatchClick?: (match: TMatch) => void;
  /** Seeded player data for displaying qualification labels */
  seededPlayers?: SeededPlayer[];
  /** Number of wins required to highlight a completed match winner */
  getTargetWins?: (match: TMatch | undefined, bracketMatch: BracketMatch) => number;
  /** Optional winner resolver for modes whose persisted winner is not score-order only. */
  getWinnerId?: BracketWinnerResolver<TMatch>;
  /** See `DoubleEliminationBracket.onTvNumberChange` — same select-to-save UX. */
  onTvNumberChange?: (match: TMatch, tvNumber: number | null) => void;
  /** See `DoubleEliminationBracket.slotEditMode` — playoff matches support the
   * same manual bracket placement adjustment (issue #3017 playoff support). */
  slotEditMode?: boolean;
  /** Fired when a slot is clicked in `slotEditMode`. `slot` is 1 or 2. */
  onSlotClick?: (match: TMatch, slot: 1 | 2) => void;
}

/**
 * Match card for playoff matches.
 * Same visual style as DoubleEliminationBracket.MatchCard but includes
 * advancesToUpperSeed label for playoff_r2 completed matches.
 */
function PlayoffMatchCard<TMatch extends BMMatch>({
  match,
  bracketMatch,
  seededPlayers,
  onClick,
  isPlayer1TBD,
  isPlayer2TBD,
  getTargetWins,
  getWinnerId,
  onTvNumberChange,
  slotEditMode,
  onSlotClick,
}: {
  match?: TMatch;
  bracketMatch: BracketMatch;
  seededPlayers?: SeededPlayer[];
  onClick?: () => void;
  isPlayer1TBD: boolean;
  isPlayer2TBD: boolean;
  getTargetWins?: (match: TMatch | undefined, bracketMatch: BracketMatch) => number;
  getWinnerId?: BracketWinnerResolver<TMatch>;
  onTvNumberChange?: (match: TMatch, tvNumber: number | null) => void;
  slotEditMode?: boolean;
  onSlotClick?: (match: TMatch, slot: 1 | 2) => void;
}) {
  const tc = useTranslations('common');
  const tf = useTranslations('finals');
  const locale = useLocale();
  const seededEntry1 = bracketMatch.player1Seed
    ? seededPlayers?.find((p) => p.seed === bracketMatch.player1Seed)
    : undefined;
  const seededEntry2 = bracketMatch.player2Seed
    ? seededPlayers?.find((p) => p.seed === bracketMatch.player2Seed)
    : undefined;
  /* The numeric seed (now the real overall qualifying seed 1-24, see
   * double-elimination.ts) is always preferred over the group+rank label. */
  const seedLabel1 = bracketMatch.player1Seed ?? seededEntry1?.qualificationRankLabel;
  const seedLabel2 = bracketMatch.player2Seed ?? seededEntry2?.qualificationRankLabel;

  const player1: Player | undefined = match?.player1 || seededEntry1?.player;
  const player2: Player | undefined = match?.player2 || seededEntry2?.player;

  const targetWins = getTargetWins?.(match, bracketMatch) ?? 3;
  const { isWinner1, isWinner2 } = resolveBracketWinnerFlags(match, bracketMatch, targetWins, getWinnerId);

  const isTV1 = match?.tvNumber === 1;

  return (
    <div
      className={cn(
        'border rounded-lg p-2 bg-card min-w-[180px] cursor-pointer hover:border-primary transition-colors focus:outline-none focus:ring-2 focus:ring-primary',
        match?.completed && 'border-green-500/50',
        isTV1 && 'bg-amber-50 border-amber-300 dark:bg-amber-950/30 dark:border-amber-700',
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
      <div className="text-xs text-muted-foreground mb-1 flex justify-between items-center gap-1">
        <span className="flex items-center gap-1">
          M{bracketMatch.matchNumber}
          {match?.slotOverrideAt && (
            <span
              className="inline-flex items-center rounded-sm px-1 py-0.5 text-[10px] font-semibold flag-draft"
              data-testid="slot-override-badge"
              title={tf('slotEditOverriddenBadge')}
            >
              {tf('slotEditOverriddenBadge')}
            </span>
          )}
        </span>
        {onTvNumberChange && match ? (
          <select
            value={match.tvNumber ?? ''}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => {
              e.stopPropagation();
              const v = e.target.value;
              onTvNumberChange(match, v === '' ? null : parseInt(v, 10));
            }}
            className="text-blue-500 bg-transparent border border-input rounded px-1 py-0.5 text-xs cursor-pointer focus:outline-none focus:ring-1 focus:ring-primary"
            aria-label={tc('tvNumber')}
          >
            <option value="">{tc('tvNumber')}</option>
            {TV_NUMBER_OPTIONS.map((n) => (
              <option key={n} value={n}>
                TV{n}
              </option>
            ))}
          </select>
        ) : (
          match?.tvNumber && <span className="text-blue-500">TV{match.tvNumber}</span>
        )}
      </div>
      {match?.cup && <div className="mb-1 text-[11px] text-blue-600">{tf('cupLabel', { name: match.cup })}</div>}

      {/* Player 1 row */}
      <div
        className={cn(
          'flex justify-between items-center py-1 px-2 rounded',
          isWinner1 && 'bg-primary/10 font-bold border-l-2 border-l-primary',
        )}
      >
        <span className="flex items-center gap-1">
          {bracketMatch.player1Seed && <span className="text-xs text-muted-foreground">[{seedLabel1}]</span>}
          <PlayerName
            player={player1}
            locale={locale}
            forceFallback={isPlayer1TBD}
            fallback={tc('tbd')}
            className="gap-1"
          />
          {slotEditMode && match && !match.completed && !isPlayer1TBD && (
            <button
              type="button"
              className="opacity-60 hover:opacity-100 text-xs leading-none"
              onClick={(e) => {
                e.stopPropagation();
                onSlotClick?.(match, 1);
              }}
              aria-label={tf('slotEditButtonLabel')}
              data-testid="slot-edit-button-1"
            >
              ✎
            </button>
          )}
        </span>
        <span className="font-mono">{match?.completed ? match.score1 : '-'}</span>
      </div>

      {/* Player 2 row */}
      <div
        className={cn(
          'flex justify-between items-center py-1 px-2 rounded',
          isWinner2 && 'bg-primary/10 font-bold border-l-2 border-l-primary',
        )}
      >
        <span className="flex items-center gap-1">
          {bracketMatch.player2Seed !== undefined && bracketMatch.player2Seed > 0 && (
            <span className="text-xs text-muted-foreground">[{seedLabel2}]</span>
          )}
          <PlayerName
            player={player2}
            locale={locale}
            forceFallback={isPlayer2TBD}
            fallback={tc('tbd')}
            className="gap-1"
          />
          {slotEditMode && match && !match.completed && !isPlayer2TBD && (
            <button
              type="button"
              className="opacity-60 hover:opacity-100 text-xs leading-none"
              onClick={(e) => {
                e.stopPropagation();
                onSlotClick?.(match, 2);
              }}
              aria-label={tf('slotEditButtonLabel')}
              data-testid="slot-edit-button-2"
            >
              ✎
            </button>
          )}
        </span>
        <span className="font-mono">{match?.completed ? match.score2 : '-'}</span>
      </div>

      {/* Upper seed label for completed playoff_r2 matches */}
      {match?.completed && bracketMatch.advancesToUpperSeed && (
        <div className="mt-1 text-xs text-blue-500 font-medium">
          {tf('upperSeedLabel', { seed: bracketMatch.advancesToUpperSeed })}
        </div>
      )}
    </div>
  );
}

/**
 * Playoff Bracket component.
 * Renders the 8-match pre-bracket playoff in two columns (R1 | R2).
 */
export function PlayoffBracket<TMatch extends BMMatch = BMMatch>({
  playoffMatches,
  playoffStructure,
  roundNames,
  onMatchClick,
  seededPlayers,
  getTargetWins,
  getWinnerId,
  onTvNumberChange,
  slotEditMode,
  onSlotClick,
}: PlayoffBracketProps<TMatch>) {
  const tf = useTranslations('finals');
  const getMatch = (matchNumber: number) => playoffMatches.find((m) => m.matchNumber === matchNumber);

  const getBracketMatch = (matchNumber: number) => playoffStructure.find((b) => b.matchNumber === matchNumber);

  const isTBD = (matchNumber: number, playerPosition: 1 | 2) => {
    const match = getMatch(matchNumber);
    if (!match) return true;
    const bracketMatch = getBracketMatch(matchNumber);

    if (playerPosition === 1) {
      /* Player1 is TBD only when both seeds are explicitly assigned AND the
       * two player IDs are identical (placeholder match before real setup).
       * BYE seeds (player1Seed only, e.g. R2) are never TBD — the player is
       * already determined at bracket creation time. */
      if (bracketMatch?.player1Seed != null && bracketMatch?.player2Seed != null) {
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
    if (bracketMatch?.player1Seed != null && bracketMatch?.player2Seed != null) {
      return !match.completed && match.player1Id === match.player2Id;
    }
    return false;
  };

  const playoffR1 = playoffStructure.filter((b) => b.round === 'playoff_r1');
  const playoffR2 = playoffStructure.filter((b) => b.round === 'playoff_r2');

  const r1RoundName = roundNames['playoff_r1'] || tf('roundOne');
  const r2RoundName = roundNames['playoff_r2'] || tf('roundTwo');

  const courseR1 =
    playoffMatches.find((m) => m.round === 'playoff_r1' && m.startingCourseNumber != null)?.startingCourseNumber ??
    null;
  const courseR2 =
    playoffMatches.find((m) => m.round === 'playoff_r2' && m.startingCourseNumber != null)?.startingCourseNumber ??
    null;

  return (
    <Card className="border-blue-500/30">
      <CardHeader className="py-3">
        <CardTitle className="text-lg flex items-center gap-2">
          {tf('playoffTitle')}
          <Badge variant="outline" className="text-blue-500 border-blue-500">
            {tf('top24')}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground mb-4">{tf('playoffAdvanceDesc', { round: r2RoundName })}</p>
        <div className="flex flex-col gap-6 md:flex-row md:items-start md:gap-8 overflow-x-auto pb-4">
          {/* Playoff Round 1 */}
          <div className="space-y-2">
            <div>
              <h4 className="text-sm font-medium text-muted-foreground">{r1RoundName}</h4>
              {courseR1 != null && (
                <p className="text-xs font-semibold text-blue-500">{tf('battleCourse', { number: courseR1 })}</p>
              )}
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
                  getWinnerId={getWinnerId}
                  onTvNumberChange={onTvNumberChange}
                  slotEditMode={slotEditMode}
                  onSlotClick={onSlotClick}
                />
              ))}
            </div>
          </div>

          {/* Playoff Round 2 */}
          <div className="space-y-2">
            <div>
              <h4 className="text-sm font-medium text-muted-foreground">{r2RoundName}</h4>
              {courseR2 != null && (
                <p className="text-xs font-semibold text-blue-500">{tf('battleCourse', { number: courseR2 })}</p>
              )}
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
                  getWinnerId={getWinnerId}
                  onTvNumberChange={onTvNumberChange}
                  slotEditMode={slotEditMode}
                  onSlotClick={onSlotClick}
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
