import { COURSE_INFO } from '@/lib/constants';
import { getCdmQualificationRoundFixture } from '@/lib/cdm-qualification-round-fixtures';
import { GROUPS } from '@/lib/group-utils';
import {
  BREAK_PLAYER_ID,
  generateRoundRobinSchedule,
  getByeMatchData,
  getScheduleOnlyBreakData,
} from '@/lib/round-robin';

export type CdmReconciliationMode = 'bm' | 'mr' | 'gp';

export type CdmReconciliationQualification = {
  playerId: string;
  group: string;
  seeding: number | null;
};

export type CdmReconciliationMatch = {
  id: string;
  matchNumber: number;
  roundNumber: number | null;
  stage: string;
  isBye: boolean;
  player1Id: string | null;
  player2Id: string | null;
  player1Side: number;
  player2Side: number;
  completed: boolean;
  version: number;
  tvNumber?: number | null;

  score1?: number;
  score2?: number;
  points1?: number;
  points2?: number;
  scoresConfirmed?: boolean;
  cup?: string | null;
  assignedCourses?: unknown;
  rounds?: unknown;
  races?: unknown;
  player1ReportedScore1?: number | null;
  player1ReportedScore2?: number | null;
  player2ReportedScore1?: number | null;
  player2ReportedScore2?: number | null;
  player1ReportedPoints1?: number | null;
  player1ReportedPoints2?: number | null;
  player1ReportedRaces?: unknown;
  player2ReportedPoints1?: number | null;
  player2ReportedPoints2?: number | null;
  player2ReportedRaces?: unknown;
};

export type CdmReconciliationModeInput = {
  qualifications: CdmReconciliationQualification[];
  matches: CdmReconciliationMatch[];
};

export type CdmReconciliationInput = Record<CdmReconciliationMode, CdmReconciliationModeInput>;

export type CdmReconciliationRow = CdmReconciliationMatch & {
  mode: CdmReconciliationMode;
  group: string;
};

export type CdmReconciliationBreakRow = Omit<CdmReconciliationRow, 'id' | 'version'>;

export type CdmReconciliationModePlan = {
  mode: CdmReconciliationMode;
  skipped: boolean;
  retainedRows: CdmReconciliationRow[];
  createBreakRows: CdmReconciliationBreakRow[];
  deleteBreakIds: string[];
  sourceMatchCount: number;
  realMatchCount: number;
  targetMatchCount: number;
  movedMatches: number;
  sideSwaps: number;
  courseUpdates: number;
  cupUpdates: number;
  createdBreaks: number;
  deletedBreaks: number;
};

export type CdmQualificationReconciliationPlan = {
  modes: Record<CdmReconciliationMode, CdmReconciliationModePlan>;
  totalChanges: number;
  digestPayload: unknown;
};

export class CdmQualificationReconciliationError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'CdmQualificationReconciliationError';
  }
}

const MODE_ORDER: readonly CdmReconciliationMode[] = ['bm', 'mr', 'gp'];

function pairKey(player1Id: string, player2Id: string): string {
  return player1Id < player2Id ? `${player1Id}\u0000${player2Id}` : `${player2Id}\u0000${player1Id}`;
}

function jsonEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

function swapNumericWinner(value: unknown): unknown {
  if (value === 1) return 2;
  if (value === 2) return 1;
  return value;
}

function swapSideIndexedJson(value: unknown): unknown {
  if (!Array.isArray(value)) return value;

  return value.map((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return item;
    const source = item as Record<string, unknown>;
    const next: Record<string, unknown> = { ...source };
    const swap = (left: string, right: string) => {
      if (!(left in source) && !(right in source)) return;
      next[left] = source[right];
      next[right] = source[left];
    };

    swap('score1', 'score2');
    swap('points1', 'points2');
    swap('position1', 'position2');
    swap('player1', 'player2');
    if ('winner' in source) next.winner = swapNumericWinner(source.winner);
    return next;
  });
}

function alignCourseNames(value: unknown, courses: readonly string[]): unknown {
  if (!Array.isArray(value)) return value;
  return value.map((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item) || index >= courses.length) return item;
    return { ...(item as Record<string, unknown>), course: courses[index] };
  });
}

function gpCoursesForCup(cup: string): string[] {
  return COURSE_INFO.filter((course) => course.cup === cup).map((course) => course.abbr);
}

function baseTargetRow(
  mode: CdmReconciliationMode,
  source: CdmReconciliationMatch,
  group: string,
  matchNumber: number,
  roundNumber: number,
  player1Id: string,
  player2Id: string,
  isBye: boolean,
): CdmReconciliationRow {
  return {
    ...source,
    mode,
    group,
    matchNumber,
    roundNumber,
    stage: 'qualification',
    isBye,
    player1Id,
    player2Id,
    player1Side: 1,
    player2Side: 2,
  };
}

function orientRealMatch(
  mode: CdmReconciliationMode,
  source: CdmReconciliationMatch,
  group: string,
  matchNumber: number,
  roundNumber: number,
  targetPlayer1Id: string,
  targetPlayer2Id: string,
): { row: CdmReconciliationRow; swapped: boolean; courseChanged: boolean; cupChanged: boolean } {
  const sameOrientation = source.player1Id === targetPlayer1Id && source.player2Id === targetPlayer2Id;
  const reversedOrientation = source.player1Id === targetPlayer2Id && source.player2Id === targetPlayer1Id;
  if (!sameOrientation && !reversedOrientation) {
    throw new CdmQualificationReconciliationError(
      'Existing match does not contain the target player pair',
      'PAIR_MISMATCH',
      { matchId: source.id, targetPlayer1Id, targetPlayer2Id },
    );
  }

  let row = baseTargetRow(
    mode,
    source,
    group,
    matchNumber,
    roundNumber,
    targetPlayer1Id,
    targetPlayer2Id,
    false,
  );

  if (reversedOrientation) {
    if (mode === 'bm') {
      row = {
        ...row,
        score1: source.score2 ?? 0,
        score2: source.score1 ?? 0,
        rounds: swapSideIndexedJson(source.rounds),
        player1ReportedScore1: source.player2ReportedScore2 ?? null,
        player1ReportedScore2: source.player2ReportedScore1 ?? null,
        player2ReportedScore1: source.player1ReportedScore2 ?? null,
        player2ReportedScore2: source.player1ReportedScore1 ?? null,
      };
    } else {
      row = {
        ...row,
        ...(mode === 'mr'
          ? { score1: source.score2 ?? 0, score2: source.score1 ?? 0 }
          : { points1: source.points2 ?? 0, points2: source.points1 ?? 0 }),
        rounds: swapSideIndexedJson(source.rounds),
        races: swapSideIndexedJson(source.races),
        player1ReportedPoints1: source.player2ReportedPoints2 ?? null,
        player1ReportedPoints2: source.player2ReportedPoints1 ?? null,
        player1ReportedRaces: swapSideIndexedJson(source.player2ReportedRaces),
        player2ReportedPoints1: source.player1ReportedPoints2 ?? null,
        player2ReportedPoints2: source.player1ReportedPoints1 ?? null,
        player2ReportedRaces: swapSideIndexedJson(source.player1ReportedRaces),
      };
    }
  }

  let courseChanged = false;
  let cupChanged = false;
  if (mode === 'mr') {
    const fixture = getCdmQualificationRoundFixture(roundNumber);
    courseChanged = !jsonEqual(source.assignedCourses, fixture.courses);
    row = {
      ...row,
      assignedCourses: [...fixture.courses],
      rounds: alignCourseNames(row.rounds, fixture.courses),
      player1ReportedRaces: alignCourseNames(row.player1ReportedRaces, fixture.courses),
      player2ReportedRaces: alignCourseNames(row.player2ReportedRaces, fixture.courses),
    };
  } else if (mode === 'gp') {
    const fixture = getCdmQualificationRoundFixture(roundNumber);
    const courses = gpCoursesForCup(fixture.cup);
    cupChanged = source.cup !== fixture.cup;
    row = {
      ...row,
      cup: fixture.cup,
      races: alignCourseNames(row.races, courses),
      player1ReportedRaces: alignCourseNames(row.player1ReportedRaces, courses),
      player2ReportedRaces: alignCourseNames(row.player2ReportedRaces, courses),
    };
  }

  return { row, swapped: reversedOrientation, courseChanged, cupChanged };
}

function buildBreakRow(
  mode: CdmReconciliationMode,
  source: CdmReconciliationMatch | null,
  group: string,
  matchNumber: number,
  roundNumber: number,
  player1Id: string,
  player2Id: string,
): CdmReconciliationRow | CdmReconciliationBreakRow {
  const breakVsBreak = player1Id === BREAK_PLAYER_ID && player2Id === BREAK_PLAYER_ID;
  const scoreData = breakVsBreak ? getScheduleOnlyBreakData(mode) : getByeMatchData(mode);
  const base = {
    ...(source ?? {}),
    mode,
    group,
    matchNumber,
    roundNumber,
    stage: 'qualification',
    isBye: true,
    player1Id,
    player2Id,
    player1Side: 1,
    player2Side: 2,
    completed: true,
    tvNumber: source?.tvNumber ?? null,
    assignedCourses: null,
    rounds: null,
    races: null,
    cup: null,
    player1ReportedScore1: null,
    player1ReportedScore2: null,
    player2ReportedScore1: null,
    player2ReportedScore2: null,
    player1ReportedPoints1: null,
    player1ReportedPoints2: null,
    player1ReportedRaces: null,
    player2ReportedPoints1: null,
    player2ReportedPoints2: null,
    player2ReportedRaces: null,
    ...scoreData,
  };

  if (source) {
    return { ...base, id: source.id, version: source.version } as CdmReconciliationRow;
  }
  return base as CdmReconciliationBreakRow;
}

function relevantRowState(row: CdmReconciliationMatch): unknown {
  return {
    id: row.id,
    version: row.version,
    matchNumber: row.matchNumber,
    roundNumber: row.roundNumber,
    isBye: row.isBye,
    player1Id: row.player1Id,
    player2Id: row.player2Id,
    player1Side: row.player1Side,
    player2Side: row.player2Side,
    completed: row.completed,
    score1: row.score1 ?? null,
    score2: row.score2 ?? null,
    points1: row.points1 ?? null,
    points2: row.points2 ?? null,
    scoresConfirmed: row.scoresConfirmed ?? null,
    cup: row.cup ?? null,
    assignedCourses: row.assignedCourses ?? null,
    rounds: row.rounds ?? null,
    races: row.races ?? null,
    player1ReportedScore1: row.player1ReportedScore1 ?? null,
    player1ReportedScore2: row.player1ReportedScore2 ?? null,
    player2ReportedScore1: row.player2ReportedScore1 ?? null,
    player2ReportedScore2: row.player2ReportedScore2 ?? null,
    player1ReportedPoints1: row.player1ReportedPoints1 ?? null,
    player1ReportedPoints2: row.player1ReportedPoints2 ?? null,
    player1ReportedRaces: row.player1ReportedRaces ?? null,
    player2ReportedPoints1: row.player2ReportedPoints1 ?? null,
    player2ReportedPoints2: row.player2ReportedPoints2 ?? null,
    player2ReportedRaces: row.player2ReportedRaces ?? null,
  };
}

function countMoved(source: CdmReconciliationMatch, target: CdmReconciliationRow): boolean {
  return (
    source.matchNumber !== target.matchNumber ||
    source.roundNumber !== target.roundNumber ||
    source.player1Id !== target.player1Id ||
    source.player2Id !== target.player2Id ||
    source.player1Side !== target.player1Side ||
    source.player2Side !== target.player2Side
  );
}

function buildModePlan(
  mode: CdmReconciliationMode,
  input: CdmReconciliationModeInput,
): CdmReconciliationModePlan {
  const qualificationMatches = input.matches.filter((match) => match.stage === 'qualification');
  if (input.qualifications.length === 0 && qualificationMatches.length === 0) {
    return {
      mode,
      skipped: true,
      retainedRows: [],
      createBreakRows: [],
      deleteBreakIds: [],
      sourceMatchCount: 0,
      realMatchCount: 0,
      targetMatchCount: 0,
      movedMatches: 0,
      sideSwaps: 0,
      courseUpdates: 0,
      cupUpdates: 0,
      createdBreaks: 0,
      deletedBreaks: 0,
    };
  }

  if (input.qualifications.length === 0 || qualificationMatches.length === 0) {
    throw new CdmQualificationReconciliationError(
      `${mode.toUpperCase()} qualification data is incomplete`,
      'INCOMPLETE_MODE_DATA',
      { mode, qualificationCount: input.qualifications.length, matchCount: qualificationMatches.length },
    );
  }

  for (const match of qualificationMatches) {
    if (!Number.isInteger(match.matchNumber) || match.matchNumber < 1) {
      throw new CdmQualificationReconciliationError(
        'Qualification match numbers must be positive integers',
        'INVALID_MATCH_NUMBER',
        { mode, matchId: match.id, matchNumber: match.matchNumber },
      );
    }
  }

  const groups = new Map<string, CdmReconciliationQualification[]>();
  for (const qualification of input.qualifications) {
    if (!(GROUPS as readonly string[]).includes(qualification.group)) {
      throw new CdmQualificationReconciliationError('Unknown qualification group', 'INVALID_GROUP', {
        mode,
        group: qualification.group,
      });
    }
    const bucket = groups.get(qualification.group) ?? [];
    bucket.push(qualification);
    groups.set(qualification.group, bucket);
  }

  const orderedGroups = (GROUPS as readonly string[]).filter((group) => groups.has(group));
  const playerGroup = new Map<string, string>();
  for (const group of orderedGroups) {
    const bucket = groups.get(group)!;
    const seeds = bucket.map((entry) => entry.seeding);
    if (
      seeds.some((seed) => !Number.isInteger(seed) || (seed as number) < 1) ||
      new Set(seeds).size !== seeds.length
    ) {
      throw new CdmQualificationReconciliationError(
        'CDM reconciliation requires unique positive integer seeds in every group',
        'INVALID_CDM_SEED_ORDER',
        { mode, group },
      );
    }
    bucket.sort((a, b) => (a.seeding as number) - (b.seeding as number));
    for (const entry of bucket) {
      if (playerGroup.has(entry.playerId)) {
        throw new CdmQualificationReconciliationError(
          'A player appears in multiple qualification groups',
          'DUPLICATE_PLAYER',
          { mode, playerId: entry.playerId },
        );
      }
      playerGroup.set(entry.playerId, group);
    }
  }

  const realMatchByPair = new Map<string, CdmReconciliationMatch>();
  const existingByes = qualificationMatches
    .filter((match) => match.isBye)
    .sort((a, b) => a.matchNumber - b.matchNumber || a.id.localeCompare(b.id));
  for (const match of qualificationMatches.filter((candidate) => !candidate.isBye)) {
    if (
      !match.player1Id ||
      !match.player2Id ||
      match.player1Id === BREAK_PLAYER_ID ||
      match.player2Id === BREAK_PLAYER_ID
    ) {
      throw new CdmQualificationReconciliationError(
        'A competitive match has an unresolved or BREAK participant',
        'INVALID_REAL_MATCH',
        { mode, matchId: match.id },
      );
    }
    const group1 = playerGroup.get(match.player1Id);
    const group2 = playerGroup.get(match.player2Id);
    if (!group1 || group1 !== group2) {
      throw new CdmQualificationReconciliationError(
        'A qualification match crosses groups or contains an unknown player',
        'GROUP_MISMATCH',
        { mode, matchId: match.id },
      );
    }
    const key = pairKey(match.player1Id, match.player2Id);
    if (realMatchByPair.has(key)) {
      throw new CdmQualificationReconciliationError('Duplicate competitive player pair', 'DUPLICATE_PAIR', {
        mode,
        player1Id: match.player1Id,
        player2Id: match.player2Id,
      });
    }
    realMatchByPair.set(key, match);
  }

  const retainedRows: CdmReconciliationRow[] = [];
  const createBreakRows: CdmReconciliationBreakRow[] = [];
  let nextMatchNumber = 1;
  let byeCursor = 0;
  let movedMatches = 0;
  let sideSwaps = 0;
  let courseUpdates = 0;
  let cupUpdates = 0;

  for (const group of orderedGroups) {
    const players = groups.get(group)!.map((entry) => entry.playerId);
    const schedule = generateRoundRobinSchedule(players, { method: 'cdm' });
    for (const target of schedule.matches) {
      if (!target.isBye) {
        const key = pairKey(target.player1Id, target.player2Id);
        const source = realMatchByPair.get(key);
        if (!source) {
          throw new CdmQualificationReconciliationError(
            'A CDM fixture pair has no existing competitive match',
            'MISSING_PAIR',
            { mode, group, player1Id: target.player1Id, player2Id: target.player2Id },
          );
        }
        realMatchByPair.delete(key);
        const oriented = orientRealMatch(
          mode,
          source,
          group,
          nextMatchNumber,
          target.day,
          target.player1Id,
          target.player2Id,
        );
        retainedRows.push(oriented.row);
        if (countMoved(source, oriented.row)) movedMatches++;
        if (oriented.swapped) sideSwaps++;
        if (oriented.courseChanged) courseUpdates++;
        if (oriented.cupChanged) cupUpdates++;
      } else {
        const source = existingByes[byeCursor++] ?? null;
        const row = buildBreakRow(
          mode,
          source,
          group,
          nextMatchNumber,
          target.day,
          target.player1Id,
          target.player2Id,
        );
        if ('id' in row) {
          retainedRows.push(row);
          if (source && countMoved(source, row)) movedMatches++;
        } else {
          createBreakRows.push(row);
        }
      }
      nextMatchNumber++;
    }
  }

  if (realMatchByPair.size > 0) {
    throw new CdmQualificationReconciliationError(
      'Existing competitive matches are not present in the CDM fixture',
      'EXTRA_PAIR',
      { mode, matchIds: [...realMatchByPair.values()].map((match) => match.id) },
    );
  }

  const deleteBreakIds = existingByes.slice(byeCursor).map((match) => match.id);
  return {
    mode,
    skipped: false,
    retainedRows,
    createBreakRows,
    deleteBreakIds,
    sourceMatchCount: qualificationMatches.length,
    realMatchCount: retainedRows.filter((row) => !row.isBye).length,
    targetMatchCount: retainedRows.length + createBreakRows.length,
    movedMatches,
    sideSwaps,
    courseUpdates,
    cupUpdates,
    createdBreaks: createBreakRows.length,
    deletedBreaks: deleteBreakIds.length,
  };
}

export function buildCdmQualificationReconciliationPlan(
  input: CdmReconciliationInput,
): CdmQualificationReconciliationPlan {
  const modes = Object.fromEntries(MODE_ORDER.map((mode) => [mode, buildModePlan(mode, input[mode])])) as Record<
    CdmReconciliationMode,
    CdmReconciliationModePlan
  >;
  const totalChanges = MODE_ORDER.reduce((sum, mode) => {
    const plan = modes[mode];
    return (
      sum +
      plan.movedMatches +
      plan.courseUpdates +
      plan.cupUpdates +
      plan.createdBreaks +
      plan.deletedBreaks
    );
  }, 0);

  const digestPayload = {
    source: Object.fromEntries(
      MODE_ORDER.map((mode) => [
        mode,
        {
          qualifications: [...input[mode].qualifications]
            .map((entry) => ({ playerId: entry.playerId, group: entry.group, seeding: entry.seeding }))
            .sort((a, b) => a.group.localeCompare(b.group) || (a.seeding ?? 0) - (b.seeding ?? 0)),
          matches: input[mode].matches
            .filter((match) => match.stage === 'qualification')
            .map(relevantRowState)
            .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
        },
      ]),
    ),
    target: Object.fromEntries(
      MODE_ORDER.map((mode) => [
        mode,
        {
          retainedRows: modes[mode].retainedRows.map(relevantRowState),
          createBreakRows: modes[mode].createBreakRows,
          deleteBreakIds: modes[mode].deleteBreakIds,
        },
      ]),
    ),
  };

  return { modes, totalChanges, digestPayload };
}

export async function digestCdmQualificationReconciliationPlan(
  plan: CdmQualificationReconciliationPlan,
): Promise<string> {
  const encoded = new TextEncoder().encode(JSON.stringify(plan.digestPayload));
  const digest = await crypto.subtle.digest('SHA-256', encoded);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function isJsmkcTournamentIdentity(tournament: { name: string; slug?: string | null }): boolean {
  const identity = `${tournament.name} ${tournament.slug ?? ''}`;
  return /(^|[^a-z0-9])jsmkc([^a-z0-9]|$)/i.test(identity);
}
