/**
 * Tournament Export API Route
 *
 * GET /api/tournaments/:id/export
 *
 * Exports all tournament data as a CSV file for offline analysis and
 * record-keeping. The export includes:
 *   - Tournament summary (name, date, status, participant counts)
 *   - BM qualification standings per group
 *   - BM qualification match results with round details
 *   - BM finals match results with round/TV information
 *   - MR (Match Race) match results
 *   - GP (Grand Prix) match results with driver points
 *   - TA (Time Attack) entries with times and rankings
 *
 * The CSV uses UTF-8 BOM encoding for proper display in Excel and
 * other spreadsheet applications, especially for Japanese characters.
 *
 * Access: CSV is public; CDM workbook export requires an admin session.
 * Response: CSV file download
 */
import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import * as XLSX from "@e965/xlsx";
import { PLAYER_PUBLIC_SELECT } from '@/lib/prisma-selects';
import prisma from "@/lib/prisma";
import { formatDate, formatTime } from "@/lib/excel";
import { createLogger } from "@/lib/logger";
import { createErrorResponse, handleAuthError, handleAuthzError } from "@/lib/error-handling";
import { resolveTournamentId } from "@/lib/tournament-identifier";
import { auth } from "@/lib/auth";

const CDM_TEMPLATE_PATH = "/templates/cdm-2025-template.xlsm";

type PlayerPublic = {
  id: string;
  name: string;
  nickname: string;
  country?: string | null;
};

type ModeQualification = {
  player: PlayerPublic;
  seeding: number | null;
  group: string;
  mp: number;
  wins: number;
  ties: number;
  losses: number;
  points: number;
  score: number;
  rankOverride?: number | null;
  winRounds?: number;
  lossRounds?: number;
};

type MatchWithPlayers = {
  matchNumber: number;
  stage: string;
  round?: string | null;
  tvNumber?: number | null;
  roundNumber?: number | null;
  isBye?: boolean;
  player1: PlayerPublic;
  player1Side?: number;
  player2: PlayerPublic;
  player2Side?: number;
  score1?: number;
  score2?: number;
  points1?: number;
  points2?: number;
  completed: boolean;
  assignedCourses?: unknown;
  cup?: string | null;
  cupResults?: unknown;
  bracketPosition?: string | null;
  isGrandFinal?: boolean;
};

type TTPhaseRoundExport = {
  phase: string;
  roundNumber: number;
  course: string;
  results: unknown;
  eliminatedIds?: unknown;
  livesReset: boolean;
};

type TTEntryExport = {
  player: PlayerPublic;
  playerId: string;
  stage: string;
  seeding: number | null;
  lives: number;
  eliminated: boolean;
  times?: unknown;
  totalTime?: number | null;
  qualificationPoints?: number | null;
};

type TournamentPlayerScoreExport = {
  player: PlayerPublic;
  taQualificationPoints: number;
  bmQualificationPoints: number;
  mrQualificationPoints: number;
  gpQualificationPoints: number;
  taFinalsPoints: number;
  bmFinalsPoints: number;
  mrFinalsPoints: number;
  gpFinalsPoints: number;
  totalPoints: number;
  overallRank: number | null;
};

const CDM_COURSES = [
  "MC1", "DP1", "GV1", "BC1", "MC2", "CI1", "GV2", "DP2", "BC2", "MC3",
  "KB1", "CI2", "VL1", "BC3", "MC4", "DP3", "KB2", "GV3", "VL2", "RR",
] as const;

const BASE_EXPORT_INCLUDE = {
  bmQualifications: { include: { player: { select: PLAYER_PUBLIC_SELECT } } },
  bmMatches: { include: { player1: { select: PLAYER_PUBLIC_SELECT }, player2: { select: PLAYER_PUBLIC_SELECT } } },
  mrMatches: { include: { player1: { select: PLAYER_PUBLIC_SELECT }, player2: { select: PLAYER_PUBLIC_SELECT } } },
  gpMatches: { include: { player1: { select: PLAYER_PUBLIC_SELECT }, player2: { select: PLAYER_PUBLIC_SELECT } } },
  ttEntries: { include: { player: { select: PLAYER_PUBLIC_SELECT } } },
};

const CDM_EXPORT_INCLUDE = {
  ...BASE_EXPORT_INCLUDE,
  mrQualifications: { include: { player: { select: PLAYER_PUBLIC_SELECT } } },
  gpQualifications: { include: { player: { select: PLAYER_PUBLIC_SELECT } } },
  ttPhaseRounds: true,
  playerScores: { include: { player: { select: PLAYER_PUBLIC_SELECT } } },
};

/*
 * CDM 2025 workbook template coordinates. These constants are fixed template
 * ranges, not business limits; writing past them risks overwriting formula
 * regions and hidden helper cells in the macro workbook.
 */
// Main Hub player table is bounded by explicit template anchors and a fixed
// capacity. Keep both anchor and capacity in constants so range updates stay
// synchronized in code.
const CDM_PLAYER_HUB_FIRST_ROW = 2;
const CDM_PLAYER_HUB_ROW_SPAN = 60;
const CDM_PLAYER_HUB_LAST_ROW = CDM_PLAYER_HUB_FIRST_ROW + CDM_PLAYER_HUB_ROW_SPAN - 1;
const CDM_PLAYER_HUB_MAX_PLAYERS = CDM_PLAYER_HUB_ROW_SPAN;
// TT Qualifications uses the same rows as Main Hub, but keep aliases so
// writeTTQualifications keeps sheet-level readability.
const CDM_TT_QUAL_FIRST_ROW = CDM_PLAYER_HUB_FIRST_ROW;
const CDM_TT_QUAL_MAX_PLAYERS = CDM_PLAYER_HUB_MAX_PLAYERS;
// Qualification sheets reserve CDM_QUALIFICATION_MAX_ROWS rows starting at
// CDM_QUALIFICATION_FIRST_ROW (header row is above the data block).
const CDM_QUALIFICATION_FIRST_ROW = 2;
const CDM_QUALIFICATION_MAX_ROWS = 767;
// Finals players list occupies fixed rows for A1-style standings blocks in each finals sheet.
const CDM_FINALS_PLAYER_FIRST_ROW = 3;
const CDM_FINALS_MAX_PLAYERS = 52;
const CDM_FINALS_BLOCK_START_COLUMNS = [4, 11, 18, 25, 32, 39, 46, 53, 60, 67, 74, 81, 88, 95, 102];
const CDM_FINALS_BLOCK_END_OFFSET = 6;
const CDM_FINALS_LAST_COLUMN = 107;
const CDM_FINALS_MATCH_FIRST_ROW = 5;
const CDM_FINALS_PAIR_ROWS = [5, 13, 21, 29, 37, 45];
// CDM Finals sheets are laid out as fixed bracket regions, not as a dense
// table. Map the app's canonical round ids to the template's native block and
// top-row coordinates so exports preserve the bracket shape operators expect.
const CDM_FINALS_BRACKET_SLOTS: Record<string, Array<{ blockStart: number; row: number }>> = {
  playoff_r1: [5, 13, 21, 29].map((row) => ({ blockStart: 4, row })),
  playoff_r2: [5, 13, 21, 29].map((row) => ({ blockStart: 11, row })),
  winners_r1: [5, 9, 13, 17, 21, 25, 29, 33].map((row) => ({ blockStart: 18, row })),
  winners_qf: [7, 15, 23, 31].map((row) => ({ blockStart: 25, row })),
  winners_sf: [11, 27].map((row) => ({ blockStart: 32, row })),
  winners_final: [{ blockStart: 39, row: 19 }],
  grand_final: [{ blockStart: 46, row: 19 }],
  grand_final_reset: [{ blockStart: 53, row: 19 }],
  losers_r1: [41, 45, 49, 53].map((row) => ({ blockStart: 18, row })),
  losers_r2: [41, 45, 49, 53].map((row) => ({ blockStart: 25, row })),
  losers_r3: [43, 51].map((row) => ({ blockStart: 32, row })),
  losers_r4: [43, 51].map((row) => ({ blockStart: 39, row })),
  losers_sf: [{ blockStart: 46, row: 47 }],
  losers_final: [{ blockStart: 53, row: 47 }],
};
const CDM_TT_FINALIST_FIRST_ROW = 3;
const CDM_TT_FINALIST_MAX_ROWS = 24;
// TT rounds are rendered into fixed block starts; each block maps to one
// logical section defined by CDM_TT_ROUND_START_COLUMNS.
const CDM_TT_ROUND_START_COLUMNS = [7, 20, 33, 46, 59, 72, 85, 98];
const CDM_TT_ROUND_BLOCK_END_OFFSET = 5;
const CDM_TT_ROUND_LAST_COLUMN = 524;
const CDM_TT_ROUND_FIRST_ROW = 1;
const CDM_TT_ROUND_LAST_ROW = 26;
// TT rounds keep at most CDM_TT_ROUND_MAX_RESULTS rows per block within
// rows CDM_TT_ROUND_FIRST_ROW..CDM_TT_ROUND_LAST_ROW (with 2 header rows),
// so values beyond this cap are intentionally dropped.
const CDM_TT_ROUND_MAX_RESULTS = 24;
const CDM_OVERALL_FIRST_ROW = 2;
const CDM_OVERALL_MAX_ROWS = 64;

// Older generators and manual fixtures can still store grand finals as
// round="gf" with bracketPosition="gf"; normalize those aliases before slot
// lookup so legacy rows land in the same native CDM bracket cell as current
// round="grand_final" rows.
function cdmFinalsSlotRound(match: MatchWithPlayers): string | null {
  const round = match.round ?? "";
  const bracketPosition = (match.bracketPosition ?? "").toLowerCase();
  if (round in CDM_FINALS_BRACKET_SLOTS) return round;
  if (bracketPosition.includes("reset")) return "grand_final_reset";
  if (round === "gf" || bracketPosition === "gf" || match.isGrandFinal) return "grand_final";
  return null;
}

function setCell(ws: XLSX.WorkSheet, address: string, value: unknown) {
  if (value === null || value === undefined) {
    delete ws[address];
    return;
  }
  if (typeof value === "number") {
    ws[address] = { ...(ws[address] ?? {}), t: "n", v: value };
    return;
  }
  ws[address] = { ...(ws[address] ?? {}), t: "s", v: String(value) };
}

function toColumn(column: number): string {
  let result = "";
  while (column > 0) {
    const rem = (column - 1) % 26;
    result = String.fromCharCode(65 + rem) + result;
    column = Math.floor((column - 1) / 26);
  }
  return result;
}

function parseTimeMs(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const match = trimmed.match(/^(?:(\d+):)?(\d+)(?:[.:](\d{1,3}))?$/);
  if (!match) return null;
  const minutes = Number(match[1] ?? 0);
  const seconds = Number(match[2]);
  const ms = Number((match[3] ?? "0").padEnd(3, "0").slice(0, 3));
  return minutes * 60_000 + seconds * 1_000 + ms;
}

function normalizeJsonRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function sortQualifications<T extends ModeQualification>(items: T[]): T[] {
  return [...items].sort((a, b) =>
    a.group.localeCompare(b.group) ||
    (a.rankOverride ?? Number.MAX_SAFE_INTEGER) - (b.rankOverride ?? Number.MAX_SAFE_INTEGER) ||
    b.score - a.score ||
    b.points - a.points ||
    (a.seeding ?? Number.MAX_SAFE_INTEGER) - (b.seeding ?? Number.MAX_SAFE_INTEGER) ||
    a.player.nickname.localeCompare(b.player.nickname)
  );
}

async function loadCDMTemplate(request: Request): Promise<
  | { ok: true; buffer: ArrayBuffer }
  | { ok: false; status: number; source: string; error?: unknown }
> {
  let assets: { fetch?: (input: URL) => Promise<Response> } | undefined;
  try {
    assets = getCloudflareContext().env.ASSETS;
  } catch {
    // Outside the Cloudflare runtime, fall back to the public asset URL below.
  }

  if (assets?.fetch) {
    try {
      const response = await assets.fetch(new URL(CDM_TEMPLATE_PATH, "https://assets.local"));
      if (response.ok) {
        return { ok: true, buffer: await response.arrayBuffer() };
      }
      return { ok: false, status: response.status, source: "ASSETS" };
    } catch (error) {
      return { ok: false, status: 500, source: "ASSETS", error };
    }
  }

  const response = await fetch(new URL(CDM_TEMPLATE_PATH, request.url));
  if (response.ok) {
    return { ok: true, buffer: await response.arrayBuffer() };
  }
  return { ok: false, status: response.status, source: "fetch" };
}

function writePlayerHub(
  workbook: XLSX.WorkBook,
  players: PlayerPublic[],
  seedByMode: Record<"tt" | "bm" | "mr" | "gp", Map<string, number | null>>
) {
  const ws = workbook.Sheets["Main Hub"];
  if (!ws) return;

  for (let row = CDM_PLAYER_HUB_FIRST_ROW; row <= CDM_PLAYER_HUB_LAST_ROW; row++) {
    for (const col of ["B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"]) {
      setCell(ws, `${col}${row}`, "");
    }
  }

  players.slice(0, CDM_PLAYER_HUB_MAX_PLAYERS).forEach((player, index) => {
    const row = index + CDM_PLAYER_HUB_FIRST_ROW;
    setCell(ws, `B${row}`, player.name);
    setCell(ws, `C${row}`, player.nickname);
    setCell(ws, `D${row}`, player.country ?? "");
    setCell(ws, `E${row}`, seedByMode.tt.get(player.id) ?? "");
    setCell(ws, `F${row}`, seedByMode.bm.get(player.id) ?? "");
    setCell(ws, `G${row}`, seedByMode.mr.get(player.id) ?? "");
    setCell(ws, `H${row}`, seedByMode.gp.get(player.id) ?? "");
    setCell(ws, `I${row}`, seedByMode.tt.has(player.id) ? "Yes" : "No");
    setCell(ws, `J${row}`, seedByMode.bm.has(player.id) ? "Yes" : "No");
    setCell(ws, `K${row}`, seedByMode.mr.has(player.id) ? "Yes" : "No");
    setCell(ws, `L${row}`, seedByMode.gp.has(player.id) ? "Yes" : "No");
  });
}

function writeTTQualifications(workbook: XLSX.WorkBook, entries: TTEntryExport[]) {
  const ws = workbook.Sheets["TT Qualifications"];
  if (!ws) return;

  for (let row = CDM_TT_QUAL_FIRST_ROW; row < CDM_TT_QUAL_FIRST_ROW + CDM_TT_QUAL_MAX_PLAYERS; row++) {
    for (let col = 5; col <= 26; col++) {
      setCell(ws, `${toColumn(col)}${row}`, "");
    }
  }

  const qualificationEntries = entries
    .filter((entry) => entry.stage === "qualification")
    .sort((a, b) => (a.seeding ?? Number.MAX_SAFE_INTEGER) - (b.seeding ?? Number.MAX_SAFE_INTEGER));

  qualificationEntries.slice(0, CDM_TT_QUAL_MAX_PLAYERS).forEach((entry, index) => {
    const row = index + CDM_TT_QUAL_FIRST_ROW;
    setCell(ws, `E${row}`, index + 1);
    setCell(ws, `F${row}`, entry.player.nickname);
    const times = normalizeJsonRecord(entry.times);
    CDM_COURSES.forEach((course, courseIndex) => {
      setCell(ws, `${toColumn(7 + courseIndex)}${row}`, parseTimeMs(times[course]));
    });
  });
}

function writeQualificationSheet(
  workbook: XLSX.WorkBook,
  sheetName: string,
  qualifications: ModeQualification[],
  matches: MatchWithPlayers[],
  mode: "bm" | "mr" | "gp"
) {
  const ws = workbook.Sheets[sheetName];
  if (!ws) return;

  for (let row = CDM_QUALIFICATION_FIRST_ROW; row < CDM_QUALIFICATION_FIRST_ROW + CDM_QUALIFICATION_MAX_ROWS; row++) {
    for (const col of ["E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O", "P", "Q"]) {
      setCell(ws, `${col}${row}`, "");
    }
    for (let col = 19; col <= 31; col++) {
      setCell(ws, `${toColumn(col)}${row}`, "");
    }
  }

  sortQualifications(qualifications).slice(0, CDM_QUALIFICATION_MAX_ROWS).forEach((qualification, index) => {
    const row = index + CDM_QUALIFICATION_FIRST_ROW;
    setCell(ws, `E${row}`, qualification.group);
    setCell(ws, `F${row}`, qualification.seeding ?? "");
    setCell(ws, `G${row}`, qualification.player.nickname);
    setCell(ws, `H${row}`, qualification.player.country ?? "");
    setCell(ws, `I${row}`, qualification.mp);
    setCell(ws, `J${row}`, qualification.wins);
    setCell(ws, `K${row}`, qualification.ties);
    setCell(ws, `L${row}`, qualification.losses);
    if (mode === "gp") {
      setCell(ws, `M${row}`, qualification.points);
      setCell(ws, `N${row}`, "");
      setCell(ws, `O${row}`, qualification.points);
    } else {
      setCell(ws, `M${row}`, qualification.winRounds ?? 0);
      setCell(ws, `N${row}`, qualification.lossRounds ?? 0);
      setCell(ws, `O${row}`, qualification.points);
    }
    setCell(ws, `P${row}`, 0);
    setCell(ws, `Q${row}`, qualification.score);
  });

  matches
    .filter((match) => match.stage === "qualification")
    .sort((a, b) => (a.roundNumber ?? 0) - (b.roundNumber ?? 0) || a.matchNumber - b.matchNumber)
    .slice(0, CDM_QUALIFICATION_MAX_ROWS)
    .forEach((match, index) => {
      const row = index + CDM_QUALIFICATION_FIRST_ROW;
      setCell(ws, `S${row}`, match.matchNumber);
      setCell(ws, `T${row}`, match.tvNumber ?? "");
      setCell(ws, `U${row}`, match.player1Side ?? 1);
      setCell(ws, `V${row}`, match.player1.nickname);
      setCell(ws, `W${row}`, mode === "gp" ? match.points1 ?? 0 : match.score1 ?? 0);
      setCell(ws, `X${row}`, "-");
      setCell(ws, `Y${row}`, mode === "gp" ? match.points2 ?? 0 : match.score2 ?? 0);
      setCell(ws, `Z${row}`, match.isBye ? "Break" : match.player2.nickname);
      setCell(ws, `AA${row}`, match.player2Side ?? 2);
      if (mode === "mr") {
        const courses = Array.isArray(match.assignedCourses) ? match.assignedCourses : [];
        for (let courseIndex = 0; courseIndex < 4; courseIndex++) {
          setCell(ws, `${toColumn(28 + courseIndex)}${row}`, courses[courseIndex] ?? "");
        }
      }
      if (mode === "gp") {
        setCell(ws, `AB${row}`, match.cup ?? "");
      }
    });
}

function uniquePlayersFromMatches(matches: MatchWithPlayers[]): PlayerPublic[] {
  const players = new Map<string, PlayerPublic>();
  matches.forEach((match) => {
    players.set(match.player1.id, match.player1);
    players.set(match.player2.id, match.player2);
  });
  return [...players.values()].sort((a, b) => a.nickname.localeCompare(b.nickname));
}

// The end column and row are inclusive because XLSX cells are addressed one by
// one here; callers that derive an end column from a start column must pass an
// explicit end offset, not a count/width, to avoid off-by-one mistakes.
function clearRange(ws: XLSX.WorkSheet, startCol: number, endCol: number, startRow: number, endRow: number) {
  for (let row = startRow; row <= endRow; row++) {
    for (let col = startCol; col <= endCol; col++) {
      setCell(ws, `${toColumn(col)}${row}`, "");
    }
  }
}

function gpCupResultsSummary(match: MatchWithPlayers): string {
  if (!Array.isArray(match.cupResults) || match.cupResults.length === 0) {
    return match.cup ?? "";
  }

  return match.cupResults.map((result, index) => {
    const record = result && typeof result === "object" ? result as Record<string, unknown> : {};
    const cup = typeof record.cup === "string" && record.cup.trim() ? record.cup : `Cup ${index + 1}`;
    const points1 = typeof record.points1 === "number" && Number.isFinite(record.points1) ? record.points1 : "";
    const points2 = typeof record.points2 === "number" && Number.isFinite(record.points2) ? record.points2 : "";
    return `${cup}: ${points1}-${points2}`;
  }).join("; ");
}

function cdmFinalsSlotForMatch(
  match: MatchWithPlayers,
  roundIndex: number,
  fallbackIndex: number
): { blockStart: number; row: number; isFallback: boolean } | null {
  const slotRound = cdmFinalsSlotRound(match);
  const slots = slotRound ? CDM_FINALS_BRACKET_SLOTS[slotRound] : undefined;
  if (slots?.[roundIndex]) {
    return { ...slots[roundIndex], isFallback: false };
  }

  const fallbackBlockStart = CDM_FINALS_BLOCK_START_COLUMNS[Math.floor(fallbackIndex / CDM_FINALS_PAIR_ROWS.length)];
  const fallbackRow = CDM_FINALS_PAIR_ROWS[fallbackIndex % CDM_FINALS_PAIR_ROWS.length];
  return fallbackBlockStart && fallbackRow ? { blockStart: fallbackBlockStart, row: fallbackRow, isFallback: true } : null;
}

function cdmFinalsMatchLabel(match: MatchWithPlayers): string {
  const slotRound = cdmFinalsSlotRound(match);
  if (slotRound === "grand_final_reset") return "GF Reset";
  if (slotRound === "grand_final") return "GF";
  return match.bracketPosition || match.round || `M${match.matchNumber}`;
}

function writeMatchFinalsSheet(
  workbook: XLSX.WorkBook,
  sheetName: string,
  qualifications: ModeQualification[],
  matches: MatchWithPlayers[],
  mode: "bm" | "mr" | "gp"
) {
  const ws = workbook.Sheets[sheetName];
  if (!ws) return;

  const finalsMatches = matches
    .filter((match) =>
      match.stage === "playoff" ||
      match.stage === "finals" ||
      match.stage === "grand_final"
    )
    .sort((a, b) =>
      (a.round ?? "").localeCompare(b.round ?? "") ||
      a.matchNumber - b.matchNumber
    );

  const qualifiedPlayers = finalsMatches.length > 0
    ? uniquePlayersFromMatches(finalsMatches)
    : sortQualifications(qualifications).slice(0, 24).map((qualification) => qualification.player);

  clearRange(ws, 1, 2, CDM_FINALS_PLAYER_FIRST_ROW, CDM_FINALS_PLAYER_FIRST_ROW + CDM_FINALS_MAX_PLAYERS - 1);
  qualifiedPlayers.slice(0, CDM_FINALS_MAX_PLAYERS).forEach((player, index) => {
    const row = index + CDM_FINALS_PLAYER_FIRST_ROW;
    setCell(ws, `A${row}`, index + 1);
    setCell(ws, `B${row}`, player.nickname);
  });

  CDM_FINALS_BLOCK_START_COLUMNS.forEach((start) =>
    clearRange(
      ws,
      start,
      Math.min(start + CDM_FINALS_BLOCK_END_OFFSET, CDM_FINALS_LAST_COLUMN),
      CDM_FINALS_MATCH_FIRST_ROW,
      CDM_FINALS_PLAYER_FIRST_ROW + CDM_FINALS_MAX_PLAYERS - 1
    )
  );

  const roundIndexes = new Map<string, number>();
  let fallbackIndex = 0;
  finalsMatches.forEach((match) => {
    const roundKey = match.round ?? "";
    const roundIndex = roundIndexes.get(roundKey) ?? 0;
    roundIndexes.set(roundKey, roundIndex + 1);
    const slot = cdmFinalsSlotForMatch(match, roundIndex, fallbackIndex);
    if (!slot) return;
    if (slot.isFallback) fallbackIndex++;

    const { blockStart, row } = slot;
    const p1Score = mode === "gp" ? match.points1 ?? 0 : match.score1 ?? 0;
    const p2Score = mode === "gp" ? match.points2 ?? 0 : match.score2 ?? 0;
    const label = cdmFinalsMatchLabel(match);

    setCell(ws, `${toColumn(blockStart)}${row}`, label);
    setCell(ws, `${toColumn(blockStart + 1)}${row}`, match.player1.nickname);
    setCell(ws, `${toColumn(blockStart + 2)}${row}`, match.player1.name);
    setCell(ws, `${toColumn(blockStart + 4)}${row}`, p1Score);
    setCell(ws, `${toColumn(blockStart + 1)}${row + 1}`, match.player2.nickname);
    setCell(ws, `${toColumn(blockStart + 2)}${row + 1}`, match.player2.name);
    setCell(ws, `${toColumn(blockStart + 4)}${row + 1}`, p2Score);

    if (mode === "gp") {
      // GP finals store FT progress in points1/points2 and the actual
      // per-cup driver points in cupResults; export the cup summary so CDM
      // audits do not lose the played-cup score detail.
      setCell(ws, `${toColumn(blockStart + 5)}${row}`, gpCupResultsSummary(match));
    }
    if (match.tvNumber) {
      setCell(ws, `${toColumn(blockStart + 6)}${row}`, `TV ${match.tvNumber}`);
    }
  });
}

function writeTTFinals(workbook: XLSX.WorkBook, entries: TTEntryExport[], rounds: TTPhaseRoundExport[]) {
  const ws = workbook.Sheets["TT Finals"];
  if (!ws) return;

  const phaseEntries = new Map<string, TTEntryExport[]>();
  entries
    .filter((entry) => entry.stage === "phase1" || entry.stage === "phase2" || entry.stage === "phase3")
    .forEach((entry) => {
      const bucket = phaseEntries.get(entry.stage) ?? [];
      bucket.push(entry);
      phaseEntries.set(entry.stage, bucket);
    });

  const allFinalists = [...phaseEntries.values()]
    .flat()
    .sort((a, b) =>
      a.stage.localeCompare(b.stage) ||
      Number(a.eliminated) - Number(b.eliminated) ||
      b.lives - a.lives ||
      (a.totalTime ?? Number.MAX_SAFE_INTEGER) - (b.totalTime ?? Number.MAX_SAFE_INTEGER)
    );

  clearRange(ws, 1, 5, CDM_TT_FINALIST_FIRST_ROW, CDM_TT_FINALIST_FIRST_ROW + CDM_TT_FINALIST_MAX_ROWS - 1);
  allFinalists.slice(0, CDM_TT_FINALIST_MAX_ROWS).forEach((entry, index) => {
    const row = index + CDM_TT_FINALIST_FIRST_ROW;
    setCell(ws, `A${row}`, index + 1);
    setCell(ws, `B${row}`, entry.player.nickname);
    setCell(ws, `C${row}`, entry.eliminated ? 0 : 1);
    setCell(ws, `D${row}`, entry.stage);
    setCell(ws, `E${row}`, entry.totalTime ?? "");
  });

  CDM_TT_ROUND_START_COLUMNS.forEach((start) =>
    clearRange(
      ws,
      start,
      Math.min(start + CDM_TT_ROUND_BLOCK_END_OFFSET, CDM_TT_ROUND_LAST_COLUMN),
      CDM_TT_ROUND_FIRST_ROW,
      CDM_TT_ROUND_LAST_ROW
    )
  );

  rounds
    .filter((round) => round.phase === "phase1" || round.phase === "phase2" || round.phase === "phase3")
    .sort((a, b) => a.phase.localeCompare(b.phase) || a.roundNumber - b.roundNumber)
    .slice(0, CDM_TT_ROUND_START_COLUMNS.length)
    .forEach((round, index) => {
      const start = CDM_TT_ROUND_START_COLUMNS[index];
      const results = Array.isArray(round.results) ? round.results as Array<{ playerId?: string; timeMs?: number; isRetry?: boolean }> : [];
      const entriesById = new Map(entries.map((entry) => [entry.playerId, entry]));

      setCell(ws, `${toColumn(start)}1`, `${round.phase} Round ${round.roundNumber} - ${round.course}`);
      setCell(ws, `${toColumn(start)}2`, "#");
      setCell(ws, `${toColumn(start + 1)}2`, "Name");
      setCell(ws, `${toColumn(start + 3)}2`, "Time");
      setCell(ws, `${toColumn(start + 4)}2`, "Lost");
      setCell(ws, `${toColumn(start + 5)}2`, "Left");

      results.slice(0, CDM_TT_ROUND_MAX_RESULTS).forEach((result, resultIndex) => {
        const row = resultIndex + CDM_TT_FINALIST_FIRST_ROW;
        const entry = result.playerId ? entriesById.get(result.playerId) : null;
        setCell(ws, `${toColumn(start)}${row}`, resultIndex + 1);
        setCell(ws, `${toColumn(start + 1)}${row}`, entry?.player.nickname ?? result.playerId ?? "");
        setCell(ws, `${toColumn(start + 3)}${row}`, result.timeMs ?? "");
        setCell(ws, `${toColumn(start + 4)}${row}`, result.isRetry ? "Retry" : "");
        setCell(ws, `${toColumn(start + 5)}${row}`, entry?.lives ?? "");
      });
    });
}

function writeOverallRanking(workbook: XLSX.WorkBook, scores: TournamentPlayerScoreExport[]) {
  const ws = workbook.Sheets["Overall Ranking"];
  if (!ws) return;

  clearRange(ws, 1, 24, CDM_OVERALL_FIRST_ROW, CDM_OVERALL_FIRST_ROW + CDM_OVERALL_MAX_ROWS - 1);
  scores
    .slice()
    .sort((a, b) => (a.overallRank ?? Number.MAX_SAFE_INTEGER) - (b.overallRank ?? Number.MAX_SAFE_INTEGER) || b.totalPoints - a.totalPoints)
    .slice(0, CDM_OVERALL_MAX_ROWS)
    .forEach((score, index) => {
      const row = index + CDM_OVERALL_FIRST_ROW;
      const rank = score.overallRank ?? index + 1;
      setCell(ws, `A${row}`, rank);
      setCell(ws, `B${row}`, score.player.nickname);
      setCell(ws, `D${row}`, score.taQualificationPoints);
      setCell(ws, `E${row}`, score.taFinalsPoints);
      setCell(ws, `F${row}`, score.taQualificationPoints + score.taFinalsPoints);
      setCell(ws, `H${row}`, score.bmQualificationPoints);
      setCell(ws, `I${row}`, score.bmFinalsPoints);
      setCell(ws, `J${row}`, score.bmQualificationPoints + score.bmFinalsPoints);
      setCell(ws, `L${row}`, score.mrQualificationPoints);
      setCell(ws, `M${row}`, score.mrFinalsPoints);
      setCell(ws, `N${row}`, score.mrQualificationPoints + score.mrFinalsPoints);
      setCell(ws, `P${row}`, score.gpQualificationPoints);
      setCell(ws, `Q${row}`, score.gpFinalsPoints);
      setCell(ws, `R${row}`, score.gpQualificationPoints + score.gpFinalsPoints);
      setCell(ws, `T${row}`, score.totalPoints);
      setCell(ws, `V${row}`, rank);
      setCell(ws, `W${row}`, score.player.nickname);
      setCell(ws, `X${row}`, score.totalPoints);
    });
}

function createCDMWorkbook(templateData: ArrayBuffer, tournament: {
  name: string;
  date: Date;
  bmQualifications: ModeQualification[];
  mrQualifications: ModeQualification[];
  gpQualifications: ModeQualification[];
  bmMatches: MatchWithPlayers[];
  mrMatches: MatchWithPlayers[];
  gpMatches: MatchWithPlayers[];
  ttEntries: TTEntryExport[];
  ttPhaseRounds: TTPhaseRoundExport[];
  playerScores: TournamentPlayerScoreExport[];
}) {
  const workbook = XLSX.read(templateData, { bookVBA: true, cellStyles: true });
  const playersById = new Map<string, PlayerPublic>();
  const seedByMode = {
    tt: new Map<string, number | null>(),
    bm: new Map<string, number | null>(),
    mr: new Map<string, number | null>(),
    gp: new Map<string, number | null>(),
  };

  const rememberPlayer = (player: PlayerPublic) => playersById.set(player.id, player);
  tournament.ttEntries.forEach((entry) => {
    rememberPlayer(entry.player);
    if (entry.stage === "qualification") seedByMode.tt.set(entry.player.id, entry.seeding);
  });
  tournament.bmQualifications.forEach((qualification) => {
    rememberPlayer(qualification.player);
    seedByMode.bm.set(qualification.player.id, qualification.seeding);
  });
  tournament.mrQualifications.forEach((qualification) => {
    rememberPlayer(qualification.player);
    seedByMode.mr.set(qualification.player.id, qualification.seeding);
  });
  tournament.gpQualifications.forEach((qualification) => {
    rememberPlayer(qualification.player);
    seedByMode.gp.set(qualification.player.id, qualification.seeding);
  });

  const players = [...playersById.values()].sort((a, b) => a.nickname.localeCompare(b.nickname));
  writePlayerHub(workbook, players, seedByMode);
  writeTTQualifications(workbook, tournament.ttEntries);
  writeQualificationSheet(workbook, "BM Qualifications", tournament.bmQualifications, tournament.bmMatches, "bm");
  writeQualificationSheet(workbook, "MR Qualifications", tournament.mrQualifications, tournament.mrMatches, "mr");
  writeQualificationSheet(workbook, "GP Qualifications", tournament.gpQualifications, tournament.gpMatches, "gp");
  writeMatchFinalsSheet(workbook, "BM Finals", tournament.bmQualifications, tournament.bmMatches, "bm");
  writeMatchFinalsSheet(workbook, "MR Finals", tournament.mrQualifications, tournament.mrMatches, "mr");
  writeMatchFinalsSheet(workbook, "GP Finals", tournament.gpQualifications, tournament.gpMatches, "gp");
  writeTTFinals(workbook, tournament.ttEntries, tournament.ttPhaseRounds);
  writeOverallRanking(workbook, tournament.playerScores);

  workbook.Workbook = workbook.Workbook ?? {};
  (workbook.Workbook as XLSX.WorkBook["Workbook"] & { CalcPr?: { fullCalcOnLoad: string } }).CalcPr = { fullCalcOnLoad: "1" };
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsm", bookVBA: true, cellStyles: true });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  // Logger created inside function for proper test mocking support
  const logger = createLogger('tournament-export-api');
  const { id } = await params;
  const tournamentId = await resolveTournamentId(id);
  const exportFormat = new URL(request.url).searchParams.get("format");

  try {
    if (exportFormat === "cdm") {
      const session = await auth();
      if (!session?.user) {
        return handleAuthError();
      }
      if (session.user.role !== "admin") {
        return handleAuthzError("Admin access required");
      }

      const tournament = await prisma.tournament.findUnique({
        where: { id: tournamentId },
        include: CDM_EXPORT_INCLUDE,
      });

      if (!tournament) {
        return createErrorResponse("Tournament not found", 404);
      }

      const template = await loadCDMTemplate(request);
      if (!template.ok) {
        logger.error("Failed to load CDM export template", {
          source: template.source,
          status: template.status,
          ...(template.error !== undefined && { error: template.error }),
          tournamentId,
        });
        return createErrorResponse("Failed to load CDM export template", 503, "SERVICE_UNAVAILABLE");
      }

      const workbookBuffer = createCDMWorkbook(template.buffer, tournament);
      const filename = `${tournament.name.replace(/[^a-zA-Z0-9]/g, "_")}-cdm-${formatDate(new Date(tournament.date))}.xlsm`;

      return new NextResponse(new Uint8Array(workbookBuffer), {
        headers: {
          "Content-Type": "application/vnd.ms-excel.sheet.macroEnabled.12",
          "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}; filename="${filename}"`,
        },
      });
    }

    // CSV does not read CDM-only qualification/phase/overall tables, so keep
    // its include narrow. The CDM workbook path above opts into the heavier
    // include set only when those workbook sheets need the extra data.
    const tournament = await prisma.tournament.findUnique({
      where: { id: tournamentId },
      include: BASE_EXPORT_INCLUDE,
    });

    if (!tournament) {
      return createErrorResponse("Tournament not found", 404);
    }

    // UTF-8 BOM (Byte Order Mark) ensures Excel correctly interprets
    // the file as UTF-8, which is important for Japanese player names.
    const bom = '\uFEFF';
    let csvContent = bom;

    // ========================================
    // Section 1: Tournament Summary
    // ========================================
    csvContent += 'TOURNAMENT SUMMARY\n';
    const summaryHeaders = ['Field', 'Value'];
    const summaryData = [
      ['Tournament Name', tournament.name],
      ['Date', formatDate(new Date(tournament.date))],
      ['Status', tournament.status],
      ['', ''],
      ['Battle Mode', ''],
      ['BM Participants', String(tournament.bmQualifications.length)],
      ['BM Qualification Matches', String(tournament.bmMatches.filter(m => m.stage === "qualification").length)],
      ['BM Finals Matches', String(tournament.bmMatches.filter(m => m.stage === "finals").length)],
      ['', ''],
      ['Match Race', ''],
      ['MR Matches', String(tournament.mrMatches.length)],
      ['', ''],
      ['Grand Prix', ''],
      ['GP Matches', String(tournament.gpMatches.length)],
      ['', ''],
      ['Time Attack', ''],
      ['TA Entries', String(tournament.ttEntries.length)],
    ];
    csvContent += summaryHeaders.join(',') + '\n';
    csvContent += summaryData.map(row => row.join(',')).join('\n');

    // ========================================
    // Section 2: BM Qualification Standings
    // ========================================
    if (tournament.bmQualifications.length > 0) {
      // Get unique groups and sort alphabetically (A, B, C, ...)
      const groups = [...new Set(tournament.bmQualifications.map((q) => q.group))].sort();

      groups.forEach((group) => {
        // Sort players within each group by score (descending), then by round
        // differential (points) as tiebreaker
        const groupQualifications = tournament.bmQualifications
          .filter((q) => q.group === group)
          .sort((a, b) => b.score - a.score || b.points - a.points);

        const qualHeaders = [
          "Rank", "Player", "Nickname", "Matches Played", "Wins", "Ties",
          "Losses", "Round Diff (+/-)", "Points",
        ];

        const qualData = groupQualifications.map((q, index) => [
          String(index + 1),
          q.player.name,
          q.player.nickname,
          String(q.mp),
          String(q.wins),
          String(q.ties),
          String(q.losses),
          // Format round differential with + prefix for positive values
          q.points > 0 ? `+${q.points}` : String(q.points),
          String(q.score),
        ]);

        const sheetName = group === "A" ? "BM Group A" : group === "B" ? "BM Group B" : `BM Group ${group}`;
        csvContent += `\n${sheetName}\n`;
        csvContent += qualHeaders.join(',') + '\n';
        csvContent += qualData.map(row => row.join(',')).join('\n');
      });
    }

    // ========================================
    // Section 3: BM Match Results
    // ========================================
    if (tournament.bmMatches.length > 0) {
      const qualMatches = tournament.bmMatches.filter(m => m.stage === "qualification");
      const finalsMatches = tournament.bmMatches.filter(m => m.stage === "finals");

      // 3a: Qualification matches
      if (qualMatches.length > 0) {
        const qualMatchHeaders = [
          "Match #", "Player 1", "Nickname 1", "Player 2", "Nickname 2",
          "Score", "Completed", "Rounds"
        ];

        const qualMatchData = qualMatches.map((match) => {
          const score = match.completed ? `${match.score1} - ${match.score2}` : "Not started";

          // Parse round details from the JSON rounds field.
          // Each round contains the arena played and which player won.
          let roundsInfo = "-";
          if (match.rounds && Array.isArray(match.rounds)) {
            roundsInfo = match.rounds
              .map((r) => {
                if (typeof r === "object" && r !== null && "arena" in r && "winner" in r) {
                  return `Arena ${(r as { arena: string; winner: number }).arena}: P${(r as { arena: string; winner: number }).winner} wins`;
                }
                return "";
              })
              .filter(Boolean)
              .join(", ");
          }

          // Escape CSV values that contain commas by wrapping in double quotes
          return [
            String(match.matchNumber),
            match.player1.name,
            match.player1.nickname,
            match.player2.name,
            match.player2.nickname,
            score,
            match.completed ? "Yes" : "No",
            roundsInfo,
          ].map(v => v.includes(',') ? `"${v.replace(/"/g, '""')}"` : v).join(',');
        });

        csvContent += '\nBM Qualification Matches\n';
        csvContent += qualMatchHeaders.join(',') + '\n';
        csvContent += qualMatchData.join('\n');
      }

      // 3b: Finals matches (include round and TV number columns)
      if (finalsMatches.length > 0) {
        const finalsHeaders = [
          "Match #", "Round", "TV #", "Player 1", "Nickname 1",
          "Player 2", "Nickname 2", "Score", "Completed", "Rounds"
        ];

        const finalsData = finalsMatches.map((match) => {
          const score = match.completed ? `${match.score1} - ${match.score2}` : "Not started";

          // Parse round details from JSON (same logic as qualification matches)
          let roundsInfo = "-";
          if (match.rounds && Array.isArray(match.rounds)) {
            roundsInfo = match.rounds
              .map((r) => {
                if (typeof r === "object" && r !== null && "arena" in r && "winner" in r) {
                  return `Arena ${(r as { arena: string; winner: number }).arena}: P${(r as { arena: string; winner: number }).winner} wins`;
                }
                return "";
              })
              .filter(Boolean)
              .join(", ");
          }

          // Escape CSV values that contain commas
          return [
            String(match.matchNumber),
            match.round || "-",
            String(match.tvNumber || "-"),
            match.player1.name,
            match.player1.nickname,
            match.player2.name,
            match.player2.nickname,
            score,
            match.completed ? "Yes" : "No",
            roundsInfo,
          ].map(v => v.includes(',') ? `"${v.replace(/"/g, '""')}"` : v).join(',');
        });

        csvContent += '\nBM Finals Matches\n';
        csvContent += finalsHeaders.join(',') + '\n';
        csvContent += finalsData.join('\n');
      }
    }

    // ========================================
    // Section 4: Match Race Results
    // ========================================
    if (tournament.mrMatches.length > 0) {
      const mrHeaders = [
        "Match #", "Stage", "Round", "Player 1", "Nickname 1", "Player 2", "Nickname 2",
        "Score", "Completed"
      ];

      const mrData = tournament.mrMatches.map((match) => {
        const score = match.completed ? `${match.score1} - ${match.score2}` : "Not started";

        // Escape CSV values that contain commas
        return [
          String(match.matchNumber),
          match.stage || "-",
          match.round || "-",
          match.player1.name,
          match.player1.nickname,
          match.player2.name,
          match.player2.nickname,
          score,
          match.completed ? "Yes" : "No",
        ].map(v => v.includes(',') ? `"${v.replace(/"/g, '""')}"` : v).join(',');
      });

      csvContent += '\nMatch Race Matches\n';
      csvContent += mrHeaders.join(',') + '\n';
      csvContent += mrData.join('\n');
    }

    // ========================================
    // Section 5: Grand Prix Results
    // ========================================
    if (tournament.gpMatches.length > 0) {
      const gpHeaders = [
        "Match #", "Stage", "Player 1", "Nickname 1", "Player 2", "Nickname 2",
        "Points P1", "Points P2", "Completed"
      ];

      const gpData = tournament.gpMatches.map((match) => {
        // GP uses driver points (9, 6, 3, 1) instead of round scores
        return [
          String(match.matchNumber),
          match.stage || "-",
          match.player1.name,
          match.player1.nickname,
          match.player2.name,
          match.player2.nickname,
          String(match.points1 || 0),
          String(match.points2 || 0),
          match.completed ? "Yes" : "No",
        ].map(v => v.includes(',') ? `"${v.replace(/"/g, '""')}"` : v).join(',');
      });

      csvContent += '\nGrand Prix Matches\n';
      csvContent += gpHeaders.join(',') + '\n';
      csvContent += gpData.join('\n');
    }

    // ========================================
    // Section 6: Time Attack Entries
    // ========================================
    if (tournament.ttEntries.length > 0) {
      const taHeaders = [
        "Rank", "Player", "Nickname", "Stage", "Total Time", "Lives", "Date"
      ];

      // Filter out entries without times, then sort by fastest time for ranking
      const taData = tournament.ttEntries
        .filter(entry => entry.totalTime !== null)
        .sort((a, b) => (a.totalTime || 0) - (b.totalTime || 0))
        .map((entry, index) => [
          String(index + 1),
          entry.player.name,
          entry.player.nickname,
          entry.stage || "-",
          formatTime(entry.totalTime || 0),
          String(entry.lives),
          formatDate(new Date(entry.createdAt)),
        ].map(v => v.includes(',') ? `"${v.replace(/"/g, '""')}"` : v).join(','));

      csvContent += '\nTime Attack Entries\n';
      csvContent += taHeaders.join(',') + '\n';
      csvContent += taData.join('\n');
    }

    // Generate a filesystem-safe filename from the tournament name and date.
    // Non-alphanumeric characters are replaced with underscores.
    const filename = `${tournament.name.replace(/[^a-zA-Z0-9]/g, "_")}-full-${formatDate(new Date(tournament.date))}.csv`;

    // Return the CSV content as a file download response
    return new NextResponse(csvContent, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}; filename="${filename}"`,
      },
    });
  } catch (error) {
    // Log error with tournament ID for debugging
    logger.error("Failed to export tournament", { error, tournamentId });
    return createErrorResponse("Failed to export tournament data", 500);
  }
}
