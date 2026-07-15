/**
 * TT Finals — life "replay" (pure function).
 *
 * The CDM 2025 "TT Finals" sheet is a single 24-row life ledger spanning up to
 * 40 round blocks. Standings, the per-round name ordering and the running
 * "Left" (lives remaining) column are all Excel formulas; the workbook only
 * accepts three human inputs per round block: the per-player Gain, the
 * per-player Time, and the per-player Lost flag (see docs/cdm-export-design.md
 * §3.5 and cdm-constants.ts). To produce those inputs we must reconstruct, for
 * every sheet round, who ran, who lost a life, and how many bonus lives were
 * granted — exactly as the TA finals engine would have.
 *
 * The authoritative rules live in src/lib/ta/finals-phase-manager.ts; this
 * module derives its behaviour from that code (cited inline), NOT from prose:
 *
 * - Phase 1 (PHASE_CONFIG.phase1, lines 47-54) and Phase 2 (lines 55-62):
 *   `hasLives:false`, entries stored with `lives:0`. processEliminationPhaseResult
 *   (lines 580-651) eliminates exactly the single slowest runner each round
 *   until `survivorsNeeded` (4) remain. In the CDM ledger these players are
 *   modelled as holding ONE life: the eliminated runner loses it (Lost=1,
 *   ending Left=0), every survivor keeps Left=1. No Gain is ever granted.
 *
 * - Phase 3 (PHASE_CONFIG.phase3, lines 63-72): `initialLives:3`,
 *   `lifeResetThresholds:[8,4,2]`. processPhase3Result (lines 669-830): the
 *   bottom half of the round's runners — `sorted.slice(Math.ceil(n/2))` by
 *   time ascending (lines 698-705) — EACH lose one life (lines 718-742,
 *   `lives = max(0, lives-1)` is written for every bottom-half player, not only
 *   the eliminated ones). A life reset to 3 happens AFTER the round when an
 *   elimination occurred and the surviving count hits 8/4/2 (lines 786-802).
 *
 * The CDM ledger detail that makes Gain computable: round r+1's input "Left"
 * formula equals round r's display "Left", and a row's display Left equals
 * `inputLeft + Gain - Lost`. So we simulate `leftCarried` forward and emit Gain
 * only where the engine injects bonus lives:
 *   - Phase-3 ENTRY round: every phase-3 entrant is brought from its carried
 *     Left (always 1 — see below) up to the initial 3 lives BEFORE that round's
 *     loss is applied. Gain = initialLives - leftCarried (= 2). The round's own
 *     loss then lands on top (display Left = 3 - Lost). This reproduces the
 *     verified template fact `DD3..DD18 = 2` at round 9 of CDM 2025.
 *   - Life-RESET round: the reset forces every survivor back to 3 AFTER the
 *     round's loss, so display Left must equal 3. With display = inputLeft +
 *     Gain - Lost we need Gain = initialLives - inputLeft + Lost for survivors.
 *
 * Universe: the 24 round-1 rows are qualification ranks 1..24 (the sheet's
 * B3 = OFFSET('TT Qualifications'!CN2,0,0,'Main Hub'!O3) spills the qualifying
 * order). Every finalist therefore owns a row from round 1; players who have
 * not entered a phase yet simply sit out (Time=0) with Left=1, which is why the
 * phase-3 entrants all carry Left=1 into round 9.
 *
 * This module performs NO database access and is exhaustively unit-tested.
 */

import type { CdmTournamentData, CdmTTEntry, CdmTTPhaseRound } from '../types';
import { compareQualificationRankOrder, type EntryWithTotal } from '@/lib/ta/rank-calculation';
import { type CourseResult } from '@/lib/ta/finals-phase-manager';
import { orderResultsWithSuddenDeathChain } from '@/lib/ta/sudden-death-order';
import { createLogger } from '@/lib/logger';
import { TT_FINALS_MAX_ROUNDS, TT_FINALS_MAX_FINALISTS } from '../cdm-constants';

/** Mirrors PHASE_CONFIG.phase3.initialLives (finals-phase-manager.ts:70). */
const PHASE3_INITIAL_LIVES = 3;
// Note: the reset thresholds [8,4,2] (PHASE_CONFIG.phase3.lifeResetThresholds)
// are intentionally NOT recomputed here. processPhase3Result already collapses
// "did a reset happen this round" into the persisted round.livesReset flag
// (finals-phase-manager.ts:786-803), so detectLivesReset reads that flag rather
// than re-deriving the survivor count — which would also require replaying the
// elimination cap. Reading the stored flag is both simpler and authoritative.

/** Phase order in which the engine plays rounds, lowest first. */
const PHASE_SEQUENCE = ['phase1', 'phase2', 'phase3'] as const;
type FinalsPhase = (typeof PHASE_SEQUENCE)[number];

/**
 * One reconstructed sheet round. Field meanings map 1:1 onto the cells the
 * caller writes (buildTTFinalsWrites): `gains`→Gain column, `participants`→Time
 * column, `lostLife`→display Lost column, the *RowOrder arrays→which physical
 * row each player occupies in the input / display blocks.
 */
export interface TTFinalsReplayRound {
  /** Course abbreviation for the round (e.g. "MC1"). */
  course: string;
  /**
   * Runners of this round and their time in ms (null when a runner has no
   * recorded time yet). Players NOT in this map sat the round out (Time=0).
   */
  participants: Map<string, number | null>;
  /** Players who lost a life this round (Lost=1 on their display row). */
  lostLife: Set<string>;
  /** Bonus lives granted this round per player (phase-3 entry / reset top-up). */
  gains: Map<string, number>;
  /** Player ids in input-block row order (top → bottom). */
  inputRowOrder: string[];
  /** Player ids in display-block row order (top → bottom). */
  displayRowOrder: string[];
  /** Lives each player holds AFTER this round (the display "Left" value). */
  livesAfter: Map<string, number>;
}

/** A phase round paired with the optional sudden-death rounds that follow it. */
interface OrderedRound {
  phase: FinalsPhase;
  round: CdmTTPhaseRound;
}

interface ResultRow {
  playerId: string;
  timeMs: number | null;
}

/**
 * Reconstruct every sheet round from the tournament's TA-finals data.
 *
 * Returns the rounds in sheet order (phase1 by roundNumber, then phase2, then
 * phase3). At most TT_FINALS_MAX_ROUNDS rounds are returned; any excess is
 * dropped with a warning so the writer never addresses a non-existent block.
 */
export function replayTTFinals(data: CdmTournamentData): TTFinalsReplayRound[] {
  const logger = createLogger('cdm-tt-finals-replay');

  // ---- 1. Build the 24-player universe from the qualification ranking. ----
  // The sheet's round-1 rows are qualification ranks 1..24 in finishing order.
  // We honour the persisted `rank` when present (it is the canonical TT final
  // rank) and fall back to the documented comparator (qualificationPoints DESC,
  // totalTime ASC) for any ties / missing ranks so the ordering is total.
  const qualEntries = data.ttEntries.filter((e) => e.stage === 'qualification');
  const universe = orderQualificationUniverse(qualEntries).slice(0, TT_FINALS_MAX_FINALISTS);
  const universeIds = universe.map((e) => e.playerId);
  const universeSet = new Set(universeIds);

  // ---- 2. Order the phase rounds the way the engine played them. ----
  const orderedRounds = orderPhaseRounds(data.ttPhaseRounds);

  // ---- 3. Carry life ledger forward, one round at a time. ----
  // Every universe row starts round 1 with one life (template C3..C26 = 1).
  const livesCarried = new Map<string, number>(universeIds.map((id) => [id, 1]));
  // Tracks which players have already been topped-up to phase-3 initial lives,
  // so the +2 entry grant is emitted exactly once (on a player's first phase-3
  // round) regardless of how the rounds are interleaved.
  const phase3Entered = new Set<string>();

  const rounds: TTFinalsReplayRound[] = [];
  for (const { phase, round } of orderedRounds) {
    if (rounds.length >= TT_FINALS_MAX_ROUNDS) {
      logger.warn(
        `TT Finals exceeds ${TT_FINALS_MAX_ROUNDS} sheet rounds; dropping ${phase} round ${round.roundNumber} and beyond`,
      );
      break;
    }

    const results = parseRoundResults(round.results, {
      logger,
      phase,
      roundNumber: round.roundNumber,
    });
    // Participants restricted to the known universe: a result for an unknown id
    // cannot be placed on the sheet, so it is ignored (and warned) rather than
    // silently shifting row positions.
    const participants = new Map<string, number | null>();
    for (const row of results) {
      if (!universeSet.has(row.playerId)) {
        logger.warn(
          `TT Finals ${phase} round ${round.roundNumber}: result for player ${row.playerId} is outside the 24-player universe; skipping`,
        );
        continue;
      }
      participants.set(row.playerId, row.timeMs);
    }

    // --- Gains: phase-3 entry top-up (applied BEFORE this round's loss). ---
    const gains = new Map<string, number>();
    if (phase === 'phase3') {
      for (const id of participants.keys()) {
        if (!phase3Entered.has(id)) {
          phase3Entered.add(id);
          const carried = livesCarried.get(id) ?? 1;
          const grant = PHASE3_INITIAL_LIVES - carried;
          if (grant !== 0) gains.set(id, grant);
          // Effective lives going into the loss step is the topped-up value.
          livesCarried.set(id, carried + grant);
        }
      }
    }

    // --- This round's fully resolved order (raw time, overridden by any
    // sudden-death chain tied to it) — feeds ONLY the phase-3 bottom-half
    // determination below, never row/display order (see assignRowOrders for
    // why: the template's own formulas recompute row order from raw time
    // independently and cannot see this). Phase 1/2 use eliminatedIds instead
    // (computeLostLife's early branch), so skip the computation there — it
    // would otherwise be built and discarded on every phase1/phase2 round
    // (issue #2784).
    const resolvedOrder =
      phase === 'phase3'
        ? buildResolvedOrder(results, round.suddenDeathRounds, {
            logger,
            phase,
            roundNumber: round.roundNumber,
          })
        : new Map<string, number>();

    // --- Who lost a life this round. ---
    const lostLife = computeLostLife(phase, round, participants, results, resolvedOrder);

    // --- Detect a life reset for this round (phase-3 only, after the loss). ---
    const isResetRound = phase === 'phase3' && detectLivesReset(round);

    // --- Apply per-row life arithmetic to obtain display "Left". ---
    const livesAfter = new Map<string, number>();
    for (const id of universeIds) {
      const before = livesCarried.get(id) ?? 0;
      const lost = lostLife.has(id) ? 1 : 0;
      let after = before - lost;
      // The engine resets ONLY surviving phase-3 participants
      // (processPhase3Result, finals-phase-manager.ts:793-802 —
      // `updateMany where stage:"phase3", eliminated:false`). A universe
      // bystander that has never entered phase 3 keeps its single carried life
      // and must NOT be lifted to 3 (doing so would corrupt its display Left and
      // every subsequent round's SORTBY-ending-lives input order). We mirror the
      // engine's predicate via phase3Entered (membership == "has a phase-3
      // entry") and `after > 0` (== not eliminated this round).
      if (isResetRound && phase3Entered.has(id) && after > 0) {
        // Surviving players are reset to the initial lives; encode the delta as
        // additional Gain so display Left (= before + Gain - lost) equals 3.
        const extra = PHASE3_INITIAL_LIVES - after;
        if (extra !== 0) {
          gains.set(id, (gains.get(id) ?? 0) + extra);
        }
        after = PHASE3_INITIAL_LIVES;
      }
      livesAfter.set(id, after);
      livesCarried.set(id, after);
    }

    rounds.push({
      course: round.course,
      participants,
      lostLife,
      gains,
      inputRowOrder: [],
      displayRowOrder: [],
      livesAfter,
    });
  }

  // ---- 4. Compute input/display row orders across the whole sequence. ----
  // Round 1 input order is the qualification universe; subsequent input orders
  // depend on the PREVIOUS round's display order + ending lives, so this must
  // run after every round's livesAfter is known.
  assignRowOrders(rounds, universeIds);

  return rounds;
}

/**
 * Order qualification entries into the 24-row universe. Uses the persisted
 * `rank` (1-based, canonical) as the primary key; entries lacking a rank are
 * appended in comparator order. Within a rank tie the comparator
 * (qualificationPoints DESC, totalTime ASC, id ASC) breaks it deterministically.
 */
function orderQualificationUniverse(entries: CdmTTEntry[]): CdmTTEntry[] {
  return [...entries].sort((a, b) => {
    const ra = rankOf(a);
    const rb = rankOf(b);
    if (ra !== rb) return ra - rb;
    return compareQualificationRankOrder(toComparable(a), toComparable(b));
  });
}

/** Entries without a usable rank sort after ranked ones (sentinel = +∞). */
function rankOf(entry: CdmTTEntry): number {
  const raw = (entry as { rank?: number | null }).rank;
  return typeof raw === 'number' && raw > 0 ? raw : Number.POSITIVE_INFINITY;
}

/**
 * Adapt a CdmTTEntry to the EntryWithTotal shape compareQualificationRankOrder
 * expects. The comparator only inspects qualificationPoints, totalTime and id
 * (rank-calculation.ts:57-67); the remaining fields are required by the type but
 * unused here, so they carry neutral placeholders. We use the player id as the
 * comparable id so the comparator's final id.localeCompare tie-break is stable
 * across entries (it matches the qualification ranking's deterministic order).
 */
function toComparable(entry: CdmTTEntry): EntryWithTotal {
  return {
    id: entry.playerId,
    totalTime: entry.totalTime ?? null,
    qualificationPoints: entry.qualificationPoints ?? 0,
    lives: 0,
    eliminated: false,
    stage: entry.stage,
    courseScores: {},
  };
}

/**
 * Order phase rounds the way the engine plays them: phase1 by roundNumber, then
 * phase2, then phase3. Unknown phase labels are dropped with a warning.
 */
function orderPhaseRounds(phaseRounds: CdmTTPhaseRound[]): OrderedRound[] {
  const logger = createLogger('cdm-tt-finals-replay');
  const ordered: OrderedRound[] = [];
  for (const phase of PHASE_SEQUENCE) {
    const inPhase = phaseRounds.filter((r) => r.phase === phase).sort((a, b) => a.roundNumber - b.roundNumber);
    for (const round of inPhase) {
      ordered.push({ phase, round });
    }
  }
  const known = new Set<string>(PHASE_SEQUENCE);
  for (const r of phaseRounds) {
    if (!known.has(r.phase)) {
      logger.warn(`TT Finals: ignoring round with unknown phase "${r.phase}"`);
    }
  }
  return ordered;
}

/**
 * Determine which players lost a life this round.
 *
 * Phase 1/2: only the eliminated runner loses its single life. We trust the
 * persisted `eliminatedIds` (the engine's record of the slowest, tie-resolved
 * loser); when absent (e.g. the survivor floor was already reached and no one
 * was eliminated) nobody loses a life.
 *
 * Phase 3: the entire bottom half of the round's runners loses a life,
 * replicating processPhase3Result's `sorted.slice(Math.ceil(n/2))` selection —
 * by the round's fully resolved order (raw time, overridden by any
 * sudden-death chain tied to the round; see buildResolvedOrder), exactly as
 * processPhase3Result itself sorts via comparePhase3CourseResults(resolvedOrder).
 * `eliminatedIds` is the engine's capped *elimination* set, which is a subset
 * of the life-losers, so it cannot be used here.
 */
function computeLostLife(
  phase: FinalsPhase,
  round: CdmTTPhaseRound,
  participants: Map<string, number | null>,
  results: ResultRow[],
  resolvedOrder: Map<string, number>,
): Set<string> {
  if (phase === 'phase1' || phase === 'phase2') {
    const eliminated = parseStringArray(round.eliminatedIds);
    return new Set(eliminated.filter((id) => participants.has(id)));
  }

  // Phase 3: bottom half by the round's resolved order. Only runners present
  // in the universe participate in the ranking.
  const runners = results.filter((r) => participants.has(r.playerId));
  if (runners.length < 2) {
    // With 0 or 1 runner there is no bottom half to penalise (mirrors the
    // `activePlayers.length <= 1` early-out in processPhase3Result:688).
    return new Set();
  }
  const sorted = [...runners].sort(
    (a, b) => (resolvedOrder.get(a.playerId) ?? 0) - (resolvedOrder.get(b.playerId) ?? 0),
  );
  const halfwayPoint = Math.ceil(sorted.length / 2);
  return new Set(sorted.slice(halfwayPoint).map((r) => r.playerId));
}

/** Treat a missing time as the slowest possible value for ordering. */
function timeForSort(timeMs: number | null): number {
  return timeMs ?? Number.POSITIVE_INFINITY;
}

/**
 * Whether this phase-3 round triggered a life reset. We prefer the persisted
 * `livesReset` flag (the engine's own record). It is the single source of
 * truth: processPhase3Result only sets it when an elimination actually pushed
 * the field onto a [8,4,2] threshold (lines 786-802), the exact condition we
 * must reproduce.
 */
function detectLivesReset(round: CdmTTPhaseRound): boolean {
  return round.livesReset === true;
}

/**
 * Fill in inputRowOrder / displayRowOrder for every round.
 *
 * - Round 1 input order = qualification universe (rank 1..24).
 * - Round r≥2 input order = SORTBY(previous display names, previous ending
 *   lives DESC) with Excel's STABLE semantics: equal lives keep the previous
 *   display order. We reproduce this by a stable sort keyed on the negated
 *   ending-lives, applied to the previous round's display order.
 * - Display order (every round) = SORTBY(input names, this round's Time ASC),
 *   stable. Non-runners have Time=0, which sorts them to the top ahead of any
 *   positive recorded time, preserving input order among themselves.
 */
function assignRowOrders(rounds: TTFinalsReplayRound[], universeIds: string[]): void {
  for (let i = 0; i < rounds.length; i++) {
    const round = rounds[i];

    // --- input order ---
    let inputOrder: string[];
    if (i === 0) {
      inputOrder = [...universeIds];
    } else {
      const prev = rounds[i - 1];
      // Stable sort of the previous display order by ending lives DESC.
      inputOrder = stableSort(prev.displayRowOrder, (id) => {
        const lives = prev.livesAfter.get(id) ?? 0;
        return -lives; // higher lives first
      });
    }
    round.inputRowOrder = inputOrder;

    // --- display order: stable sort of input order by this round's Time ASC ---
    // Deliberately raw time, NOT resolvedOrder: the template's own row/name
    // formula (sheet4.xml H3/U3 etc: SORTBY(names, rawTimeColumn)) recomputes
    // this independently from the raw Time cell every time the workbook
    // opens — it has no way to read this array's order. Sorting rows here by
    // anything other than raw time would desync this replay's bookkeeping
    // (lostLife → row position, round r+1's inputRowOrder) from what Excel
    // will actually display, which is strictly worse than not fixing the
    // display order at all (verified: for an exact-time tie it flips which
    // *name* Excel renders on the row the sudden-death-aware Lost flag was
    // written to). The sudden-death outcome cannot move a player between
    // rows here; only computeLostLife's set membership uses it. See
    // docs/cdm-export-design.md §3.5's accepted limitation: final-block
    // order among tied-lives eliminated players is an approximation by
    // template design, and the app (not the sheet) is authoritative for
    // confirmed placement.
    round.displayRowOrder = stableSort(inputOrder, (id) => {
      const t = round.participants.get(id);
      // Non-runner (absent from participants) → Time 0 (sheet writes 0).
      // A runner with a null time is encoded as 0 on the sheet too, so it sorts
      // with the non-runners; this matches the template (E/R/.. = 0 rows first).
      return t ?? 0;
    });
  }
}

/**
 * Stable sort returning a new array. JS Array.prototype.sort is spec-stable
 * (ES2019+), but we implement an explicit index-tiebreak to make the stability
 * contract obvious and immune to engine differences in test environments.
 */
function stableSort<T>(items: T[], key: (item: T) => number): T[] {
  return items
    .map((item, index) => ({ item, index, k: key(item) }))
    .sort((a, b) => (a.k !== b.k ? a.k - b.k : a.index - b.index))
    .map((wrapped) => wrapped.item);
}

/** Parse a TTPhaseRound.results JSON value into typed rows (defensive). */
function parseRoundResults(
  raw: unknown,
  context?: {
    logger: ReturnType<typeof createLogger>;
    phase: FinalsPhase;
    roundNumber: number;
  },
): ResultRow[] {
  if (!Array.isArray(raw)) return [];
  const rows: ResultRow[] = [];
  for (const item of raw) {
    if (item && typeof item === 'object' && 'playerId' in item) {
      const playerId = (item as { playerId: unknown }).playerId;
      const timeMs = (item as { timeMs?: unknown }).timeMs;
      if (typeof playerId === 'string') {
        const usableTime = typeof timeMs === 'number' && Number.isFinite(timeMs) && timeMs >= 0 ? timeMs : null;
        if (timeMs !== undefined && timeMs !== null && usableTime === null) {
          context?.logger.warn(
            `TT Finals ${context.phase} round ${context.roundNumber}: invalid timeMs for player ${playerId}; treating as missing time`,
          );
        }
        rows.push({
          playerId,
          timeMs: usableTime,
        });
      }
    }
  }
  return rows;
}

/** Parse a JSON value expected to be a string[] (e.g. eliminatedIds). */
function parseStringArray(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((x): x is string => typeof x === 'string');
}

/** Parse a resolved TTPhaseSuddenDeathRound.results JSON value (defensive). */
function parseSuddenDeathResults(
  raw: unknown,
  context?: { logger: ReturnType<typeof createLogger>; phase: FinalsPhase; roundNumber: number; sequence: number },
): CourseResult[] {
  if (!Array.isArray(raw)) return [];
  const rows: CourseResult[] = [];
  for (const item of raw) {
    const playerId =
      item && typeof item === 'object' && 'playerId' in item ? (item as { playerId: unknown }).playerId : undefined;
    const timeMs =
      item && typeof item === 'object' && 'timeMs' in item ? (item as { timeMs: unknown }).timeMs : undefined;
    if (typeof playerId === 'string' && typeof timeMs === 'number' && Number.isFinite(timeMs)) {
      rows.push({ playerId, timeMs });
    } else {
      context?.logger.warn(
        `TT Finals ${context.phase} round ${context.roundNumber}: malformed sudden-death result at sequence ${context.sequence}; ignoring entry`,
      );
    }
  }
  return rows;
}

/**
 * Build this round's fully resolved finishing order: the base results
 * reordered by any sudden-death chain tied to the round (life-loss/bronze/
 * revival ties, issue #2773), oldest sequence first — matching exactly how
 * submitSuddenDeathResults (finals-phase-manager.ts) itself orders a base
 * round once its tiebreak(s) resolve. Degrades to plain ascending-time order
 * when the round has no sudden-death rounds (the common case), since
 * orderResultsWithSuddenDeathChain falls back to raw time for any pair that
 * never raced together.
 *
 * Used ONLY for the phase-3 bottom-half (lostLife) determination — NOT for
 * row/display order (assignRowOrders), because the template's own row/name
 * formula (sheet4.xml: SORTBY(names, rawTimeColumn)) recomputes row order
 * from the raw Time cell independently every time the workbook opens; it has
 * no way to read this resolved order, so using it for display order would
 * only desync this replay's bookkeeping from what Excel actually renders
 * (verified empirically: for an exact-time tie it flips which name lands on
 * the row the Lost flag was written to — worse than the original bug).
 * Fixes the real, ID-keyed part of the bug reported via manual CDM replica
 * testing: a sudden death can move a player across the elimination boundary,
 * not just reorder them within an already-fixed bottom half. The reported
 * *display* order for tied-lives eliminated players remains an accepted
 * template limitation (docs/cdm-export-design.md §3.5).
 */
function buildResolvedOrder(
  results: ResultRow[],
  suddenDeathRounds: { sequence: number; results: unknown }[] | undefined,
  context: { logger: ReturnType<typeof createLogger>; phase: FinalsPhase; roundNumber: number },
): Map<string, number> {
  const chain = [...(suddenDeathRounds ?? [])]
    .sort((a, b) => a.sequence - b.sequence)
    .map((sd) => parseSuddenDeathResults(sd.results, { ...context, sequence: sd.sequence }))
    .filter((sdResults) => sdResults.length > 0);
  const baseResults: CourseResult[] = results.map((r) => ({
    playerId: r.playerId,
    timeMs: timeForSort(r.timeMs),
  }));
  const ordered = orderResultsWithSuddenDeathChain(baseResults, chain);
  return new Map(ordered.map((r, i) => [r.playerId, i]));
}
