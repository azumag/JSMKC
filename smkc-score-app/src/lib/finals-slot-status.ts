/**
 * Finals/playoff bracket slot confirmation status.
 *
 * A bracket slot (player1 or player2 of a given match) is "confirmed" once a
 * real player has been routed into it — either because the match is a seeded
 * first-round match, or because the upstream match that feeds this slot has
 * completed. Otherwise the slot is "TBD" (to be determined) and holds only a
 * placeholder player ID.
 *
 * This mirrors the client-side `isTBD` logic in
 * `components/tournament/double-elimination-bracket.tsx` (lines ~354-381) so
 * the manual slot-edit API (issue #3017) can reject edits to unconfirmed
 * slots using the exact same rules the bracket UI uses to render "TBD".
 */
import type { BracketMatch } from '@/types/bracket';

export interface SlotStatusMatch {
  matchNumber: number;
  round?: string | null;
  completed: boolean;
  player1Id: string;
  player2Id: string;
}

export interface SlotStatusResult {
  /** true = slot 1 (player1) is still TBD */
  player1: boolean;
  /** true = slot 2 (player2) is still TBD */
  player2: boolean;
}

/** Rounds whose player1/player2 slots are always confirmed (initial seeded matches). */
const ALWAYS_CONFIRMED_ROUNDS = new Set(['winners_qf', 'winners_r1']);

/**
 * Builds a reverse lookup from `${receivingMatchNumber}-${slot}` to the
 * match number that routes into it via `winnerGoesTo`/`loserGoesTo`.
 */
function buildSlotSourceMap(bracketStructure: BracketMatch[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const bm of bracketStructure) {
    if (bm.winnerGoesTo) {
      const pos = bm.position ?? 1;
      map.set(`${bm.winnerGoesTo}-${pos}`, bm.matchNumber);
    }
    if (bm.loserGoesTo) {
      const loserPos = bm.loserPosition ?? 1;
      map.set(`${bm.loserGoesTo}-${loserPos}`, bm.matchNumber);
    }
  }
  return map;
}

/**
 * Returns the TBD status of both slots for a given match number.
 *
 * @param matchNumber - The match to check.
 * @param matches - All matches in the same tournament/stage (finals or playoff).
 * @param bracketStructure - The routing structure for that stage
 *   (`generateBracketStructure()` for finals, `generatePlayoffStructure()` for playoff).
 */
export function getFinalsSlotStatus(
  matchNumber: number,
  matches: SlotStatusMatch[],
  bracketStructure: BracketMatch[],
): SlotStatusResult {
  const match = matches.find((m) => m.matchNumber === matchNumber);
  if (!match) return { player1: true, player2: true };

  const bracket = bracketStructure.find((b) => b.matchNumber === matchNumber);
  if (bracket?.round && ALWAYS_CONFIRMED_ROUNDS.has(bracket.round)) {
    return { player1: false, player2: false };
  }
  if (match.completed) return { player1: false, player2: false };

  const slotSourceMap = buildSlotSourceMap(bracketStructure);

  const isSlotTBD = (slot: 1 | 2): boolean => {
    /* Seeded slots (e.g. playoff BYE seeds) are always filled. */
    if (slot === 1 && bracket?.player1Seed != null) return false;
    if (slot === 2 && bracket?.player2Seed != null) return false;

    const sourceMatchNumber = slotSourceMap.get(`${matchNumber}-${slot}`);
    if (sourceMatchNumber == null) {
      /* No structural routing source (e.g. grand_final_reset, populated by
       * special-case logic outside the generated structure). Fall back to
       * the placeholder heuristic: bracket creation initialises unfilled
       * slots to the same player ID for both players. */
      return !match.completed && match.player1Id === match.player2Id;
    }
    return !matches.find((m) => m.matchNumber === sourceMatchNumber)?.completed;
  };

  return { player1: isSlotTBD(1), player2: isSlotTBD(2) };
}

/** Convenience wrapper: is the given slot (1 or 2) of this match confirmed (not TBD)? */
export function isFinalsSlotConfirmed(
  matchNumber: number,
  slot: 1 | 2,
  matches: SlotStatusMatch[],
  bracketStructure: BracketMatch[],
): boolean {
  const status = getFinalsSlotStatus(matchNumber, matches, bracketStructure);
  return slot === 1 ? !status.player1 : !status.player2;
}
