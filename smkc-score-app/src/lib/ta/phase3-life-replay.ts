/**
 * Reconstructs each player's remaining Phase 3 (life-based elimination) life
 * total after every round from the durable Phase 3 timeline (round results,
 * life resets, resolved sudden-death sub-rounds, and absolute manual life
 * adjustments). TTEntry.lives
 * only tracks the CURRENT total, so the round-history UI needs this replay to
 * show "remaining life at round N" for rounds that are no longer the latest
 * one.
 *
 * This mirrors processPhase3Result's ordering (finals-phase-manager.ts):
 * bottom-half loses the round's configured lifeLoss (default 1; TA battle
 * royale admins may set a round to cost more, see TTPhaseRound.lifeLoss) ->
 * apply the server-confirmed eliminatedIds (already capped by the elimination
 * limit, so it is trusted rather than recomputed) -> apply a lives reset if
 * the round crossed a threshold. Reusable for both live (in-progress) and
 * archived tournament rounds, which is why it takes plain data shapes
 * instead of Prisma row types.
 *
 * Bottom-half membership is decided by course time EXCEPT when the round
 * required a life-loss sudden-death tiebreak (an exact time tie straddling
 * the safe/unsafe boundary): finals-phase-manager.ts's submitSuddenDeathResults
 * resolves that with `orderResultsWithSuddenDeathChain`, but only ever writes
 * the outcome back onto the parent TTPhaseRound's `eliminatedIds`/`livesReset`
 * — the tied `results.timeMs` values themselves are never rewritten (see the
 * comment on `sortedResults` in processPhase3Result). So replaying from
 * `results` alone would put the wrong tied player in the bottom half. Reusing
 * the same `orderResultsWithSuddenDeathChain` here (instead of re-deriving a
 * tiebreak order) keeps this replay's boundary decision identical to the
 * live one for any round whose resolved sudden-death sub-rounds are supplied.
 */

import type { Phase3Rules } from './battle-royale';
import { orderResultsWithSuddenDeathChain } from './sudden-death-order';

export type Phase3LifeRules = Pick<Phase3Rules, 'initialLives' | 'lifeResetThresholds'>;

export interface Phase3RoundResultLike {
  playerId: string;
  timeMs: number;
}

export interface Phase3SuddenDeathRoundLike {
  sequence: number;
  results: readonly Phase3RoundResultLike[] | null;
  resolved?: boolean | null;
}

export interface Phase3RoundLike {
  id?: string;
  roundNumber: number;
  results: readonly Phase3RoundResultLike[];
  eliminatedIds?: readonly string[] | null;
  livesReset?: boolean | null;
  /**
   * Resolved sudden-death sub-rounds for this base round, oldest first, if
   * available. Live (in-progress tournament) reads always include them;
   * archived tournaments do not persist sudden-death sub-rounds today, so
   * this is omitted there and boundary ties on archived rounds fall back to
   * raw-time order (a known, pre-existing limitation of archived history,
   * not a regression from this replay).
   */
  suddenDeathRounds?: readonly Phase3SuddenDeathRoundLike[] | null;
  /**
   * Lives this round's bottom half loses. Defaults to 1 (both modes); TA
   * battle royale admins may configure a specific round to cost more (see
   * TTPhaseRound.lifeLoss / startPhaseRound in finals-phase-manager.ts).
   * Falls back to 1 when absent (rounds recorded before this column existed).
   */
  lifeLoss?: number | null;
  submittedAt?: string | Date | null;
  createdAt?: string | Date | null;
}

export interface Phase3LifeAdjustmentLike {
  id: string;
  playerId: string;
  oldLives: number;
  newLives: number;
  entryVersion: number;
  afterRoundId?: string | null;
  afterRoundNumber?: number | null;
  createdAt: string | Date;
}

export interface Phase3LifeReplay {
  /** Each player's life total after the last replayed round. */
  livesByPlayer: Map<string, number>;
  eliminated: Set<string>;
  /** roundNumber -> playerId -> life total immediately after that round. */
  roundLivesByPlayer: Map<number, Map<string, number>>;
  /** roundNumber -> playerId -> true if that round's outcome cost them a life (elimination or not). */
  lifeLostByPlayer: Map<number, Set<string>>;
}

/**
 * Orders a round's results the same way processPhase3Result does: by raw
 * time, unless one or more resolved sudden-death sub-rounds exist for it, in
 * which case their outcome overrides tied boundary pairs (see module doc).
 * Degrades to a plain time sort when no sudden-death data is supplied —
 * `orderResultsWithSuddenDeathChain` falls back to `a.timeMs - b.timeMs` for
 * any pair it has no shared sudden-death race for, so this is safe to call
 * unconditionally.
 */
function orderRoundResults(round: Phase3RoundLike): Phase3RoundResultLike[] {
  const resolvedSuddenDeathResults = [...(round.suddenDeathRounds ?? [])]
    .filter((sd) => sd.resolved === true && Array.isArray(sd.results) && sd.results.length > 0)
    .sort((a, b) => a.sequence - b.sequence)
    .map((sd) => sd.results as Phase3RoundResultLike[]);
  return orderResultsWithSuddenDeathChain([...round.results], resolvedSuddenDeathResults);
}

export function replayPhase3Lives(
  rounds: readonly Phase3RoundLike[],
  playerIds: Iterable<string>,
  rules: Phase3LifeRules,
  adjustments: readonly Phase3LifeAdjustmentLike[] = [],
): Phase3LifeReplay {
  const livesByPlayer = new Map<string, number>([...playerIds].map((playerId) => [playerId, rules.initialLives]));
  const eliminated = new Set<string>();
  const roundLivesByPlayer = new Map<number, Map<string, number>>();
  const lifeLostByPlayer = new Map<number, Set<string>>();

  type TimelineEvent =
    { kind: 'round'; value: Phase3RoundLike } | { kind: 'adjustment'; value: Phase3LifeAdjustmentLike };

  const eventTime = (event: TimelineEvent): number => {
    const value = event.kind === 'round' ? (event.value.submittedAt ?? event.value.createdAt) : event.value.createdAt;
    if (!value) return 0;
    const timestamp = value instanceof Date ? value.getTime() : Date.parse(value);
    return Number.isFinite(timestamp) ? timestamp : 0;
  };

  const timeline: TimelineEvent[] = [
    ...rounds.map((value): TimelineEvent => ({ kind: 'round', value })),
    ...adjustments.map((value): TimelineEvent => ({ kind: 'adjustment', value })),
  ];
  timeline.sort((a, b) => {
    const timeDifference = eventTime(a) - eventTime(b);
    if (timeDifference !== 0) return timeDifference;

    if (a.kind === 'round' && b.kind === 'round') {
      return a.value.roundNumber - b.value.roundNumber;
    }
    if (a.kind === 'adjustment' && b.kind === 'adjustment') {
      if (a.value.playerId === b.value.playerId && a.value.entryVersion !== b.value.entryVersion) {
        return a.value.entryVersion - b.value.entryVersion;
      }
      return a.value.id.localeCompare(b.value.id);
    }

    if (a.kind === 'round' && b.kind === 'adjustment') {
      const adjustmentIsAfterRound =
        (b.value.afterRoundId != null && a.value.id != null && b.value.afterRoundId === a.value.id) ||
        (b.value.afterRoundId == null && (b.value.afterRoundNumber ?? 0) >= a.value.roundNumber);
      return adjustmentIsAfterRound ? -1 : 1;
    }
    if (a.kind === 'adjustment' && b.kind === 'round') {
      const adjustmentIsAfterRound =
        (a.value.afterRoundId != null && b.value.id != null && a.value.afterRoundId === b.value.id) ||
        (a.value.afterRoundId == null && (a.value.afterRoundNumber ?? 0) >= b.value.roundNumber);
      return adjustmentIsAfterRound ? 1 : -1;
    }
    return 0;
  });

  for (const event of timeline) {
    if (event.kind === 'adjustment') {
      // set_lives is accepted only for an active player and stores an
      // absolute target. Reasserting that invariant makes replay idempotent:
      // retries never add a delta, and removing an unrelated round cannot
      // silently leave the player at 0/eliminated.
      if (livesByPlayer.has(event.value.playerId)) {
        livesByPlayer.set(event.value.playerId, event.value.newLives);
        eliminated.delete(event.value.playerId);
      }
      continue;
    }

    const round = event.value;
    const ordered = orderRoundResults(round);
    const bottomHalf = ordered.slice(Math.ceil(ordered.length / 2));
    const lostThisRound = new Set<string>();
    const lifeLoss = typeof round.lifeLoss === 'number' ? round.lifeLoss : 1;
    for (const result of bottomHalf) {
      // A player already eliminated in an earlier round can still appear in
      // this round's results (e.g. a stale/duplicate submission); they have
      // no life left to lose, so skip rather than let Math.max(0, ...) mask it.
      if (eliminated.has(result.playerId)) continue;
      livesByPlayer.set(
        result.playerId,
        Math.max(0, (livesByPlayer.get(result.playerId) ?? rules.initialLives) - lifeLoss),
      );
      lostThisRound.add(result.playerId);
    }

    for (const playerId of round.eliminatedIds ?? []) {
      eliminated.add(playerId);
      livesByPlayer.set(playerId, 0);
      lostThisRound.add(playerId);
    }

    if (round.livesReset === true) {
      for (const playerId of livesByPlayer.keys()) {
        if (!eliminated.has(playerId)) livesByPlayer.set(playerId, rules.initialLives);
      }
    }

    roundLivesByPlayer.set(round.roundNumber, new Map(livesByPlayer));
    lifeLostByPlayer.set(round.roundNumber, lostThisRound);
  }

  return { livesByPlayer, eliminated, roundLivesByPlayer, lifeLostByPlayer };
}

/**
 * Convenience wrapper for API responses: returns new round objects whose
 * results carry `livesAfter` (remaining life immediately after this round)
 * and `lifeLost` (whether this round's outcome cost the player a life),
 * leaving the input untouched. `lifeLost` lets the round-history UI show the
 * "-1 life" / remaining-life indicator from server-computed truth instead of
 * re-deriving bottom-half membership client-side (which cannot see resolved
 * sudden-death sub-rounds and would get boundary ties wrong).
 */
export function attachLivesAfterToRounds<
  TResult extends Phase3RoundResultLike,
  TRound extends Phase3RoundLike & { results: readonly TResult[] },
>(
  rounds: readonly TRound[],
  playerIds: Iterable<string>,
  rules: Phase3LifeRules,
  adjustments: readonly Phase3LifeAdjustmentLike[] = [],
): Array<TRound & { results: Array<TResult & { livesAfter: number | null; lifeLost: boolean }> }> {
  const { roundLivesByPlayer, lifeLostByPlayer } = replayPhase3Lives(rounds, playerIds, rules, adjustments);
  return rounds.map((round) => ({
    ...round,
    results: round.results.map(
      (result) =>
        ({
          ...result,
          livesAfter: roundLivesByPlayer.get(round.roundNumber)?.get(result.playerId) ?? null,
          lifeLost: lifeLostByPlayer.get(round.roundNumber)?.has(result.playerId) ?? false,
          // The cast is required because TypeScript cannot verify that spreading a
          // generic TResult still satisfies TResult itself once new fields are added.
        }) as TResult & { livesAfter: number | null; lifeLost: boolean },
    ),
  }));
}
