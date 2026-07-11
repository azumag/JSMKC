import { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import type { TournamentArchiveBundle } from '@/lib/tournament-archive';
import { normalizeTaHandicapSeconds } from '@/lib/ta/battle-royale';

const DATE_FIELDS = new Set([
  'rankOverrideAt',
  'combinedRankOverrideAt',
  'deletedAt',
  'createdAt',
  'updatedAt',
  'submittedAt',
]);

type ArchivedPlayer = {
  id: string;
  name: string;
  nickname: string;
  country?: string | null;
  noCamera?: boolean;
  taHandicapSeconds?: number;
};

type ArchivedRecord = Record<string, unknown>;

type RestoreResult = {
  tournament: Awaited<ReturnType<typeof prisma.tournament.findUnique>>;
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
        taHandicapSeconds: normalizeTaHandicapSeconds(archived.taHandicapSeconds),
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
): ArchivedRecord[] {
  return (values ?? []).map((value) => {
    const row = cleanArchivedRow(value, tournamentId);
    row.player1Id = remapPlayerId(row.player1Id, playerIds);
    row.player2Id = remapPlayerId(row.player2Id, playerIds);
    if (row.suddenDeathWinnerId !== undefined && row.suddenDeathWinnerId !== null) {
      row.suddenDeathWinnerId = remapPlayerId(row.suddenDeathWinnerId, playerIds);
    }
    return row;
  });
}

function ttEntryRows(bundle: TournamentArchiveBundle, tournamentId: string, playerIds: Map<string, string>) {
  return (bundle.modes.ta.entries ?? []).map((value) => {
    const row = cleanArchivedRow(value, tournamentId);
    row.playerId = remapPlayerId(row.playerId, playerIds);
    if (row.partnerId !== undefined && row.partnerId !== null) {
      row.partnerId = remapPlayerId(row.partnerId, playerIds);
    }
    return row;
  });
}

function ttPhaseRoundRows(bundle: TournamentArchiveBundle, tournamentId: string, playerIds: Map<string, string>) {
  return (bundle.modes.ta.phaseRounds ?? []).map((value) => {
    const row = cleanArchivedRow(value, tournamentId);
    row.results = remapPlayerIdsDeep(row.results, playerIds);
    row.eliminatedIds = remapPlayerIdsDeep(row.eliminatedIds, playerIds);
    return row;
  });
}

function ttSuddenDeathRows(bundle: TournamentArchiveBundle, tournamentId: string, playerIds: Map<string, string>) {
  const ta = bundle.modes.ta as TournamentArchiveBundle['modes']['ta'] & { suddenDeathRounds?: unknown[] };
  return (ta.suddenDeathRounds ?? []).map((value) => {
    const row = cleanArchivedRow(value, tournamentId);
    row.targetPlayerIds = remapPlayerIdsDeep(row.targetPlayerIds, playerIds);
    row.results = remapPlayerIdsDeep(row.results, playerIds);
    return row;
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
  const existing = await prisma.tournament.findUnique({ where: { id: tournamentId } });
  if (existing) {
    return { tournament: existing, restoredPlayerCount: 0, reusedPlayerCount: 0 };
  }

  const { playerIds, restoredPlayerCount, reusedPlayerCount } = await restorePlayers(bundle);
  let tournamentCreated = false;

  try {
    await prisma.tournament.create({
      data: {
        id: tournamentId,
        slug: bundle.tournament.slug,
        name: bundle.tournament.name,
        date: asDate(bundle.tournament.date),
        status: 'active',
        taPlayerSelfEdit: bundle.tournament.taPlayerSelfEdit,
        taBattleRoyaleMode: bundle.tournament.taBattleRoyaleMode,
        frozenStages: bundle.tournament.frozenStages as Prisma.InputJsonValue,
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
    });
    tournamentCreated = true;

    const bmQualifications = qualificationRows(bundle.modes.bm.qualifications, tournamentId, playerIds);
    const mrQualifications = qualificationRows(bundle.modes.mr.qualifications, tournamentId, playerIds);
    const gpQualifications = qualificationRows(bundle.modes.gp.qualifications, tournamentId, playerIds);
    const bmMatches = matchRows(bundle.modes.bm.matches, tournamentId, playerIds);
    const mrMatches = matchRows(bundle.modes.mr.matches, tournamentId, playerIds);
    const gpMatches = matchRows(bundle.modes.gp.matches, tournamentId, playerIds);
    const ttEntries = ttEntryRows(bundle, tournamentId, playerIds);
    const ttPhaseRounds = ttPhaseRoundRows(bundle, tournamentId, playerIds);
    const ttSuddenDeathRounds = ttSuddenDeathRows(bundle, tournamentId, playerIds);
    const tournamentScores = tournamentScoreRows(bundle, tournamentId, playerIds);

    if (bmQualifications.length > 0) {
      await prisma.bMQualification.createMany({
        data: bmQualifications as unknown as Prisma.BMQualificationCreateManyInput[],
      });
    }
    if (mrQualifications.length > 0) {
      await prisma.mRQualification.createMany({
        data: mrQualifications as unknown as Prisma.MRQualificationCreateManyInput[],
      });
    }
    if (gpQualifications.length > 0) {
      await prisma.gPQualification.createMany({
        data: gpQualifications as unknown as Prisma.GPQualificationCreateManyInput[],
      });
    }
    if (bmMatches.length > 0) {
      await prisma.bMMatch.createMany({ data: bmMatches as unknown as Prisma.BMMatchCreateManyInput[] });
    }
    if (mrMatches.length > 0) {
      await prisma.mRMatch.createMany({ data: mrMatches as unknown as Prisma.MRMatchCreateManyInput[] });
    }
    if (gpMatches.length > 0) {
      await prisma.gPMatch.createMany({ data: gpMatches as unknown as Prisma.GPMatchCreateManyInput[] });
    }
    if (ttEntries.length > 0) {
      await prisma.tTEntry.createMany({ data: ttEntries as unknown as Prisma.TTEntryCreateManyInput[] });
    }
    if (ttPhaseRounds.length > 0) {
      await prisma.tTPhaseRound.createMany({
        data: ttPhaseRounds as unknown as Prisma.TTPhaseRoundCreateManyInput[],
      });
    }
    if (ttSuddenDeathRounds.length > 0) {
      await prisma.tTPhaseSuddenDeathRound.createMany({
        data: ttSuddenDeathRounds as unknown as Prisma.TTPhaseSuddenDeathRoundCreateManyInput[],
      });
    }
    if (tournamentScores.length > 0) {
      await prisma.tournamentPlayerScore.createMany({ data: tournamentScores });
    }

    const tournament = await prisma.tournament.findUnique({ where: { id: tournamentId } });
    if (!tournament) throw new Error('Restored tournament disappeared before it could be returned');
    return { tournament, restoredPlayerCount, reusedPlayerCount };
  } catch (error) {
    if (tournamentCreated) {
      await prisma.tournament.deleteMany({ where: { id: tournamentId } }).catch(() => undefined);
    }
    throw error;
  }
}
