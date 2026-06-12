/**
 * Main Hub fill map — the Registration table (A1:L61) plus the Qualifying /
 * Groups count inputs at O3:R3 / O4:R4.
 *
 * The Main Hub is the single source of truth the rest of the workbook reads
 * via the `Registration[...]` structured references and the synthesized Order
 * column. We therefore write only the human-input cells documented in
 * docs/cdm-export-design.md §3.1 and verified against the template dump
 * /tmp/cdm-analysis/sheet2025/sheet_Main_Hub.txt:
 *
 *   B = name        C = nickname      D = country (text; null -> clear)
 *   E,F,G,H = TT,BM,MR,GP Order       I,J,K,L = TT,BM,MR,GP participation Yes/No
 *   O3..R3 = Qualifying counts (TT,BM,MR,GP)   O4..R4 = group counts
 *
 * Never written (all formulas/spills in the template dump):
 *   A (=ROW()-1), N2:R2 (COUNTIF), O2:R2, T/U (UNIQUE/COUNTIF country spill),
 *   and the M/N labels column region.
 *
 * Ground-truth ordering note: the dump's rows are sorted by Name (column B),
 * case-insensitive ascending — e.g. B2 "Alessandro Sona", B5 "Charly Greffier".
 * (docs §3.1's "nickname ascending" remark is inaccurate for Main Hub; the
 * sort key is Name. Functionally the order is irrelevant because FILTER/SORT
 * re-derive every view, but we follow the template's observed Name order.)
 */

import { createLogger } from "@/lib/logger";
import {
  MAIN_HUB_FIRST_PLAYER_ROW,
  MAIN_HUB_MAX_PLAYERS,
  MAIN_HUB_LAST_PLAYER_ROW,
  MAIN_HUB_QUALIFYING_ROW,
  MAIN_HUB_GROUPS_ROW,
  MAIN_HUB_COUNT_COLUMNS,
} from "../cdm-constants";
import type {
  CdmMatch,
  CdmModeQualification,
  CdmPlayer,
  CdmTournamentData,
  CdmVersusMode,
} from "../types";
import {
  SheetWriteBuilder,
  excelCaseInsensitiveCompare,
  synthesizeModeOrders,
} from "./sheet-player-order";

const logger = createLogger("cdm-export");

const SHEET = "Main Hub" as const;

/** Per-row data columns to clear on unused Registration rows (B..L). */
const REGISTRATION_DATA_COLUMNS = [
  "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L",
] as const;

/** Order column letters E,F,G,H indexed as [TT, BM, MR, GP]. */
const ORDER_COLUMNS = ["E", "F", "G", "H"] as const;
/** Participation Yes/No column letters I,J,K,L indexed as [TT, BM, MR, GP]. */
const PARTICIPATION_COLUMNS = ["I", "J", "K", "L"] as const;

/** A bracket-size hint derived from which finals/playoff rounds exist. */
const FULL_BRACKET = 24;

/**
 * Read the distinct player count that has at least one recorded result across
 * the supplied TT phase rounds. Used for the Qualifying count when the finals
 * phases have started (overrides the qualification-headcount default).
 */
function distinctTtPhasePlayers(data: CdmTournamentData): number {
  const ids = new Set<string>();
  for (const round of data.ttPhaseRounds) {
    const results = round.results;
    if (!Array.isArray(results)) continue;
    for (const entry of results) {
      const playerId = (entry as { playerId?: unknown }).playerId;
      if (typeof playerId === "string") ids.add(playerId);
    }
  }
  return ids.size;
}

/**
 * Bracket size for a versus mode based on the finals/playoff matches present:
 *   any stage="playoff" match            -> 24 (16 direct + 12 playoff)
 *   round="winners_r1"                    -> 16
 *   round="winners_qf" (and no winners_r1) -> 8
 *   otherwise                            -> min(24, qualifier count)
 * Mirrors docs §3.1 / §4 "Qualifying count" derivation.
 */
function bracketSize(matches: CdmMatch[], qualifierCount: number): number {
  const hasPlayoff = matches.some((m) => m.stage === "playoff");
  if (hasPlayoff) return FULL_BRACKET;
  const hasR1 = matches.some((m) => m.round === "winners_r1");
  if (hasR1) return 16;
  const hasQf = matches.some((m) => m.round === "winners_qf");
  if (hasQf) return 8;
  return Math.min(FULL_BRACKET, qualifierCount);
}

/** Distinct group labels used by a mode's qualifications. */
function distinctGroupCount(quals: CdmModeQualification[]): number {
  return new Set(quals.map((q) => q.group)).size;
}

/**
 * Build the deduplicated player universe: every player that appears in any
 * versus-mode qualification or as a TT entry. Keyed by player id (a player can
 * be in several modes). Returned sorted by name, case-insensitive ascending.
 */
function collectPlayerUniverse(data: CdmTournamentData): CdmPlayer[] {
  const byId = new Map<string, CdmPlayer>();
  const add = (p: CdmPlayer) => {
    if (!byId.has(p.id)) byId.set(p.id, p);
  };
  for (const q of data.bmQualifications) add(q.player);
  for (const q of data.mrQualifications) add(q.player);
  for (const q of data.gpQualifications) add(q.player);
  for (const e of data.ttEntries) add(e.player);

  return [...byId.values()].sort((a, b) =>
    excelCaseInsensitiveCompare(a.name, b.name),
  );
}

export function buildMainHubWrites(data: CdmTournamentData): CdmCellWrites {
  const builder = new SheetWriteBuilder(SHEET);

  // --- Per-player Order lookups -------------------------------------------
  // BM/MR/GP Orders are synthesized so the sheet re-derives the app groups.
  const bmOrders = synthesizeModeOrders(data.bmQualifications);
  const mrOrders = synthesizeModeOrders(data.mrQualifications);
  const gpOrders = synthesizeModeOrders(data.gpQualifications);

  // TT Order comes straight from the qualification entry's seeding; TT
  // participation is "is there a qualification-stage entry". Non-qualification
  // stages (phase1/2/3) do not count as TT participation here.
  const ttQualByPlayer = new Map<string, { seeding: number | null }>();
  for (const entry of data.ttEntries) {
    if (entry.stage === "qualification") {
      ttQualByPlayer.set(entry.player.id, { seeding: entry.seeding });
    }
  }

  // --- Player rows (2..61, max 60) ----------------------------------------
  const universe = collectPlayerUniverse(data);
  if (universe.length > MAIN_HUB_MAX_PLAYERS) {
    logger.warn("Main Hub player universe exceeds 60; truncating", {
      total: universe.length,
      kept: MAIN_HUB_MAX_PLAYERS,
    });
  }
  const players = universe.slice(0, MAIN_HUB_MAX_PLAYERS);

  players.forEach((player, index) => {
    const row = MAIN_HUB_FIRST_PLAYER_ROW + index;

    builder.setString(`B${row}`, player.name);
    builder.setString(`C${row}`, player.nickname);
    // Country was a rich-value flag image; we write plain text and clear when
    // absent (clearing keeps the styled cell and any XLOOKUP-on-image formulas
    // elsewhere evaluating blank gracefully). XML detail: the template D cells
    // are rich-value error shells (t="e" vm=..), and clearValue only drops the
    // cached <v>, so a cleared cell keeps that typed-empty shell. Excel treats
    // a value-less cell as blank regardless of its t attribute, and D is not
    // referenced by any spill anchor, so the leftover shell is inert — accepted
    // alongside the documented flag-image degradation (design doc §6).
    builder.setStringOrClear(`D${row}`, player.country ?? null);

    // E..H Orders: [TT, BM, MR, GP]. Absent participation -> clear (blank),
    // never 0, so the sheet's interleave/XLOOKUP treat the player as not in the
    // mode rather than as Order 0.
    const ttEntry = ttQualByPlayer.get(player.id);
    builder.setNumberOrClear(`${ORDER_COLUMNS[0]}${row}`, ttEntry ? ttEntry.seeding : null);
    builder.setNumberOrClear(`${ORDER_COLUMNS[1]}${row}`, bmOrders.get(player.id) ?? null);
    builder.setNumberOrClear(`${ORDER_COLUMNS[2]}${row}`, mrOrders.get(player.id) ?? null);
    builder.setNumberOrClear(`${ORDER_COLUMNS[3]}${row}`, gpOrders.get(player.id) ?? null);

    // I..L participation Yes/No: [TT, BM, MR, GP].
    builder.setString(`${PARTICIPATION_COLUMNS[0]}${row}`, ttEntry ? "Yes" : "No");
    builder.setString(`${PARTICIPATION_COLUMNS[1]}${row}`, bmOrders.has(player.id) ? "Yes" : "No");
    builder.setString(`${PARTICIPATION_COLUMNS[2]}${row}`, mrOrders.has(player.id) ? "Yes" : "No");
    builder.setString(`${PARTICIPATION_COLUMNS[3]}${row}`, gpOrders.has(player.id) ? "Yes" : "No");
  });

  // --- Spare rows: clear B..L from (players+2) through 61 ------------------
  for (
    let row = MAIN_HUB_FIRST_PLAYER_ROW + players.length;
    row <= MAIN_HUB_LAST_PLAYER_ROW;
    row++
  ) {
    for (const col of REGISTRATION_DATA_COLUMNS) builder.clear(`${col}${row}`);
  }

  // --- Qualifying counts O3..R3 -------------------------------------------
  // TT: O3 drives the TT Finals roster spill
  // (B3 = OFFSET('TT Qualifications'!CN2,0,0,'Main Hub'!O3)), so it must equal
  // the finals UNIVERSE the lives replay writes rows for: the top
  // min(24, qualifier-count) of the qualification standing — NOT the distinct
  // phase-participant count. Mid-tournament the phases only contain a subset
  // (phase1 = ranks 17..24), yet the sheet still lists the full top-24 roster
  // with non-runners at Time=0, exactly like the CDM 2025 workbook. Distinct
  // phase players is only a fallback for the degenerate "finals data without
  // qualification entries" case.
  const ttQualCount = ttQualByPlayer.size;
  const ttQualifying =
    ttQualCount > 0
      ? Math.min(FULL_BRACKET, ttQualCount)
      : distinctTtPhasePlayers(data);

  const qualifying: Record<CdmVersusMode | "tt", number> = {
    tt: ttQualifying,
    bm: bracketSize(data.bmMatches, data.bmQualifications.length),
    mr: bracketSize(data.mrMatches, data.mrQualifications.length),
    gp: bracketSize(data.gpMatches, data.gpQualifications.length),
  };
  // Column order is [TT, BM, MR, GP] = [O, P, Q, R].
  const qualifyingByColumn = [qualifying.tt, qualifying.bm, qualifying.mr, qualifying.gp];
  qualifyingByColumn.forEach((value, i) => {
    builder.setNumber(`${MAIN_HUB_COUNT_COLUMNS[i]}${MAIN_HUB_QUALIFYING_ROW}`, value);
  });

  // --- Group counts O4..R4 ------------------------------------------------
  // TT has no groups (always 0); BM/MR/GP use their distinct group counts.
  const groupsByColumn = [
    0,
    distinctGroupCount(data.bmQualifications),
    distinctGroupCount(data.mrQualifications),
    distinctGroupCount(data.gpQualifications),
  ];
  groupsByColumn.forEach((value, i) => {
    builder.setNumber(`${MAIN_HUB_COUNT_COLUMNS[i]}${MAIN_HUB_GROUPS_ROW}`, value);
  });

  return builder.build();
}

// Local alias keeps the public signature readable without re-importing the type
// name everywhere. CdmCellWrite[] is the contract consumed by the XML patcher.
type CdmCellWrites = import("../types").CdmCellWrite[];
