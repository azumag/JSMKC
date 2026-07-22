/**
 * CDM BM/MR/GP Finals fill map — pure function `CdmTournamentData -> CdmCellWrite[]`.
 *
 * The Finals sheet (BM/MR/GP share one layout) is a formula-driven 24-player
 * double-elimination bracket. The workbook computes every name and advancement
 * itself from a small set of human inputs:
 *   - B3:B26  — the seed list (nickname per B-position).
 *   - typed seed cells (offset +1 in each match block) — a B-position number.
 *   - score cells (offset +4) — the two players' scores for that match.
 * Everything else (name XLOOKUPs, "Winner of N" advancement, final standings) is
 * a formula in the template, but the export writes the current match-record
 * names into used bracket slots so downloaded workbooks show the correct
 * tournament table even before or without an Excel recalculation. See
 * docs/cdm-export-design.md §3.4 and finals-slot-semantics.ts.
 *
 * The DB stores no seed column, so we reconstruct each slot's B-position by
 * matching the app finals/playoff match records (by matchNumber) against the
 * canonical structures from double-elimination.ts (imported, never modified):
 *   - generateBracketStructure(16, groupCount) supplies the group-specific
 *     Upper slots. Three groups use contiguous direct seeds 1-12; two groups
 *     use the fixed gapped paper-layout slots.
 *   - generatePlayoffStructure(12, groupCount) supplies the matching barrage
 *     slots. Displayed seeds remain 13-24 in either layout.
 *   - generateBracketStructure(8) → 8-player upper seeds map directly to B 1..8.
 *
 * Bracket size (from which rounds exist) selects the mode:
 *   - faithful (24): any stage="playoff" match present. Only typed seed cells +
 *     score cells written; advancement formulas preserved.
 *   - playoff-only (24, partial): playoff matches but no winners_r1 yet. Same as
 *     faithful for the playoff blocks; B-positions 13..24 from the playoff, 1..12
 *     from a qualification-rank fallback.
 *   - degraded 16 (no playoff, has winners_r1): the Top16 "Winner of B2,k" slots
 *     and the Barrage blocks have no data, so their formulas are value-overwritten
 *     / stripped; the rest stays formula-driven.
 *   - degraded 8 (winners_qf is the first round): the template's 24-player
 *     advancement cannot represent an 8-player bracket, so every used slot's NAME
 *     and SCORE is value-overwritten and all unused regions are stripped. A
 *     warning is logged because Excel will no longer recompute this bracket.
 *   - no matches: every input cell is cleared so the template renders a blank
 *     bracket (its formulas already handle empty inputs).
 */

import { createLogger } from '@/lib/logger';
import { generateBracketStructure, generatePlayoffStructure } from '@/lib/double-elimination';
import { TWO_GROUP_DIRECT_UPPER_SEEDS } from '@/lib/finals-group-selection';
import type { BracketMatch } from '@/types/bracket';
import {
  FINALS_BRACKET_SLOTS,
  FINALS_BLOCK_SEED_OFFSET,
  FINALS_BLOCK_NAME_OFFSET,
  FINALS_BLOCK_SCORE_OFFSET,
  FINALS_DIRECT_UPPER_SEEDS,
  FINALS_SEED_LIST_COLUMN,
  FINALS_SEED_LIST_FIRST_ROW,
  FINALS_SEED_LIST_MAX_ROWS,
  CDM_FINALS_SHEETS,
  toColumnLetters,
} from '../cdm-constants';
import type {
  CdmCellWrite,
  CdmMatch,
  CdmModeQualification,
  CdmPlayer,
  CdmSheetName,
  CdmTournamentData,
  CdmVersusMode,
} from '../types';
import { getSlotSemantics, type FinalsSlotSemantics } from './finals-slot-semantics';

const logger = createLogger('cdm-export');

const FULL_SEED_COUNT = 24;
const SIXTEEN = 16;
const EIGHT = 8;

/**
 * Accumulates one-op-per-cell writes for a single sheet (last write wins per ref,
 * insertion order preserved). Mirrors SheetWriteBuilder from sheet-player-order.ts
 * but adds the overwrite/strip ops the degraded bracket modes need (that builder
 * is shared and must not be modified). The clear-then-write collapse keeps the
 * emitted array free of duplicate refs, which the test helpers assert.
 */
class FinalsWriteBuilder {
  private readonly ops = new Map<string, CdmCellWrite>();

  constructor(private readonly sheet: CdmSheetName) {}

  /** Set a numeric value on a non-formula cell (typed seed / score). */
  setNumber(ref: string, value: number): void {
    this.ops.set(ref, { sheet: this.sheet, ref, op: 'number', value });
  }

  /** Set an inline string on a non-formula cell. */
  setString(ref: string, value: string): void {
    this.ops.set(ref, { sheet: this.sheet, ref, op: 'inlineString', value });
  }

  /** Drop the cached value but keep the cell, style and any formula. */
  clear(ref: string): void {
    this.ops.set(ref, { sheet: this.sheet, ref, op: 'clearValue' });
  }

  /** Replace value AND remove any formula (degraded modes only). */
  overwriteNumber(ref: string, value: number): void {
    this.ops.set(ref, { sheet: this.sheet, ref, op: 'overwriteNumber', value });
  }

  /** Replace value AND remove any formula with an inline string (degraded only). */
  overwriteString(ref: string, value: string): void {
    this.ops.set(ref, { sheet: this.sheet, ref, op: 'overwriteString', value });
  }

  /** Remove value and formula but keep the styled cell shell. */
  strip(ref: string): void {
    this.ops.set(ref, { sheet: this.sheet, ref, op: 'strip' });
  }

  /** Set a number or, when null/undefined, clear the cell. */
  setNumberOrClear(ref: string, value: number | null | undefined): void {
    if (value == null) this.clear(ref);
    else this.setNumber(ref, value);
  }

  build(): CdmCellWrite[] {
    return [...this.ops.values()];
  }
}

/* ------------------------------------------------------------------ *
 * Geometry helpers — translate (round, matchIndex, slotIndex) into the
 * A1 cell references of the seed / name / score cells of that slot.
 * ------------------------------------------------------------------ */

interface SlotCells {
  seedRef: string;
  nameRef: string;
  scoreRef: string;
}

/** A1 refs for the seed/name/score cells of a slot, or null if no such slot. */
function slotCells(round: string, matchIndex: number, slotIndex: number): SlotCells | null {
  const geometries = FINALS_BRACKET_SLOTS[round];
  if (!geometries) return null;
  const geometry = geometries[matchIndex];
  if (!geometry) return null;
  const row = geometry.row + slotIndex; // slot1 = row, slot2 = row + 1
  return {
    seedRef: `${toColumnLetters(geometry.blockStart + FINALS_BLOCK_SEED_OFFSET)}${row}`,
    nameRef: `${toColumnLetters(geometry.blockStart + FINALS_BLOCK_NAME_OFFSET)}${row}`,
    scoreRef: `${toColumnLetters(geometry.blockStart + FINALS_BLOCK_SCORE_OFFSET)}${row}`,
  };
}

/** True if the template stores a typed seed value (not a formula) in this slot. */
function isTypedSeedSlot(round: string, matchIndex: number, slotIndex: number): boolean {
  return getSlotSemantics(round, matchIndex, slotIndex)?.kind === 'seed';
}

/**
 * Empty an unused slot per the per-cell rule (design §3.4.1): formula cells are
 * stripped (value + formula removed, styled shell kept) and typed input cells are
 * cleared (value dropped, cell/style kept). The seed cell is a typed value only
 * for "seed" slots; the name cell is always a formula; the score cell is always a
 * typed input.
 */
function emptyUnusedSlot(builder: FinalsWriteBuilder, round: string, matchIndex: number, slotIndex: number): void {
  const cells = slotCells(round, matchIndex, slotIndex);
  if (!cells) return;
  if (isTypedSeedSlot(round, matchIndex, slotIndex)) builder.clear(cells.seedRef);
  else builder.strip(cells.seedRef); // reverse-lookup formula in formula slots.
  builder.strip(cells.nameRef); // name is always an XLOOKUP formula.
  builder.clear(cells.scoreRef); // score is always a typed input.
}

/* ------------------------------------------------------------------ *
 * App match access — group a mode's matches by round, in app match order.
 * ------------------------------------------------------------------ */

/** Matches of one round, sorted by matchNumber so index 0,1,… is app order. */
function matchesByRound(matches: CdmMatch[]): Map<string, CdmMatch[]> {
  const byRound = new Map<string, CdmMatch[]>();
  for (const match of matches) {
    const round = normalizeRound(match);
    if (!round) continue;
    const list = byRound.get(round) ?? [];
    list.push(match);
    byRound.set(round, list);
  }
  for (const list of byRound.values()) {
    list.sort((a, b) => a.matchNumber - b.matchNumber);
  }
  return byRound;
}

/**
 * Normalize a match to a slot-semantics round id. Mirrors the export route's
 * cdmFinalsSlotRound so the fill map and the (legacy) inline generator agree:
 *   1. a round already in the bracket geometry wins outright;
 *   2. else a bracketPosition containing "reset" -> grand_final_reset;
 *   3. else round/bracketPosition "gf" or isGrandFinal -> grand_final;
 *   4. else null (unmapped — the caller skips it rather than guessing).
 * Older generators / manual fixtures can store grand finals as round="gf" with
 * bracketPosition="gf" or only flag the reset via bracketPosition, so those
 * aliases are normalized before any geometry lookup.
 */
function normalizeRound(match: CdmMatch): string | null {
  const round = match.round ?? '';
  const bracketPosition = (match.bracketPosition ?? '').toLowerCase();
  if (round && FINALS_BRACKET_SLOTS[round]) return round;
  if (bracketPosition.includes('reset')) return 'grand_final_reset';
  if (round === 'gf' || bracketPosition === 'gf' || match.isGrandFinal) {
    return 'grand_final';
  }
  return null; // unmapped: caller skips (+ warns at the call site if relevant).
}

/* ------------------------------------------------------------------ *
 * Score extraction — BM/MR use score1/score2, GP uses points1/points2.
 * ------------------------------------------------------------------ */

function scoreFor(match: CdmMatch, mode: CdmVersusMode, slotIndex: number): number | null {
  if (mode === 'gp') {
    const value = slotIndex === 0 ? match.points1 : match.points2;
    return value ?? null;
  }
  const value = slotIndex === 0 ? match.score1 : match.score2;
  return value ?? null;
}

/** The winner (or loser) player of a completed match, by comparing its scores. */
function matchOutcome(match: CdmMatch | undefined, mode: CdmVersusMode, want: 'winner' | 'loser'): CdmPlayer | null {
  if (!match || !match.completed) return null;
  const s1 = scoreFor(match, mode, 0);
  const s2 = scoreFor(match, mode, 1);
  if (s1 == null || s2 == null || s1 === s2) return null; // undecided / tie
  const player1Wins = s1 > s2;
  if (want === 'winner') return player1Wins ? match.player1 : match.player2;
  return player1Wins ? match.player2 : match.player1;
}

/* ------------------------------------------------------------------ *
 * B-position reconstruction (faithful 24 + degraded 16/8).
 *
 * Produces:
 *   - bPositionPlayers: B-position -> the player who sits there.
 *   - seedPlayerBySlot: "round:matchIndex:slotIndex" -> player at that TYPED
 *     seed slot (used to write the seed-cell B-position and to resolve scores).
 * ------------------------------------------------------------------ */

interface Reconstruction {
  bPositionPlayers: Map<number, CdmPlayer>;
  /** key = `${round}:${matchIndex}:${slotIndex}` */
  seedBPositionBySlot: Map<string, number>;
}

function slotKey(round: string, matchIndex: number, slotIndex: number): string {
  return `${round}:${matchIndex}:${slotIndex}`;
}

/**
 * Reconstruct B-positions for the faithful 24-player bracket from the app's
 * winners_r1 (direct qualifiers) and playoff matches (entrants 13..24), using the
 * canonical structures to recover each typed slot's structural seed.
 */
function reconstruct24(byRound: Map<string, CdmMatch[]>, data: CdmTournamentData, mode: CdmVersusMode): Reconstruction {
  const bPositionPlayers = new Map<number, CdmPlayer>();
  const seedBPositionBySlot = new Map<string, number>();
  const groupCount = qualificationGroupCount(data, mode);
  const directUpperSeeds =
    groupCount === 2 ? TWO_GROUP_DIRECT_UPPER_SEEDS.map(({ seed }) => seed) : [...FINALS_DIRECT_UPPER_SEEDS];

  const structure16 = generateBracketStructure(SIXTEEN, groupCount);
  const r1Structure = structure16.filter((m) => m.round === 'winners_r1');
  const appR1 = byRound.get('winners_r1') ?? [];

  // Direct qualifiers: each TYPED winners_r1 slot maps an upper seed -> B-pos.
  appR1.forEach((appMatch, matchIndex) => {
    const struct = r1Structure[matchIndex];
    if (!struct) return;
    assignTypedSeed(
      'winners_r1',
      matchIndex,
      0,
      struct.player1Seed,
      appMatch.player1,
      true,
      directUpperSeeds,
      bPositionPlayers,
      seedBPositionBySlot,
    );
    assignTypedSeed(
      'winners_r1',
      matchIndex,
      1,
      struct.player2Seed,
      appMatch.player2,
      true,
      directUpperSeeds,
      bPositionPlayers,
      seedBPositionBySlot,
    );
  });

  // Playoff entrants: playoff_r1 both slots + playoff_r2 slot1 (the BYE seed).
  const playoffStructure = generatePlayoffStructure(12, groupCount);
  assignPlayoffSeeds(byRound, playoffStructure, bPositionPlayers, seedBPositionBySlot);

  applyOriginalSeedSnapshot(data, mode, bPositionPlayers, seedBPositionBySlot);

  return { bPositionPlayers, seedBPositionBySlot };
}

/** Apply the immutable entrant snapshot after reconstructing live match slots.
 * This keeps both the seed list and a manually moved opening player tied to
 * their originally published qualification seed. */
function applyOriginalSeedSnapshot(
  data: CdmTournamentData,
  mode: CdmVersusMode,
  bPositionPlayers: Map<number, CdmPlayer>,
  seedBPositionBySlot: Map<string, number>,
): void {
  const snapshot =
    mode === 'bm' ? data.bmFinalsSeedSnapshot : mode === 'mr' ? data.mrFinalsSeedSnapshot : data.gpFinalsSeedSnapshot;
  if (!snapshot || snapshot.length === 0) return;

  const originalSeedByPlayerId = new Map(snapshot.map((entry) => [entry.playerId, entry.originalSeed]));
  const livePlayerById = new Map([...bPositionPlayers.values()].map((player) => [player.id, player]));
  for (const [slot, bPosition] of seedBPositionBySlot) {
    const player = bPositionPlayers.get(bPosition);
    const originalSeed = player ? originalSeedByPlayerId.get(player.id) : undefined;
    if (originalSeed != null) seedBPositionBySlot.set(slot, originalSeed);
  }
  bPositionPlayers.clear();
  for (const entry of snapshot) {
    bPositionPlayers.set(entry.originalSeed, livePlayerById.get(entry.playerId) ?? entry.player);
  }
}

/**
 * Assign one direct-qualifier typed slot. `upperSeed` is the structural upper
 * seed (1..16). Only direct seeds (those in FINALS_DIRECT_UPPER_SEEDS, i.e.
 * 1..12) are typed; playoff-winner seeds (13..16) are formula slots and are
 * skipped — which is consistent with the slot-semantics table marking them
 * winnerOf.
 */
function assignTypedSeed(
  round: string,
  matchIndex: number,
  slotIndex: number,
  upperSeed: number | undefined,
  player: CdmPlayer,
  asDirect: boolean,
  directUpperSeeds: readonly number[],
  bPositionPlayers: Map<number, CdmPlayer>,
  seedBPositionBySlot: Map<string, number>,
): void {
  if (upperSeed == null) return;
  if (asDirect) {
    const directIndex = directUpperSeeds.indexOf(upperSeed);
    if (directIndex < 0) return; // playoff-winner slot -> formula, not typed.
    const bPos = directIndex + 1; // B-positions 1..12.
    bPositionPlayers.set(bPos, player);
    seedBPositionBySlot.set(slotKey(round, matchIndex, slotIndex), bPos);
  }
}

/**
 * Assign the 12 playoff entrants to B-positions 13..24 from the playoff structure.
 * playoff_r1[k] slot1/slot2 = structural player1Seed/player2Seed; playoff_r2[k]
 * slot1 = structural BYE seed (player1Seed). generatePlayoffStructure()'s seeds
 * are already the real overall seed 13..24, so B-pos = structural seed directly.
 */
function assignPlayoffSeeds(
  byRound: Map<string, CdmMatch[]>,
  playoffStructure: BracketMatch[],
  bPositionPlayers: Map<number, CdmPlayer>,
  seedBPositionBySlot: Map<string, number>,
): void {
  const r1Structure = playoffStructure.filter((m) => m.round === 'playoff_r1');
  const r2Structure = playoffStructure.filter((m) => m.round === 'playoff_r2');
  const appR1 = byRound.get('playoff_r1') ?? [];
  const appR2 = byRound.get('playoff_r2') ?? [];

  const place = (
    round: string,
    matchIndex: number,
    slotIndex: number,
    structuralSeed: number | undefined,
    player: CdmPlayer | undefined,
  ) => {
    if (structuralSeed == null || !player) return;
    const bPos = structuralSeed; // already 13..24
    bPositionPlayers.set(bPos, player);
    seedBPositionBySlot.set(slotKey(round, matchIndex, slotIndex), bPos);
  };

  appR1.forEach((appMatch, matchIndex) => {
    const struct = r1Structure[matchIndex];
    if (!struct) return;
    place('playoff_r1', matchIndex, 0, struct.player1Seed, appMatch.player1);
    place('playoff_r1', matchIndex, 1, struct.player2Seed, appMatch.player2);
  });
  appR2.forEach((appMatch, matchIndex) => {
    const struct = r2Structure[matchIndex];
    if (!struct) return;
    // Only slot1 (the BYE seed) is typed; slot2 is a "Winner of B1,k" formula.
    place('playoff_r2', matchIndex, 0, struct.player1Seed, appMatch.player1);
  });
}

/* ------------------------------------------------------------------ *
 * Seed-list writing (B3:B26): nickname per B-position, blanks cleared.
 *
 * IMPORTANT per-mode difference (verified against the real template dump):
 *   - BM Finals / MR Finals B3:B26 are TYPED shared-string inputs.
 *   - GP Finals B3:B26 originally carries an ARRAY-SPILL XLOOKUP from the
 *     mutable qualification ranking. That is not a valid source of truth once
 *     a KO bracket has been generated: later rank corrections must not change
 *     its published seed list. The exporter therefore deliberately replaces
 *     that spill with the canonical bracket seed values, just as it does for
 *     BM/MR.
 * (Discovered during route integration; the prior unit fixtures never exercised
 * the GP seed list against the real template.)
 * ------------------------------------------------------------------ */

function writeSeedList(
  builder: FinalsWriteBuilder,
  bPositionPlayers: Map<number, CdmPlayer>,
  seedCount: number,
  mode: CdmVersusMode,
): void {
  for (let p = 1; p <= FINALS_SEED_LIST_MAX_ROWS; p++) {
    const row = FINALS_SEED_LIST_FIRST_ROW + (p - 1);
    const ref = `${FINALS_SEED_LIST_COLUMN}${row}`;
    const player = p <= seedCount ? bPositionPlayers.get(p) : undefined;
    if (mode === 'gp') {
      if (player) builder.overwriteString(ref, player.nickname);
      else builder.strip(ref);
    } else if (player) {
      builder.setString(ref, player.nickname);
    } else {
      builder.clear(ref); // unused / unresolved -> blank (formulas handle it).
    }
  }
}

/* ------------------------------------------------------------------ *
 * Score resolution (identity-resolved, all faithful rounds).
 *
 * For each app match we resolve the player the template EXPECTS in each slot
 * (typed seed -> B-position player; winnerOf/loserOf -> the actual outcome of the
 * feeding app match) and write that player's real score into the slot's score
 * cell. If the resolved player is not one of the match's two players (manual
 * operation), we fall back to slot1->player1 / slot2->player2 and warn.
 * ------------------------------------------------------------------ */

/** Resolve the player a slot's semantics expect (or null if undetermined). */
function resolveSlotPlayer(
  semantics: FinalsSlotSemantics,
  round: string,
  matchIndex: number,
  slotIndex: number,
  byRound: Map<string, CdmMatch[]>,
  mode: CdmVersusMode,
  recon: Reconstruction,
): CdmPlayer | null {
  if (semantics.kind === 'seed') {
    const bPos = recon.seedBPositionBySlot.get(slotKey(round, matchIndex, slotIndex));
    if (bPos == null) return null;
    return recon.bPositionPlayers.get(bPos) ?? null;
  }
  const feeder = (byRound.get(semantics.round) ?? [])[semantics.index];
  return matchOutcome(feeder, mode, semantics.kind === 'winnerOf' ? 'winner' : 'loser');
}

/**
 * Write the two score cells of one app match using identity resolution. Score
 * cells are cleared when the match is not completed or a slot stays undetermined.
 */
function writeMatchScores(
  builder: FinalsWriteBuilder,
  round: string,
  matchIndex: number,
  match: CdmMatch,
  byRound: Map<string, CdmMatch[]>,
  mode: CdmVersusMode,
  recon: Reconstruction,
): void {
  const slot0 = slotCells(round, matchIndex, 0);
  const slot1 = slotCells(round, matchIndex, 1);
  if (!slot0 || !slot1) {
    logger.warn('Finals match has no slot geometry; skipping scores', {
      mode,
      round,
      matchIndex,
    });
    return;
  }
  // Score-cell refs indexed by slot (0/1) for the resolved-mapping write below.
  const scoreRefs = [slot0.scoreRef, slot1.scoreRef] as const;

  if (!match.completed) {
    builder.clear(scoreRefs[0]);
    builder.clear(scoreRefs[1]);
    return;
  }

  // Resolve the expected player per slot from the template's semantics.
  const expected: Array<CdmPlayer | null> = [null, null];
  for (const slotIndex of [0, 1]) {
    const semantics = getSlotSemantics(round, matchIndex, slotIndex);
    expected[slotIndex] = semantics
      ? resolveSlotPlayer(semantics, round, matchIndex, slotIndex, byRound, mode, recon)
      : null;
  }

  // Map each resolved expected player to the match's actual player to read its
  // score, then write into that slot's score cell. Fall back to positional
  // (slot==player) mapping when the resolution does not match the record.
  const byPlayerId = new Map<string, number>(); // playerId -> slotIndex
  let resolvedBoth = true;
  for (const slotIndex of [0, 1]) {
    const player = expected[slotIndex];
    if (player && (player.id === match.player1.id || player.id === match.player2.id)) {
      byPlayerId.set(player.id, slotIndex);
    } else {
      resolvedBoth = false;
    }
  }

  if (resolvedBoth && byPlayerId.size === 2) {
    // Write each actual player's score into the slot the template expects it.
    for (const [actualSlot, player] of [
      [0, match.player1],
      [1, match.player2],
    ] as const) {
      const targetSlot = byPlayerId.get(player.id)!;
      builder.setNumberOrClear(scoreRefs[targetSlot], scoreFor(match, mode, actualSlot));
    }
    return;
  }

  // Fallback: positional mapping (slot1<-player1, slot2<-player2) + warn.
  logger.warn('Finals slot resolution disagreed with match record; positional fallback', {
    mode,
    round,
    matchIndex,
  });
  builder.setNumberOrClear(scoreRefs[0], scoreFor(match, mode, 0));
  builder.setNumberOrClear(scoreRefs[1], scoreFor(match, mode, 1));
}

/**
 * Write the visible player names for one app match. Faithful CDM templates can
 * derive these cells by formula, but stripped template caches plus protected or
 * delayed recalculation can otherwise render an empty bracket. We use the same
 * slot semantics as score resolution so rows like losers_final still land under
 * the template's expected slot order.
 */
function writeMatchNames(
  builder: FinalsWriteBuilder,
  round: string,
  matchIndex: number,
  match: CdmMatch,
  byRound: Map<string, CdmMatch[]>,
  mode: CdmVersusMode,
  recon: Reconstruction,
): void {
  const nameRefs = [0, 1].map((slotIndex) => slotCells(round, matchIndex, slotIndex)?.nameRef ?? null);
  if (!nameRefs[0] || !nameRefs[1]) {
    logger.warn('Finals match has no slot geometry; skipping names', {
      mode,
      round,
      matchIndex,
    });
    return;
  }
  const resolvedNameRefs = [nameRefs[0], nameRefs[1]] as const;

  const expected: Array<CdmPlayer | null> = [null, null];
  for (const slotIndex of [0, 1]) {
    const semantics = getSlotSemantics(round, matchIndex, slotIndex);
    expected[slotIndex] = semantics
      ? resolveSlotPlayer(semantics, round, matchIndex, slotIndex, byRound, mode, recon)
      : null;
  }

  const byPlayerId = new Map<string, number>();
  let resolvedBoth = true;
  for (const slotIndex of [0, 1]) {
    const player = expected[slotIndex];
    if (player && (player.id === match.player1.id || player.id === match.player2.id)) {
      byPlayerId.set(player.id, slotIndex);
    } else {
      resolvedBoth = false;
    }
  }

  if (resolvedBoth && byPlayerId.size === 2) {
    for (const player of [match.player1, match.player2]) {
      const targetSlot = byPlayerId.get(player.id)!;
      builder.overwriteString(resolvedNameRefs[targetSlot], player.nickname);
    }
    return;
  }

  // Same fallback as score writes: preserve the app record's p1/p2 order when
  // the computed slot semantics cannot be reconciled with manually edited data.
  builder.overwriteString(resolvedNameRefs[0], match.player1.nickname);
  builder.overwriteString(resolvedNameRefs[1], match.player2.nickname);
}

/* ------------------------------------------------------------------ *
 * Typed seed-cell writing (faithful 24).
 * ------------------------------------------------------------------ */

/**
 * Write the B-position number into every TYPED seed cell (per slot-semantics).
 * Formula slots are left untouched so the template's advancement keeps working.
 */
function writeTypedSeedCells(builder: FinalsWriteBuilder, recon: Reconstruction): void {
  for (const [key, bPos] of recon.seedBPositionBySlot) {
    const [round, matchIndexStr, slotIndexStr] = key.split(':');
    const cells = slotCells(round, Number(matchIndexStr), Number(slotIndexStr));
    if (cells) builder.setNumber(cells.seedRef, bPos);
  }
}

/* ------------------------------------------------------------------ *
 * Region clearing — collect every input cell of a set of rounds so unused
 * regions can be cleared (typed) or stripped (formula) without leftover data.
 * ------------------------------------------------------------------ */

/** Every app round id the template geometry knows about. */
const ALL_FINALS_ROUNDS = Object.keys(FINALS_BRACKET_SLOTS);

/** All (seed, name, score) refs of every slot of the listed rounds. */
function regionCells(rounds: string[]): SlotCells[] {
  const cells: SlotCells[] = [];
  for (const round of rounds) {
    const geometries = FINALS_BRACKET_SLOTS[round] ?? [];
    geometries.forEach((_, matchIndex) => {
      for (const slotIndex of [0, 1]) {
        const c = slotCells(round, matchIndex, slotIndex);
        if (c) cells.push(c);
      }
    });
  }
  return cells;
}

/** Clear every score cell of the listed rounds (typed input cells). */
function clearAllScores(builder: FinalsWriteBuilder, rounds: string[]): void {
  for (const c of regionCells(rounds)) builder.clear(c.scoreRef);
}

/**
 * Clear the seed cell of every TYPED slot (per the slot-semantics table) across
 * all rounds, so an unfilled typed seed never keeps stale data. Formula slots are
 * skipped entirely — faithful mode must never write or clear a formula cell.
 * Resolved seeds are re-written afterwards (the builder is last-wins per ref).
 */
function clearAllTypedSeedCells(builder: FinalsWriteBuilder): void {
  for (const round of ALL_FINALS_ROUNDS) {
    const geometries = FINALS_BRACKET_SLOTS[round];
    geometries.forEach((_, matchIndex) => {
      for (const slotIndex of [0, 1]) {
        const semantics = getSlotSemantics(round, matchIndex, slotIndex);
        if (!semantics || semantics.kind !== 'seed') continue; // formula -> skip.
        const cells = slotCells(round, matchIndex, slotIndex);
        if (cells) builder.clear(cells.seedRef);
      }
    });
  }
}

/* ------------------------------------------------------------------ *
 * Public entry point.
 * ------------------------------------------------------------------ */

/**
 * Build the BM/MR/GP Finals cell writes for one mode. Clears precede writes so a
 * partially-filled bracket never leaves stale values behind.
 */
export function buildFinalsWrites(data: CdmTournamentData, mode: CdmVersusMode): CdmCellWrite[] {
  const sheet = CDM_FINALS_SHEETS[mode];
  const builder = new FinalsWriteBuilder(sheet);
  const matches = matchesForMode(data, mode);
  const byRound = matchesByRound(matches);

  const hasPlayoff = matches.some((m) => m.stage === 'playoff');
  const hasR1 = byRound.has('winners_r1');
  const hasQf = byRound.has('winners_qf');

  if (matches.length === 0) {
    // No finals at all: clear every input cell so the template shows a blank
    // bracket (its formulas already render empty inputs harmlessly).
    buildEmptyBracket(builder, mode);
    return builder.build();
  }

  if (hasPlayoff || hasR1) {
    // Faithful 24 (playoff present) or degraded 16 (winners_r1 but no playoff).
    return buildFaithfulOr16(builder, data, mode, byRound, hasPlayoff);
  }

  if (hasQf) {
    // Degraded 8-player bracket (winners_qf is the first round).
    return build8Player(builder, data, byRound, mode);
  }

  // Matches exist but none map to a known bracket round (e.g. only a stray
  // unmapped match): treat as blank to avoid corrupting the template.
  logger.warn('Finals matches present but no recognizable bracket rounds; clearing', {
    mode,
    count: matches.length,
  });
  buildEmptyBracket(builder, mode);
  return builder.build();
}

/** Select a mode's match list from the tournament data. */
function matchesForMode(data: CdmTournamentData, mode: CdmVersusMode): CdmMatch[] {
  switch (mode) {
    case 'bm':
      return data.bmMatches;
    case 'mr':
      return data.mrMatches;
    case 'gp':
      return data.gpMatches;
  }
}

/** Select a mode's qualifications (for the playoff-only B 1..12 fallback). */
function qualsForMode(data: CdmTournamentData, mode: CdmVersusMode): CdmModeQualification[] {
  switch (mode) {
    case 'bm':
      return data.bmQualifications;
    case 'mr':
      return data.mrQualifications;
    case 'gp':
      return data.gpQualifications;
  }
}

function qualificationGroupCount(data: CdmTournamentData, mode: CdmVersusMode): 2 | 3 | 4 {
  const count = new Set(qualsForMode(data, mode).map((qualification) => qualification.group)).size;
  return count === 2 || count === 4 ? count : 3;
}

/* ------------------------------------------------------------------ *
 * Mode: no finals — clear every input cell (seed list, all seeds, all scores).
 * ------------------------------------------------------------------ */

function buildEmptyBracket(builder: FinalsWriteBuilder, mode: CdmVersusMode): void {
  // Seed list B3:B26. GP removes its old qualification-derived spill so a
  // subsequent export cannot retain mutable, stale seed labels.
  for (let p = 1; p <= FINALS_SEED_LIST_MAX_ROWS; p++) {
    const ref = `${FINALS_SEED_LIST_COLUMN}${FINALS_SEED_LIST_FIRST_ROW + (p - 1)}`;
    if (mode === 'gp') builder.strip(ref);
    else builder.clear(ref);
  }
  // Clear only the TYPED seed cells and every score cell; leave all formulas
  // (name XLOOKUPs, advancement, reverse-lookup seed cells) intact so the empty
  // template recomputes a clean blank bracket from the now-empty seed list.
  clearAllTypedSeedCells(builder);
  for (const c of regionCells(ALL_FINALS_ROUNDS)) {
    builder.clear(c.scoreRef);
  }
}

/* ------------------------------------------------------------------ *
 * Mode: faithful (24) or degraded 16.
 * ------------------------------------------------------------------ */

function buildFaithfulOr16(
  builder: FinalsWriteBuilder,
  data: CdmTournamentData,
  mode: CdmVersusMode,
  byRound: Map<string, CdmMatch[]>,
  hasPlayoff: boolean,
): CdmCellWrite[] {
  if (hasPlayoff) {
    const recon = byRound.has('winners_r1')
      ? reconstruct24(byRound, data, mode)
      : reconstructPlayoffOnly(byRound, data, mode);
    // Clear-then-write: clear every typed seed cell and every score cell first so
    // unfilled inputs never keep stale data, then write the resolved values
    // (last-wins). Formula cells are never touched.
    clearAllTypedSeedCells(builder);
    clearAllScores(builder, ALL_FINALS_ROUNDS);
    writeTypedSeedCells(builder, recon);
    writeSeedList(builder, recon.bPositionPlayers, FULL_SEED_COUNT, mode);
    writeAllNames(builder, byRound, mode, recon);
    writeAllScores(builder, byRound, mode, recon);
    return builder.build();
  }
  // Degraded 16-player: no playoff. Reconstruct B 1..16 from winners_r1 directly.
  return build16Player(builder, data, byRound, mode);
}

/**
 * Playoff-only partial state (entrants seeded, winners_r1 not yet generated).
 * B-positions 13..24 come from the playoff; 1..12 fall back to qualification rank
 * (rankOverride asc nulls-last -> score desc -> points desc -> seeding asc ->
 * nickname asc) so the direct qualifiers still appear in the seed list.
 */
function reconstructPlayoffOnly(
  byRound: Map<string, CdmMatch[]>,
  data: CdmTournamentData,
  mode: CdmVersusMode,
): Reconstruction {
  const bPositionPlayers = new Map<number, CdmPlayer>();
  const seedBPositionBySlot = new Map<string, number>();
  const groupCount = qualificationGroupCount(data, mode);
  const playoffStructure = generatePlayoffStructure(12, groupCount);
  assignPlayoffSeeds(byRound, playoffStructure, bPositionPlayers, seedBPositionBySlot);

  // B 1..12: top-12 qualifiers by the documented tiebreak, excluding anyone who
  // is already a playoff entrant (they hold B 13..24).
  const playoffPlayerIds = new Set([...bPositionPlayers.values()].map((p) => p.id));
  const ranked = rankQualifiers(qualsForMode(data, mode)).filter((q) => !playoffPlayerIds.has(q.player.id));
  ranked.slice(0, FINALS_DIRECT_UPPER_SEEDS.length).forEach((q, i) => {
    bPositionPlayers.set(i + 1, q.player); // B 1..12
  });
  applyOriginalSeedSnapshot(data, mode, bPositionPlayers, seedBPositionBySlot);
  return { bPositionPlayers, seedBPositionBySlot };
}

/**
 * Order qualifiers by the documented qualification-rank tiebreak:
 *   rankOverride ascending (nulls last) -> score desc -> points desc ->
 *   seeding asc (nulls last) -> nickname asc.
 */
function rankQualifiers(quals: CdmModeQualification[]): CdmModeQualification[] {
  return [...quals].sort((a, b) => {
    const ra = a.rankOverride ?? null;
    const rb = b.rankOverride ?? null;
    if (ra !== rb) {
      if (ra == null) return 1;
      if (rb == null) return -1;
      return ra - rb;
    }
    if (a.score !== b.score) return b.score - a.score; // higher score first
    if (a.points !== b.points) return b.points - a.points; // higher points first
    const sa = a.seeding ?? null;
    const sb = b.seeding ?? null;
    if (sa !== sb) {
      if (sa == null) return 1;
      if (sb == null) return -1;
      return sa - sb;
    }
    return a.player.nickname.localeCompare(b.player.nickname);
  });
}

/** Write every resolvable match score across all faithful rounds. */
function writeAllScores(
  builder: FinalsWriteBuilder,
  byRound: Map<string, CdmMatch[]>,
  mode: CdmVersusMode,
  recon: Reconstruction,
): void {
  for (const [round, list] of byRound) {
    if (!FINALS_BRACKET_SLOTS[round]) {
      logger.warn('Finals round has no geometry; skipping', { mode, round });
      continue;
    }
    list.forEach((match, matchIndex) => {
      if (matchIndex >= FINALS_BRACKET_SLOTS[round].length) {
        logger.warn('Finals match index exceeds round geometry; skipping', {
          mode,
          round,
          matchIndex,
        });
        return;
      }
      writeMatchScores(builder, round, matchIndex, match, byRound, mode, recon);
    });
  }
}

/** Write visible names for every resolvable match across all faithful rounds. */
function writeAllNames(
  builder: FinalsWriteBuilder,
  byRound: Map<string, CdmMatch[]>,
  mode: CdmVersusMode,
  recon: Reconstruction,
): void {
  for (const [round, list] of byRound) {
    if (!FINALS_BRACKET_SLOTS[round]) continue;
    list.forEach((match, matchIndex) => {
      if (matchIndex >= FINALS_BRACKET_SLOTS[round].length) return;
      writeMatchNames(builder, round, matchIndex, match, byRound, mode, recon);
    });
  }
}

/* ------------------------------------------------------------------ *
 * Mode: degraded 16-player (no playoff).
 *
 * The Top16 even-match slot2 cells hold "Winner of B2,k" formulas that reference
 * the (now empty) Barrage blocks. We value-overwrite those cells with the actual
 * direct qualifier, strip the Barrage blocks, and otherwise behave like faithful
 * (winners_qf onward stay formula-driven on the winners_r1 winners).
 * ------------------------------------------------------------------ */

function build16Player(
  builder: FinalsWriteBuilder,
  data: CdmTournamentData,
  byRound: Map<string, CdmMatch[]>,
  mode: CdmVersusMode,
): CdmCellWrite[] {
  logger.warn('Finals: 16-player bracket (no playoff) — Barrage formulas value-overwritten', {
    mode,
  });

  const bPositionPlayers = new Map<number, CdmPlayer>();
  const seedBPositionBySlot = new Map<string, number>();
  const structure16 = generateBracketStructure(SIXTEEN);
  const r1Structure = structure16.filter((m) => m.round === 'winners_r1');
  const appR1 = byRound.get('winners_r1') ?? [];

  // Every winners_r1 slot is a direct qualifier here; B-position = upper seed.
  appR1.forEach((appMatch, matchIndex) => {
    const struct = r1Structure[matchIndex];
    if (!struct) return;
    for (const [slotIndex, player, upperSeed] of [
      [0, appMatch.player1, struct.player1Seed],
      [1, appMatch.player2, struct.player2Seed],
    ] as const) {
      if (upperSeed == null) continue;
      bPositionPlayers.set(upperSeed, player); // B 1..16 = upper seed.
      seedBPositionBySlot.set(slotKey('winners_r1', matchIndex, slotIndex), upperSeed);
    }
  });
  applyOriginalSeedSnapshot(data, mode, bPositionPlayers, seedBPositionBySlot);
  const recon: Reconstruction = { bPositionPlayers, seedBPositionBySlot };

  // Clear active-round score cells first, then strip the Barrage so the strip
  // (value+formula removed, shell kept) wins over the clear on the Barrage's own
  // score cells. The Barrage is entirely unused in a 16-player bracket.
  clearAllScores(builder, ALL_FINALS_ROUNDS);
  for (const c of regionCells(['playoff_r1', 'playoff_r2'])) {
    builder.strip(c.seedRef);
    builder.strip(c.nameRef);
    builder.strip(c.scoreRef);
  }
  writeSeedList(builder, bPositionPlayers, SIXTEEN, mode);

  // Write winners_r1 seed cells. Even-match slot2 was a "Winner of B2,k" formula:
  // value-overwrite both the seed number and the name (the formula can no longer
  // resolve without the Barrage). Other typed slots use plain typed writes.
  appR1.forEach((appMatch, matchIndex) => {
    const struct = r1Structure[matchIndex];
    if (!struct) return;
    for (const slotIndex of [0, 1] as const) {
      const cells = slotCells('winners_r1', matchIndex, slotIndex);
      if (!cells) continue;
      const bPos = seedBPositionBySlot.get(slotKey('winners_r1', matchIndex, slotIndex));
      if (bPos == null) continue;
      const player = slotIndex === 0 ? appMatch.player1 : appMatch.player2;
      const semantics = getSlotSemantics('winners_r1', matchIndex, slotIndex);
      if (semantics && semantics.kind !== 'seed') {
        // Former "Winner of B2,k" slot -> value-overwrite seed + name.
        builder.overwriteNumber(cells.seedRef, bPos);
        builder.overwriteString(cells.nameRef, player.nickname);
      } else {
        builder.setNumber(cells.seedRef, bPos); // genuinely typed slot.
      }
    }
  });

  writeAllNames(builder, byRound, mode, recon);
  writeAllScores(builder, byRound, mode, recon);
  return builder.build();
}

/* ------------------------------------------------------------------ *
 * Mode: degraded 8-player.
 *
 * The template's 24-player advancement cannot represent an 8-player bracket, so
 * we value-overwrite every used slot's NAME and SCORE (resolved straight from the
 * app match records) and strip every unused region. Excel will no longer
 * recompute this bracket — a documented limitation (design §6).
 *
 * Round -> template geometry mapping (8-player app, generateBracketStructure(8)):
 *   winners_qf[0..3]   -> winners_qf rows 7,15,23,31
 *   winners_sf[0,1]    -> winners_sf rows 11,27
 *   winners_final[0]   -> winners_final row 19
 *   losers_r1[0,1]     -> losers_r1 rows 41,45   (rows 49,53 unused)
 *   losers_r2[0,1]     -> losers_r2 rows 41,45   (rows 49,53 unused)
 *   losers_r3[0,1]     -> losers_r3 rows 43,51
 *   losers_sf[0]       -> losers_sf row 47
 *   losers_final[0]    -> losers_final row 47
 *   grand_final[0]     -> grand_final row 19
 *   grand_final_reset  -> grand_final_reset row 19
 * Unused: Barrage (playoff_*), Top16 (winners_r1), losers_r4, the extra
 * losers_r1/losers_r2 slots at rows 49/53.
 * ------------------------------------------------------------------ */

/** Rounds an 8-player bracket actually uses (others are stripped wholesale). */
const EIGHT_PLAYER_ROUNDS = [
  'winners_qf',
  'winners_sf',
  'winners_final',
  'losers_r1',
  'losers_r2',
  'losers_r3',
  'losers_sf',
  'losers_final',
  'grand_final',
  'grand_final_reset',
] as const;

/** How many matches an 8-player bracket has per round (extras are stripped). */
const EIGHT_PLAYER_ROUND_SIZES: Record<string, number> = {
  winners_qf: 4,
  winners_sf: 2,
  winners_final: 1,
  losers_r1: 2,
  losers_r2: 2,
  losers_r3: 2,
  losers_sf: 1,
  losers_final: 1,
  grand_final: 1,
  grand_final_reset: 1,
};

function build8Player(
  builder: FinalsWriteBuilder,
  data: CdmTournamentData,
  byRound: Map<string, CdmMatch[]>,
  mode: CdmVersusMode,
): CdmCellWrite[] {
  logger.warn('Finals: 8-player bracket — advancement formulas value-overwritten (no Excel recompute)', {
    mode,
  });

  // B-position list (1..8) from the 8-player structure's winners_qf seeds.
  const structure8 = generateBracketStructure(EIGHT);
  const qfStructure = structure8.filter((m) => m.round === 'winners_qf');
  const appQf = byRound.get('winners_qf') ?? [];
  const bPositionPlayers = new Map<number, CdmPlayer>();
  appQf.forEach((appMatch, matchIndex) => {
    const struct = qfStructure[matchIndex];
    if (!struct) return;
    if (struct.player1Seed != null) bPositionPlayers.set(struct.player1Seed, appMatch.player1);
    if (struct.player2Seed != null) bPositionPlayers.set(struct.player2Seed, appMatch.player2);
  });
  applyOriginalSeedSnapshot(data, mode, bPositionPlayers, new Map());

  // Empty every unused slot first (formula cells stripped, typed cells cleared);
  // used slots are overwritten below. A slot is unused if its round is not one of
  // the 8-player rounds or its index exceeds that round's 8-player match count
  // (e.g. losers_r1/r2 rows 49/53, all of losers_r4, Top16, Barrage).
  const usedRounds = new Set<string>(EIGHT_PLAYER_ROUNDS);
  for (const round of ALL_FINALS_ROUNDS) {
    const geometries = FINALS_BRACKET_SLOTS[round];
    const usedCount = usedRounds.has(round) ? (EIGHT_PLAYER_ROUND_SIZES[round] ?? 0) : 0;
    geometries.forEach((_, matchIndex) => {
      if (matchIndex < usedCount) return; // used slot handled in the write pass.
      for (const slotIndex of [0, 1]) emptyUnusedSlot(builder, round, matchIndex, slotIndex);
    });
  }

  writeSeedList(builder, bPositionPlayers, EIGHT, mode);

  // Write each used slot's name + score directly from the app match record.
  // slot1 <- player1 / slot2 <- player2, except losers_final which the template
  // stores reversed vs the app (slot1 = WF loser, slot2 = LSF winner). The app
  // seeds the losers_sf winner as player1 (position:2 in double-elimination.ts),
  // so we swap to keep names and scores under the right slot.
  for (const round of EIGHT_PLAYER_ROUNDS) {
    const list = byRound.get(round) ?? [];
    const usedCount = EIGHT_PLAYER_ROUND_SIZES[round] ?? 0;
    list.forEach((match, matchIndex) => {
      if (matchIndex >= usedCount) {
        logger.warn('8-player finals: match index exceeds bracket size; skipping', {
          mode,
          round,
          matchIndex,
        });
        return;
      }
      writeEightPlayerSlot(builder, round, matchIndex, match, mode);
    });
  }

  return builder.build();
}

/** Overwrite one 8-player match's two slots (name + score) from its record. */
function writeEightPlayerSlot(
  builder: FinalsWriteBuilder,
  round: string,
  matchIndex: number,
  match: CdmMatch,
  mode: CdmVersusMode,
): void {
  // losers_final: template slot1 = Winners-Final loser, slot2 = Losers-SF winner.
  // The app stores the Losers-SF winner as player1, so map player1 -> slot2.
  const reversed = round === 'losers_final';
  for (const appSlot of [0, 1] as const) {
    const targetSlot = reversed ? 1 - appSlot : appSlot;
    const cells = slotCells(round, matchIndex, targetSlot);
    if (!cells) continue;
    const player = appSlot === 0 ? match.player1 : match.player2;
    builder.overwriteString(cells.nameRef, player.nickname);
    if (match.completed) {
      const score = scoreFor(match, mode, appSlot);
      if (score == null) builder.clear(cells.scoreRef);
      else builder.overwriteNumber(cells.scoreRef, score);
    } else {
      builder.clear(cells.scoreRef);
    }
  }
}
