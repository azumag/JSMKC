/**
 * CDM workbook export — shared types.
 *
 * The CDM 2025 score sheet (public/templates/cdm-2025-template.xlsm) is a
 * formula-driven workbook: standings, bracket advancement and the overall
 * ranking are computed by Excel dynamic-array formulas. The export therefore
 * writes ONLY the workbook's true input cells and must leave every other
 * cell and zip part untouched. See docs/cdm-export-design.md for the full
 * cell contract; coordinates live in cdm-constants.ts.
 */

/** Worksheet names of the CDM template (must match xl/workbook.xml exactly). */
export type CdmSheetName =
  | 'Main Hub'
  | 'Parameters'
  | 'TT Qualifications'
  | 'TT Finals'
  | 'TT for Scoub'
  | 'BM Qualifications'
  | 'BM Finals'
  | 'MR Qualifications'
  | 'MR Finals'
  | 'GP Qualifications'
  | 'GP Finals'
  | 'Overall Ranking';

/**
 * One cell mutation against a template worksheet.
 *
 * Op semantics (enforced by sheet-xml-patcher):
 * - "number" / "inlineString": set a value on a cell that must NOT hold a
 *   formula in the template. Writing over a formula cell throws — it means
 *   the fill map disagrees with the template and the export would silently
 *   corrupt the formula web (the exact failure mode of the old exporter).
 * - "clearValue": drop the cached <v>/<is> but keep the cell, its style and
 *   any formula. Used for unused input rows so template formulas keep
 *   evaluating blanks gracefully.
 * - "overwriteNumber" / "overwriteString": replace value AND remove any
 *   formula. Reserved for the degraded bracket modes (8-player / 16-player
 *   without playoff) where the template's advancement formulas cannot
 *   represent the app bracket. Never used on the faithful 24-player path.
 * - "strip": remove value and formula but keep the styled cell shell, so
 *   bracket borders/fills survive in regions the event does not use.
 */
export type CdmCellOp =
  | { op: 'number'; value: number }
  | { op: 'inlineString'; value: string }
  | { op: 'clearValue' }
  | { op: 'overwriteNumber'; value: number }
  | { op: 'overwriteString'; value: string }
  | { op: 'strip' };

export type CdmCellWrite = CdmCellOp & {
  sheet: CdmSheetName;
  /** A1-style cell reference, e.g. "B12". */
  ref: string;
};

/** Player fields the fill maps need (public projection only — never password). */
export interface CdmPlayer {
  id: string;
  name: string;
  nickname: string;
  country?: string | null;
}

export interface CdmModeQualification {
  player: CdmPlayer;
  seeding: number | null;
  group: string;
  rankOverride?: number | null;
  points: number;
  score: number;
}

export interface CdmMatch {
  matchNumber: number;
  stage: string; // 'qualification' | 'playoff' | 'finals'
  round?: string | null;
  bracketPosition?: string | null;
  isGrandFinal?: boolean;
  roundNumber?: number | null;
  tvNumber?: number | null;
  isBye?: boolean;
  player1: CdmPlayer;
  player2: CdmPlayer;
  player1Side?: number | null;
  player2Side?: number | null;
  score1?: number | null;
  score2?: number | null;
  points1?: number | null;
  points2?: number | null;
  targetWins?: number | null;
  winnerOverrideId?: string | null;
  suddenDeathWinnerId?: string | null;
  completed: boolean;
  assignedCourses?: unknown; // MR: ["MC1", ...]
  cup?: string | null; // GP
  assignedCups?: unknown; // GP: ["Mushroom", ...]
}

export interface CdmFinalsRoundSetting {
  mode: CdmVersusMode;
  stage: string;
  round: string;
  targetWins: number;
}

export interface CdmTTEntry {
  player: CdmPlayer;
  playerId: string;
  stage: string; // 'qualification' | 'phase1' | 'phase2' | 'phase3'
  seeding: number | null;
  lives: number;
  eliminated: boolean;
  times?: unknown; // {"MC1": "1:23.45", ...}
  totalTime?: number | null;
  qualificationPoints?: number | null;
  /**
   * Persisted canonical TT qualification rank (TTEntry.rank). The TT Finals
   * sheet orders its round-1 rows by final qualification standing, so the
   * replay uses this as the primary key and only falls back to the
   * points-desc / totalTime-asc comparator when ranks are missing.
   */
  rank?: number | null;
}

export interface CdmTTPhaseRound {
  phase: string; // 'phase1' | 'phase2' | 'phase3'
  roundNumber: number;
  course: string; // course abbreviation, e.g. "MC1"
  results: unknown; // [{playerId, timeMs, isRetry}]
  eliminatedIds?: unknown; // playerId[]
  livesReset: boolean;
  /**
   * Resolved sudden-death rounds tied to this base round, oldest first
   * (TTPhaseSuddenDeathRound.sequence ascending). A base round can accumulate
   * more than one (e.g. a life-loss tie followed by a bronze race, issue
   * #2773) — the replay must use the full chain, not just the latest, or it
   * mis-ranks pairs the later sudden death never raced against each other.
   */
  suddenDeathRounds?: CdmTTPhaseSuddenDeathRound[];
}

export interface CdmTTPhaseSuddenDeathRound {
  sequence: number;
  results: unknown; // CourseResult[] once resolved: [{playerId, timeMs}]
}

/** Immutable KO entrant label captured when the finals/playoff is generated. */
export interface CdmFinalsSeedSnapshotEntry {
  seed: number;
  originalSeed: number;
  playerId: string;
  player: CdmPlayer;
}

/** Everything the generator needs; assembled by the export route from prisma. */
export interface CdmTournamentData {
  name: string;
  date: Date;
  bmQualifications: CdmModeQualification[];
  mrQualifications: CdmModeQualification[];
  gpQualifications: CdmModeQualification[];
  bmMatches: CdmMatch[];
  mrMatches: CdmMatch[];
  gpMatches: CdmMatch[];
  ttEntries: CdmTTEntry[];
  ttPhaseRounds: CdmTTPhaseRound[];
  bmFinalsSeedSnapshot?: CdmFinalsSeedSnapshotEntry[];
  mrFinalsSeedSnapshot?: CdmFinalsSeedSnapshotEntry[];
  gpFinalsSeedSnapshot?: CdmFinalsSeedSnapshotEntry[];
  finalsRoundSettings?: CdmFinalsRoundSetting[];
}

export type CdmVersusMode = 'bm' | 'mr' | 'gp';
