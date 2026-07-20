import { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import type { TournamentArchiveBundle } from '@/lib/tournament-archive';
import { retryDbRead } from '@/lib/db-read-retry';

const DATE_FIELDS = new Set([
  'rankOverrideAt',
  'combinedRankOverrideAt',
  'slotOverrideAt',
  'deletedAt',
  'createdAt',
  'updatedAt',
  'submittedAt',
]);

// Cloudflare D1 accepts roughly 100 bound parameters per statement. Keep restore
// batches at 80 parameters to leave a 20% margin for Prisma-generated bindings
// and future schema changes without exceeding the platform limit.
const D1_SAFE_BOUND_PARAMETERS = 80;

const NULLABLE_JSON_FIELDS = {
  bmMatch: ['assignedCourses', 'rounds'],
  mrMatch: ['assignedCourses', 'rounds', 'player1ReportedRaces', 'player2ReportedRaces'],
  gpMatch: ['races', 'assignedCups', 'cupResults', 'player1ReportedRaces', 'player2ReportedRaces'],
  ttEntry: ['times', 'courseScores'],
  ttPhaseRound: ['eliminatedIds'],
  ttSuddenDeathRound: ['results'],
} as const;

const RESTORED_TOURNAMENT_SELECT = {
  id: true,
  slug: true,
  name: true,
  date: true,
  status: true,
  taPlayerSelfEdit: true,
  taBattleRoyaleMode: true,
  frozenStages: true,
  qualificationConfirmed: true,
  bmQualificationConfirmed: true,
  mrQualificationConfirmed: true,
  gpQualificationConfirmed: true,
  publicModes: true,
  createdAt: true,
  updatedAt: true,
} as const satisfies Prisma.TournamentSelect;

type RestoredTournament = Prisma.TournamentGetPayload<{ select: typeof RESTORED_TOURNAMENT_SELECT }>;

type ArchivedPlayer = {
  id: string;
  name: string;
  nickname: string;
  country?: string | null;
  noCamera?: boolean;
};

type ArchivedRecord = Record<string, unknown>;
type RestoreStageError = Error & { restoreStage: string; cause?: unknown; code?: unknown };

type RestoreResult = {
  tournament: RestoredTournament;
  restoredPlayerCount: number;
  reusedPlayerCount: number;
};

function asRecord(value: unknown): ArchivedRecord {
  return value && typeof value === 'object' ? (value as ArchivedRecord) : {};
}

function asDate(value: unknown, fallback = new Date()): Date {
  if (value instanceof Date) return value;
  const date = new Date(String(value ?? ''));
  return Number.isNaN(date.getTime()) ? fallback : date;
}

function normalizeDateFields(record: ArchivedRecord): ArchivedRecord {
  const normalized = { ...record };
  for (const field of DATE_FIELDS) {
    if (normalized[field] !== undefined && normalized[field] !== null) {
      normalized[field] = asDate(normalized[field]);
    }
  }
  return normalized;
}

function normalizeNullableJsonFields(record: ArchivedRecord, fields: readonly string[]): ArchivedRecord {
  const normalized = { ...record };
  for (const field of fields) {
    if (normalized[field] === null) normalized[field] = Prisma.DbNull;
  }
  return normalized;
}

function normalizeRequiredJson(value: unknown, fallback: Prisma.InputJsonValue): Prisma.InputJsonValue {
  return value === undefined || value === null ? fallback : (value as Prisma.InputJsonValue);
}

function remapPlayerId(value: unknown, playerIds: Map<string, string>): unknown {
  return typeof value === 'string' ? (playerIds.get(value) ?? value) : value;
}

function remapPlayerIdsDeep(value: unknown, playerIds: Map<string, string>): unknown {
  if (Array.isArray(value)) return value.map((entry) => remapPlayerIdsDeep(entry, playerIds));
  if (!value || typeof value !== 'object') return remapPlayerId(value, playerIds);

  return Object.fromEntries(
    Object.entries(value as ArchivedRecord).map(([key, entry]) => [key, remapPlayerIdsDeep(entry, playerIds)]),
  );
}

function cleanArchivedRow(value: unknown, tournamentId: string): ArchivedRecord {
  const row = normalizeDateFields(asRecord(value));
  delete row.player;
  delete row.player1;
  delete row.player2;
  delete row._rank;
  delete row._rankOverridden;
  row.tournamentId = tournamentId;
  return row;
}

function createRestoreStageError(stage: string, cause: unknown): RestoreStageError {
  const error = Object.assign(new Error(`Archive restore failed at ${stage}`), {
    restoreStage: stage,
    cause,
  }) as RestoreStageError;
  if (cause && typeof cause === 'object' && 'code' in cause) error.code = cause.code;
  return error;
}

async function runRestoreStage<T>(stage: string, action: () => Promise<T>): Promise<T> {
  try {
    return await action();
  } catch (cause) {
    if (cause && typeof cause === 'object' && 'restoreStage' in cause) throw cause;
    throw createRestoreStageError(stage, cause);
  }
}

export function chunkRowsForD1<T extends object>(rows: T[], maxBoundParameters = D1_SAFE_BOUND_PARAMETERS): T[][] {
  if (maxBoundParameters < 1) throw new Error('maxBoundParameters must be positive');

  const chunks: T[][] = [];
  let current: T[] = [];
  let currentBindings = 0;

  for (const row of rows) {
    const rowBindings = Object.values(row).filter((value) => value !== undefined).length;
    if (rowBindings > maxBoundParameters) {
      throw new Error(`A single archive row requires ${rowBindings} bound parameters`);
    }

    if (current.length > 0 && currentBindings + rowBindings > maxBoundParameters) {
      chunks.push(current);
      current = [];
      currentBindings = 0;
    }

    current.push(row);
    currentBindings += rowBindings;
  }

  if (current.length > 0) chunks.push(current);
  return chunks;
}

async function createManyInD1Chunks<T extends object>(
  stage: string,
  rows: T[],
  write: (chunk: T[]) => Promise<unknown>,
): Promise<void> {
  for (const chunk of chunkRowsForD1(rows)) {
    await runRestoreStage(stage, () => write(chunk));
  }
}

function collectArchivedPlayers(bundle: TournamentArchiveBundle): ArchivedPlayer[] {
  const players = new Map<string, ArchivedPlayer>();
  const remember = (value: unknown) => {
    const player = asRecord(value);
    if (typeof player.id !== 'string' || typeof player.name !== 'string' || typeof player.nickname !== 'string') return;
    players.set(player.id, player as ArchivedPlayer);
  };

  for (const player of bundle.allPlayers ?? []) remember(player);
  for (const entry of bundle.modes.ta.entries ?? []) remember(asRecord(entry).player);
  for (const mode of [bundle.modes.bm, bundle.modes.mr, bundle.modes.gp]) {
    for (const qualification of mode.qualifications ?? []) remember(asRecord(qualification).player);
    for (const match of mode.matches ?? []) {
      remember(asRecord(match).player1);
      remember(asRecord(match).player2);
    }
  }
  return [...players.values()];
}

async function restorePlayers(bundle: TournamentArchiveBundle): Promise<{
  playerIds: Map<string, string>;
  restoredPlayerCount: number;
  reusedPlayerCount: number;
}> {
  const playerIds = new Map<string, string>();
  let restoredPlayerCount = 0;
  let reusedPlayerCount = 0;

  for (const archived of collectArchivedPlayers(bundle)) {
    const existingById = await prisma.player.findUnique({ where: { id: archived.id }, select: { id: true } });
    if (existingById) {
      playerIds.set(archived.id, existingById.id);
      reusedPlayerCount += 1;
      continue;
    }

    const existingByNickname = await prisma.player.findUnique({
      where: { nickname: archived.nickname },
      select: { id: true },
    });
    if (existingByNickname) {
      playerIds.set(archived.id, existingByNickname.id);
      reusedPlayerCount += 1;
      continue;
    }

    const created = await prisma.player.create({
      data: {
        id: archived.id,
        name: archived.name,
        nickname: archived.nickname,
        country: archived.country ?? null,
        noCamera: archived.noCamera === true,
      },
      select: { id: true },
    });
    playerIds.set(archived.id, created.id);
    restoredPlayerCount += 1;
  }

  return { playerIds, restoredPlayerCount, reusedPlayerCount };
}

function qualificationRows(
  values: unknown[] | undefined,
  tournamentId: string,
  playerIds: Map<string, string>,
): ArchivedRecord[] {
  return (values ?? []).map((value) => {
    const row = cleanArchivedRow(value, tournamentId);
    row.playerId = remapPlayerId(row.playerId, playerIds);
    return row;
  });
}

function matchRows(
  values: unknown[] | undefined,
  tournamentId: string,
  playerIds: Map<string, string>,
  nullableJsonFields: readonly string[],
): ArchivedRecord[] {
  return (values ?? []).map((value) => {
    const row = cleanArchivedRow(value, tournamentId);
    row.player1Id = remapPlayerId(row.player1Id, playerIds);
    row.player2Id = remapPlayerId(row.player2Id, playerIds);
    if (row.suddenDeathWinnerId !== undefined && row.suddenDeathWinnerId !== null) {
      row.suddenDeathWinnerId = remapPlayerId(row.suddenDeathWinnerId, playerIds);
    }
    return normalizeNullableJsonFields(row, nullableJsonFields);
  });
}

function ttEntryRows(bundle: TournamentArchiveBundle, tournamentId: string, playerIds: Map<string, string>) {
  return (bundle.modes.ta.entries ?? []).map((value) => {
    const row = cleanArchivedRow(value, tournamentId);
    row.playerId = remapPlayerId(row.playerId, playerIds);
    if (row.partnerId !== undefined && row.partnerId !== null) {
      row.partnerId = remapPlayerId(row.partnerId, playerIds);
    }
    return normalizeNullableJsonFields(row, NULLABLE_JSON_FIELDS.ttEntry);
  });
}

function ttPhaseRoundRows(bundle: TournamentArchiveBundle, tournamentId: string, playerIds: Map<string, string>) {
  return (bundle.modes.ta.phaseRounds ?? []).map((value) => {
    const row = cleanArchivedRow(value, tournamentId);
    const remappedResults = remapPlayerIdsDeep(row.results, playerIds);
    row.results = remappedResults === null || remappedResults === undefined ? [] : remappedResults;
    row.eliminatedIds = remapPlayerIdsDeep(row.eliminatedIds, playerIds);
    return normalizeNullableJsonFields(row, NULLABLE_JSON_FIELDS.ttPhaseRound);
  });
}

function ttSuddenDeathRows(bundle: TournamentArchiveBundle, tournamentId: string, playerIds: Map<string, string>) {
  const ta = bundle.modes.ta as TournamentArchiveBundle['modes']['ta'] & { suddenDeathRounds?: unknown[] };
  return (ta.suddenDeathRounds ?? []).map((value) => {
    const row = cleanArchivedRow(value, tournamentId);
    const remappedTargetPlayerIds = remapPlayerIdsDeep(row.targetPlayerIds, playerIds);
    row.targetPlayerIds =
      remappedTargetPlayerIds === null || remappedTargetPlayerIds === undefined ? [] : remappedTargetPlayerIds;
    row.results = remapPlayerIdsDeep(row.results, playerIds);
    return normalizeNullableJsonFields(row, NULLABLE_JSON_FIELDS.ttSuddenDeathRound);
  });
}

function tournamentScoreRows(bundle: TournamentArchiveBundle, tournamentId: string, playerIds: Map<string, string>) {
  return (bundle.overallRanking.rankings ?? []).map((ranking) => ({
    tournamentId,
    playerId: playerIds.get(ranking.playerId) ?? ranking.playerId,
    taQualificationPoints: ranking.taQualificationPoints,
    bmQualificationPoints: ranking.bmQualificationPoints,
    mrQualificationPoints: ranking.mrQualificationPoints,
    gpQualificationPoints: ranking.gpQualificationPoints,
    taFinalsPoints: ranking.taFinalsPoints,
    bmFinalsPoints: ranking.bmFinalsPoints,
    mrFinalsPoints: ranking.mrFinalsPoints,
    gpFinalsPoints: ranking.gpFinalsPoints,
    totalPoints: ranking.totalPoints,
    overallRank: ranking.overallRank,
  }));
}

/**
 * Recreates a deleted live tournament from its immutable R2 archive and opens
 * it for corrections. The archive remains untouched and will be replaced by a
 * fresh snapshot the next time the tournament is completed.
 */
export async function restoreTournamentArchiveForReopen(bundle: TournamentArchiveBundle): Promise<RestoreResult> {
  const tournamentId = bundle.tournament.id;
  const existing = await runRestoreStage('existing tournament lookup', () =>
    retryDbRead(() =>
      prisma.tournament.findUnique({
        where: { id: tournamentId },
        select: RESTORED_TOURNAMENT_SELECT,
      }),
    ),
  );
  if (existing) {
    return { tournament: existing, restoredPlayerCount: 0, reusedPlayerCount: 0 };
  }

  const { playerIds, restoredPlayerCount, reusedPlayerCount } = await runRestoreStage('players', () =>
    restorePlayers(bundle),
  );
  let tournamentCreated = false;

  try {
    await runRestoreStage('tournament', () =>
      prisma.tournament.create({
        data: {
          id: tournamentId,
          slug: bundle.tournament.slug,
          name: bundle.tournament.name,
          date: asDate(bundle.tournament.date),
          status: 'active',
          taPlayerSelfEdit: bundle.tournament.taPlayerSelfEdit,
          taBattleRoyaleMode: bundle.tournament.taBattleRoyaleMode,
          frozenStages: normalizeRequiredJson(bundle.tournament.frozenStages, []),
          qualificationConfirmed:
            bundle.tournament.bmQualificationConfirmed ||
            bundle.tournament.mrQualificationConfirmed ||
            bundle.tournament.gpQualificationConfirmed,
          bmQualificationConfirmed: bundle.tournament.bmQualificationConfirmed,
          mrQualificationConfirmed: bundle.tournament.mrQualificationConfirmed,
          gpQualificationConfirmed: bundle.tournament.gpQualificationConfirmed,
          publicModes: [],
          createdAt: asDate(bundle.tournament.createdAt),
          updatedAt: new Date(),
        },
      }),
    );
    tournamentCreated = true;

    const bmQualifications = qualificationRows(bundle.modes.bm.qualifications, tournamentId, playerIds);
    const mrQualifications = qualificationRows(bundle.modes.mr.qualifications, tournamentId, playerIds);
    const gpQualifications = qualificationRows(bundle.modes.gp.qualifications, tournamentId, playerIds);
    const bmMatches = matchRows(bundle.modes.bm.matches, tournamentId, playerIds, NULLABLE_JSON_FIELDS.bmMatch);
    const mrMatches = matchRows(bundle.modes.mr.matches, tournamentId, playerIds, NULLABLE_JSON_FIELDS.mrMatch);
    const gpMatches = matchRows(bundle.modes.gp.matches, tournamentId, playerIds, NULLABLE_JSON_FIELDS.gpMatch);
    const ttEntries = ttEntryRows(bundle, tournamentId, playerIds);
    const ttPhaseRounds = ttPhaseRoundRows(bundle, tournamentId, playerIds);
    const ttSuddenDeathRounds = ttSuddenDeathRows(bundle, tournamentId, playerIds);
    const tournamentScores = tournamentScoreRows(bundle, tournamentId, playerIds);

    await createManyInD1Chunks('BM qualifications', bmQualifications, (chunk) =>
      prisma.bMQualification.createMany({
        data: chunk as unknown as Prisma.BMQualificationCreateManyInput[],
      }),
    );
    await createManyInD1Chunks('MR qualifications', mrQualifications, (chunk) =>
      prisma.mRQualification.createMany({
        data: chunk as unknown as Prisma.MRQualificationCreateManyInput[],
      }),
    );
    await createManyInD1Chunks('GP qualifications', gpQualifications, (chunk) =>
      prisma.gPQualification.createMany({
        data: chunk as unknown as Prisma.GPQualificationCreateManyInput[],
      }),
    );
    await createManyInD1Chunks('BM matches', bmMatches, (chunk) =>
      prisma.bMMatch.createMany({ data: chunk as unknown as Prisma.BMMatchCreateManyInput[] }),
    );
    await createManyInD1Chunks('MR matches', mrMatches, (chunk) =>
      prisma.mRMatch.createMany({ data: chunk as unknown as Prisma.MRMatchCreateManyInput[] }),
    );
    await createManyInD1Chunks('GP matches', gpMatches, (chunk) =>
      prisma.gPMatch.createMany({ data: chunk as unknown as Prisma.GPMatchCreateManyInput[] }),
    );
    await createManyInD1Chunks('TA entries', ttEntries, (chunk) =>
      prisma.tTEntry.createMany({ data: chunk as unknown as Prisma.TTEntryCreateManyInput[] }),
    );
    await createManyInD1Chunks('TA phase rounds', ttPhaseRounds, (chunk) =>
      prisma.tTPhaseRound.createMany({
        data: chunk as unknown as Prisma.TTPhaseRoundCreateManyInput[],
      }),
    );
    await createManyInD1Chunks('TA sudden-death rounds', ttSuddenDeathRounds, (chunk) =>
      prisma.tTPhaseSuddenDeathRound.createMany({
        data: chunk as unknown as Prisma.TTPhaseSuddenDeathRoundCreateManyInput[],
      }),
    );
    await createManyInD1Chunks('overall ranking scores', tournamentScores, (chunk) =>
      prisma.tournamentPlayerScore.createMany({ data: chunk }),
    );

    const tournament = await runRestoreStage('restored tournament lookup', () =>
      retryDbRead(() =>
        prisma.tournament.findUnique({
          where: { id: tournamentId },
          select: RESTORED_TOURNAMENT_SELECT,
        }),
      ),
    );
    if (!tournament) throw createRestoreStageError('restored tournament lookup', new Error('Tournament missing'));
    return { tournament, restoredPlayerCount, reusedPlayerCount };
  } catch (error) {
    if (tournamentCreated) {
      await prisma.tournament.deleteMany({ where: { id: tournamentId } }).catch(() => undefined);
    }
    throw error;
  }
}
