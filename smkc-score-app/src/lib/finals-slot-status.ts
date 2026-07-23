/**
 * Finals/playoff bracket slot confirmation status.
 *
 * A bracket slot (player1 or player2 of a given match) is "confirmed" once a
 * real player has been routed into it — either because the match is a seeded
 * first-round match, or because the upstream match that feeds this slot has
 * completed. Otherwise the slot is "TBD" (to be determined) and has no
 * assigned player ID (or holds a legacy placeholder ID).
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
  player1Id: string | null;
  player2Id: string | null;
}

export interface SlotStatusResult {
  /** true = slot 1 (player1) is still TBD */
  player1: boolean;
  /** true = slot 2 (player2) is still TBD */
  player2: boolean;
}

/** API/archive representation for a bracket row. TBD slots deliberately expose
 * no participant, including for legacy rows that still persist a seed-1
 * placeholder. */
export type SerializedFinalsSlot<T extends SlotStatusMatch> = T & {
  player1Tbd: boolean;
  player2Tbd: boolean;
  player1Id: string | null;
  player2Id: string | null;
};

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
  const slotSourceMap = buildSlotSourceMap(bracketStructure);

  const isSlotTBD = (slot: 1 | 2): boolean => {
    const playerId = slot === 1 ? match.player1Id : match.player2Id;
    /* A persisted NULL is authoritative: no participant has been routed to
     * this slot yet. This is the post-#3036 representation. */
    if (playerId == null) return true;

    /* Seeded slots (e.g. playoff BYE seeds) are always filled. */
    if (slot === 1 && bracket?.player1Seed != null) return false;
    if (slot === 2 && bracket?.player2Seed != null) return false;

    const sourceMatchNumber = slotSourceMap.get(`${matchNumber}-${slot}`);
    if (sourceMatchNumber == null) {
      /* No structural routing source (e.g. grand_final_reset, populated by
       * special-case logic outside the generated structure). Equal non-null
       * IDs preserve TBD rendering for legacy seed-1 placeholder rows. */
      return !match.completed && match.player1Id === match.player2Id;
    }
    return !matches.find((m) => m.matchNumber === sourceMatchNumber)?.completed;
  };

  return { player1: isSlotTBD(1), player2: isSlotTBD(2) };
}

/** Normalize DB and archived match rows to the canonical NULL/TBD contract. */
export function serializeFinalsSlots<T extends SlotStatusMatch>(
  matches: T[],
  bracketStructure: BracketMatch[],
  statusMatches: SlotStatusMatch[] = matches,
): SerializedFinalsSlot<T>[] {
  return matches.map((match) => {
    const status = getFinalsSlotStatus(match.matchNumber, statusMatches, bracketStructure);
    return {
      ...match,
      player1Tbd: status.player1,
      player2Tbd: status.player2,
      ...(status.player1 ? { player1Id: null, player1: null } : {}),
      ...(status.player2 ? { player2Id: null, player2: null } : {}),
    };
  });
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
