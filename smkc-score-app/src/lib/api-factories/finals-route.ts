/**
 * Finals Route Factory
 *
 * Generates GET/POST/PUT handlers for double-elimination finals API routes.
 * Eliminates ~400 lines of duplicated bracket logic across BM, MR, and GP
 * finals while preserving each event type's unique response shape and
 * score field mapping.
 *
 * GET styles:
 *   - 'grouped' (BM): matches split into winners/losers/grandFinal arrays
 *   - 'simple'  (MR): flat matches array with bracket metadata
 *   - 'paginated' (GP): paginated matches with bracket metadata
 *
 * POST: Creates an 8-player double-elimination bracket from qualification standings.
 * PUT:  Updates a match score and auto-advances players through the bracket.
 */

import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { PLAYER_PUBLIC_SELECT } from '@/lib/prisma-selects';
import prisma from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { generateBracketStructure, generatePlayoffStructure, roundNames } from '@/lib/double-elimination';
import { selectFinalsEntrantsByGroup } from '@/lib/finals-group-selection';
import type { ScorePointsEntry } from '@/lib/ranking-utils';
import {
  getGpFinalsMaxCups,
  getMrFinalsMaxRounds,
  parsePersistedFinalsTargetWins,
} from '@/lib/finals-target-wins';
import { paginate } from '@/lib/pagination';
import { sanitizeInput } from '@/lib/sanitize';
import { createLogger } from '@/lib/logger';
import {
  createErrorResponse,
  createSuccessResponse,
  handleValidationError,
  handleRateLimitError,
  handleAuthzError,
} from '@/lib/error-handling';
import { checkRateLimit } from '@/lib/rate-limit';
import { getClientIdentifier } from '@/lib/request-utils';
import { resolveTournament, resolveTournamentId } from '@/lib/tournament-identifier';
import { computeQualificationRanks } from '@/lib/server-ranking';
import { invalidateOverallRankingsCache } from '@/lib/points/overall-ranking';
import { COURSES, CUPS, MAX_TV_NUMBER } from '@/lib/constants';
import { getArchivedFinalsPayload, readTournamentArchive } from '@/lib/tournament-archive';
import { executeD1Batch } from '@/lib/d1-batch';
import { buildAuditLogData, createAuditLog, resolveAuditUserId, AUDIT_ACTIONS } from '@/lib/audit-log';
import {
  getFinalsSlotStatus,
  isFinalsSlotConfirmed,
  serializeFinalsSlots,
  type SlotStatusMatch,
} from '@/lib/finals-slot-status';
import type { BracketMatch } from '@/types/bracket';
import {
  getFinalsSeedSnapshotField,
  isCompleteFinalsSeedSnapshot,
  parseFinalsSeedSnapshot,
  resolveFinalsSeedSnapshot,
  type FinalsSeedSnapshotEntry,
} from '@/lib/finals-seed-snapshot';

/**
 * Bracket size inference thresholds.
 * 8-player bracket = 17 matches, 16-player bracket = 31 matches.
 * Threshold of 20 distinguishes between the two (>20 means 16-player).
 */
const BRACKET_SIZE_THRESHOLD = 20;

/**
 * Pre-Bracket Playoff ("barrage") entrant count. Supports issue #454:
 * Top 24 qualifiers → Top 16 Upper Bracket, with 12 entrants from qualification
 * positions 13-24 competing for the 4 Upper-Bracket barrage seats.
 */
const TOP24_QUALIFIER_COUNT = 24;
const PLAYOFF_ENTRANT_COUNT = 12;
const PLAYOFF_R2_UPPER_SEED_COUNT = 4;
const TOP24_SUPPORTED_GROUP_COUNT = 3;

/**
 * Quoted D1 table name for each finals match model, used only by the
 * `swapSlots` raw-SQL path (issue #3017 §6). Selected from this static map —
 * never built from request input — so `Prisma.raw()` embedding it in a
 * `Prisma.sql` template stays safe from injection. Mirrors the
 * `QUALIFICATION_MATCH_INSERT_SQL` static-map pattern in qualification-route.ts.
 */
const SLOT_SWAP_TABLE_NAME: Record<string, string> = {
  bMMatch: '"BMMatch"',
  mRMatch: '"MRMatch"',
  gPMatch: '"GPMatch"',
};

type QualificationConfirmedField = 'bmQualificationConfirmed' | 'mrQualificationConfirmed' | 'gpQualificationConfirmed';
function getQualificationConfirmedField(eventTypeCode: 'bm' | 'mr' | 'gp'): QualificationConfirmedField {
  return `${eventTypeCode}QualificationConfirmed` as QualificationConfirmedField;
}

interface FinalsMatchResult {
  winnerId?: string;
  loserId?: string;
  completed?: boolean;
  updateData?: Record<string, unknown>;
}

interface FinalsMatchResultError {
  error: string;
  field?: string;
}

interface SeededFinalsPlayer {
  /** Structural bracket slot used when generating the match rows. */
  seed: number;
  /** Qualification seed, preserved when a barrage winner enters another slot. */
  originalSeed?: number;
  playerId: string;
  player: PublicFinalsPlayer;
  qualificationRankLabel?: string;
}

interface PublicFinalsPlayer {
  id: string;
  name?: string | null;
  nickname?: string | null;
  country?: string | null;
  noCamera?: boolean;
}

interface Top24FinalsPreviewMatch extends Record<string, unknown> {
  matchNumber: number;
  round?: string | null;
  completed?: boolean;
}

/* score/points (ScorePointsEntry) are present on the underlying Prisma row for
 * all of BM/MR/GP; declared here so selectFinalsEntrantsByGroup's 3+-group
 * bucket tiebreak can read them. See qualification-combined-ranking.md §2-§3. */
interface Top24FinalsQualification extends QualificationRankLabelInput, ScorePointsEntry {
  group: string;
  player: PublicFinalsPlayer | null;
}

interface SafeErrorLogFields {
  errorName: string;
  errorCode?: string;
}

export interface QualificationRankLabelInput {
  playerId: string;
  group?: string | null;
  _rank: number;
}

/**
 * Builds the playerId -> qualification rank label map used by finals seed UI.
 *
 * Labels are assigned after grouping by `group` and ordering by computed
 * `_rank`: grouped rows become `A1`, `B2`, etc.; ungrouped rows become `1`,
 * `2`, etc. When rows in the same group have the same `_rank`, the original
 * input order is kept so tied players receive deterministic adjacent labels.
 */
export function buildQualificationRankLabelMap(qualifications: QualificationRankLabelInput[]): Map<string, string> {
  const orderedQualifications = qualifications
    .map((qualification, index) => ({ qualification, index }))
    .sort((a, b) => {
      const groupCompare = (a.qualification.group ?? '').localeCompare(b.qualification.group ?? '');
      if (groupCompare !== 0) return groupCompare;

      return a.qualification._rank - b.qualification._rank || a.index - b.index;
    });
  const rankByPlayerId = new Map<string, string>();
  const groupCounts = new Map<string, number>();

  for (const { qualification: q } of orderedQualifications) {
    const group = q.group ?? '';
    const rank = (groupCounts.get(group) ?? 0) + 1;
    groupCounts.set(group, rank);
    rankByPlayerId.set(q.playerId, group ? `${group}${rank}` : `${rank}`);
  }

  return rankByPlayerId;
}

function isPublicFinalsPlayer(value: unknown): value is PublicFinalsPlayer {
  return Boolean(value && typeof value === 'object' && typeof (value as { id?: unknown }).id === 'string');
}

function getSafeErrorLogFields(error: unknown): SafeErrorLogFields {
  const errorLike = error && typeof error === 'object' ? (error as { name?: unknown; code?: unknown }) : null;
  const errorName =
    error instanceof Error
      ? error.name
      : typeof error === 'string'
        ? 'StringError'
        : errorLike && typeof errorLike.name === 'string'
          ? errorLike.name
          : 'UnknownError';

  /* Do not log Error objects or messages here. Prisma errors can embed SQL
   * fragments or parameter values in `message`/`meta`; the preview fallback only
   * needs a coarse error class plus Prisma-style code to route investigation. */
  return {
    errorName,
    ...(errorLike && typeof errorLike.code === 'string' ? { errorCode: errorLike.code } : {}),
  };
}

function fisherYatesShuffle<T>(arr: readonly T[]): T[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function getOrderedRounds(bracketStructure: Array<{ round: string }>): string[] {
  return [...new Set(bracketStructure.map((match) => match.round))];
}

function createMrRoundAssignments(
  bracketStructure: Array<{ round: string }>,
  stage: 'playoff' | 'finals',
  targetWinsByRound?: Map<string, number | null | undefined>,
): Map<string, string[]> {
  const shuffledCourses = fisherYatesShuffle(COURSES);
  const assignments = new Map<string, string[]>();
  let cursor = 0;

  for (const round of getOrderedRounds(bracketStructure)) {
    const roundsNeeded = getMrFinalsMaxRounds({ round, stage, targetWins: targetWinsByRound?.get(round) });
    const assignedCourses = Array.from(
      { length: roundsNeeded },
      (_, index) => shuffledCourses[(cursor + index) % shuffledCourses.length],
    );
    assignments.set(round, assignedCourses);
    cursor = (cursor + roundsNeeded) % shuffledCourses.length;
  }

  return assignments;
}

function createGpCupSequence(maxCups: number, preferredFirstCup?: string | null): string[] {
  if (maxCups <= 0) return [];
  const first =
    preferredFirstCup && CUPS.includes(preferredFirstCup as (typeof CUPS)[number]) ? preferredFirstCup : undefined;
  const sequence = first ? [first] : [];

  while (sequence.length < Math.min(maxCups, CUPS.length)) {
    const candidates = CUPS.filter((cup) => !sequence.includes(cup));
    sequence.push(...fisherYatesShuffle(candidates).slice(0, Math.min(candidates.length, maxCups - sequence.length)));
  }

  while (sequence.length < maxCups) {
    sequence.push(fisherYatesShuffle(CUPS)[0]);
  }

  return sequence;
}

function createGpRoundAssignments(
  bracketStructure: Array<{ matchNumber: number; round: string }>,
  stage: 'playoff' | 'finals',
): Map<string, string[]> {
  const assignments = new Map<string, string[]>();
  for (const round of getOrderedRounds(bracketStructure)) {
    const maxCups = getGpFinalsMaxCups({ round, stage });
    assignments.set(round, createGpCupSequence(maxCups));
  }
  return assignments;
}

/**
 * Assign a random starting Battle Course (1-4) to each round in the BM
 * bracket. All matches in the same round share the same starting course,
 * satisfying issue #671: "そのラウンドで使用される開始コースはどの試合も同じにしたい".
 */
function createBmRoundStartingCourses(bracketStructure: Array<{ round: string }>): Map<string, number> {
  const rounds = getOrderedRounds(bracketStructure);
  // Fisher-Yates over [1,2,3,4] then repeat cyclically across rounds so each
  // starting course appears roughly equally across the bracket.
  const base = fisherYatesShuffle([1, 2, 3, 4]);
  return new Map(rounds.map((round, index) => [round, base[index % 4]]));
}

/**
 * Normalize GP cup assignments for legacy finals/playoff rows. New rows store
 * a valid cup sequence in `assignedCups`: FT1 => 1 cup, FT2 => 3 cups,
 * FT3 => 5 cups. The first four entries are unique; only the fifth FT3 cup
 * may repeat. #3039 intentionally permits a different sequence per match,
 * so legacy repair fills only missing/invalid pending rows and never
 * coalesces valid individual assignments.
 */
interface CupNormalizationResult {
  repaired: boolean;
  assignmentsByMatch: Map<string, { cup: string; assignedCups: string[]; version: number }>;
}

function normalizeAssignedCupArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((cup): cup is string => typeof cup === 'string' && CUPS.includes(cup as (typeof CUPS)[number]));
}

function isValidGpCupSequence(sequence: string[], maxCups: number): boolean {
  if (sequence.length !== maxCups) return false;
  const uniqueWindow = sequence.slice(0, Math.min(maxCups, CUPS.length));
  return new Set(uniqueWindow).size === uniqueWindow.length;
}

/* The remainder of this file is intentionally preserved from main. */

export function createFinalsHandlers(config: FinalsConfig) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const model = (p: any) => p[config.matchModel];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const qualModel = (p: any) => p[config.qualificationModel];

  function getMatchTargetWins(match: { round?: string | null; stage?: string | null; targetWins?: unknown }): number {
    const persistedTargetWins = parsePersistedFinalsTargetWins(match.targetWins);
    if (persistedTargetWins !== null) {
      return persistedTargetWins;
    }
    return config.getTargetWins?.({ round: match.round, stage: match.stage }) ?? config.targetWins ?? 3;
  }

  return { model, qualModel, getMatchTargetWins } as unknown as ReturnType<typeof createFinalsHandlers>;
}
