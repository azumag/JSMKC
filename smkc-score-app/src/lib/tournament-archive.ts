import { getCloudflareContext } from '@opennextjs/cloudflare';
import type { R2Bucket } from '@cloudflare/workers-types';
import prisma from '@/lib/prisma';
import { PLAYER_PUBLIC_SELECT } from '@/lib/prisma-selects';
import { computeQualificationRanks, type RankedQualification } from '@/lib/server-ranking';
import { getOverallRankings, type PlayerTournamentScore } from '@/lib/points/overall-ranking';
import { COURSES } from '@/lib/constants';
import { generateBracketStructure, generatePlayoffStructure, roundNames } from '@/lib/double-elimination';
import { TA_HANDICAP_SECONDS, getTaPhase3Rules, normalizeTaHandicapSeconds } from '@/lib/ta/battle-royale';
import { normalizeTaRoundResults } from '@/lib/ta/round-result';

export const TOURNAMENT_ARCHIVE_SCHEMA_VERSION = 2;
const twoPlayerQualificationOrder = () => [{ group: 'asc' }, { score: 'desc' }, { points: 'desc' }] as const;
const GP_MATCH_SCORE_FIELDS = { p1: 'points1', p2: 'points2' };

// Inline types replacing Prisma.*GetPayload<> which require a generated client.
// These mirror the fields selected/included in each query below.
type ArchivePlayer = {
  id: string;
  name: string;
  nickname: string;
  country: string | null;
  noCamera: boolean;
};
type QualWithPlayer = { playerId: string; player: ArchivePlayer; [k: string]: unknown };
type BMQualificationArchiveRow = RankedQualification<QualWithPlayer>;
type MRQualificationArchiveRow = RankedQualification<QualWithPlayer>;
type GPQualificationArchiveRow = RankedQualification<QualWithPlayer>;
type MatchWithPlayers = {
  player1Id: string;
  player2Id: string;
  player1: ArchivePlayer;
  player2: ArchivePlayer;
  [k: string]: unknown;
};
type BMMatchArchiveRow = MatchWithPlayers;
type MRMatchArchiveRow = MatchWithPlayers;
type GPMatchArchiveRow = MatchWithPlayers;
type TTEntryArchiveRow = {
  id?: string;
  tournamentId?: string;
  playerId?: string;
  stage?: string;
  lives?: number;
  eliminated?: boolean;
  taHandicapSeconds?: number;
  times?: unknown;
  totalTime?: number | null;
  rank?: number | null;
  player: ArchivePlayer;
  [k: string]: unknown;
};
type TTPhaseRoundArchiveRow = { [k: string]: unknown };

export type TournamentArchiveModePayload<TQualification = unknown, TMatch = unknown> = {
  qualifications?: TQualification[];
  matches?: TMatch[];
  qualificationConfirmed?: boolean;
};

export type ArchivedTaRules = {
  mode: 'standard' | 'battle_royale';
  initialLives: number;
  lifeResetThresholds: number[];
  survivorsNeeded: number;
  handicapEnabled: boolean;
  allowedHandicapSeconds: number[];
  retryAppliesHandicap: false;
};

export type TournamentArchiveTaPayload = {
  entries?: TTEntryArchiveRow[];
  phaseRounds?: TTPhaseRoundArchiveRow[];
  rules: ArchivedTaRules;
};

export type TournamentArchiveBundle = {
  schemaVersion: 1 | 2;
  generatedAt: string;
  tournament: {
    id: string;
    slug: string | null;
    name: string;
    date: string | Date;
    status: string;
    publicModes: unknown;
    frozenStages: unknown;
    taPlayerSelfEdit: boolean;
    taBattleRoyaleMode: boolean;
    bmQualificationConfirmed: boolean;
    mrQualificationConfirmed: boolean;
    gpQualificationConfirmed: boolean;
    createdAt: string | Date;
    updatedAt: string | Date;
  };
  allPlayers: ArchivePlayer[];
  modes: {
    ta: TournamentArchiveTaPayload & {
      courses: typeof COURSES;
      qualificationRegistrationLocked: boolean;
      qualificationEditingLockedForPlayers: boolean;
      frozenStages: unknown;
      taPlayerSelfEdit: boolean;
    };
    bm: TournamentArchiveModePayload<BMQualificationArchiveRow, BMMatchArchiveRow>;
    mr: TournamentArchiveModePayload<MRQualificationArchiveRow, MRMatchArchiveRow>;
    gp: TournamentArchiveModePayload<GPQualificationArchiveRow, GPMatchArchiveRow>;
  };
  overallRanking: {
    tournamentId: string;
    tournamentName: string;
    lastUpdated: string;
    rankings: PlayerTournamentScore[];
  };
  archived: true;
};

export type TournamentArchiveIndexItem = {
  id: string;
  slug: string | null;
  name: string;
  date: string | Date;
  status: 'completed';
  publicModes: unknown;
  createdAt: string | Date;
  archivedAt: string;
  taMode?: 'standard' | 'battle_royale';
};

type ArchiveBucketEnv = CloudflareEnv & { ARCHIVE_BUCKET?: R2Bucket };

function getArchiveBucket(): R2Bucket | null {
  try {
    const { env } = getCloudflareContext();
    return (env as ArchiveBucketEnv).ARCHIVE_BUCKET ?? null;
  } catch {
    return null;
  }
}

export function getTournamentArchiveKeys(tournament: { id: string; slug?: string | null }) {
  const keys = [`archives/by-id/${tournament.id}/latest.json`];
  if (tournament.slug) {
    keys.push(`archives/by-slug/${tournament.slug}/latest.json`);
  }
  return keys;
}

function getTournamentArchiveMetaKey(tournament: { id: string }) {
  return `archives/by-id/${tournament.id}/meta.json`;
}

function archiveLookupKeys(identifier: string) {
  return [`archives/by-id/${identifier}/latest.json`, `archives/by-slug/${identifier}/latest.json`];
}

function isRawArchiveBundle(value: unknown): value is Record<string, unknown> {
  return Boolean(
    value &&
    typeof value === 'object' &&
    ((value as { schemaVersion?: unknown }).schemaVersion === 1 ||
      (value as { schemaVersion?: unknown }).schemaVersion === 2) &&
    (value as { tournament?: unknown }).tournament &&
    (value as { modes?: unknown }).modes,
  );
}

function standardArchivedTaRules(): ArchivedTaRules {
  const rules = getTaPhase3Rules(false);
  return {
    mode: 'standard',
    initialLives: rules.initialLives,
    lifeResetThresholds: [...rules.lifeResetThresholds],
    survivorsNeeded: rules.survivorsNeeded,
    handicapEnabled: rules.handicapEnabled,
    allowedHandicapSeconds: [...TA_HANDICAP_SECONDS],
    retryAppliesHandicap: false,
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

export function normalizeTournamentArchiveBundle(value: unknown): TournamentArchiveBundle | null {
  if (!isRawArchiveBundle(value)) return null;

  const raw = asRecord(value);
  const rawTournament = asRecord(raw.tournament);
  const rawModes = asRecord(raw.modes);
  const rawTa = asRecord(rawModes.ta);
  const isV2 = raw.schemaVersion === 2;
  const rawRules = isV2 ? asRecord(rawTa.rules) : {};
  const battleRoyale = rawRules.mode === 'battle_royale' || (isV2 && rawTournament.taBattleRoyaleMode === true);
  const derivedRules = getTaPhase3Rules(battleRoyale);
  const hasStoredRules = Object.keys(rawRules).length > 0;
  const rules: ArchivedTaRules = hasStoredRules
    ? {
        mode: battleRoyale ? 'battle_royale' : 'standard',
        initialLives: typeof rawRules.initialLives === 'number' ? rawRules.initialLives : derivedRules.initialLives,
        lifeResetThresholds: Array.isArray(rawRules.lifeResetThresholds)
          ? rawRules.lifeResetThresholds.filter(
              (candidate: unknown): candidate is number => typeof candidate === 'number',
            )
          : [...derivedRules.lifeResetThresholds],
        survivorsNeeded:
          typeof rawRules.survivorsNeeded === 'number' ? rawRules.survivorsNeeded : derivedRules.survivorsNeeded,
        handicapEnabled:
          typeof rawRules.handicapEnabled === 'boolean' ? rawRules.handicapEnabled : derivedRules.handicapEnabled,
        allowedHandicapSeconds: Array.isArray(rawRules.allowedHandicapSeconds)
          ? rawRules.allowedHandicapSeconds.filter(
              (candidate: unknown): candidate is number => typeof candidate === 'number',
            )
          : [...TA_HANDICAP_SECONDS],
        retryAppliesHandicap: false,
      }
    : isV2
      ? {
          mode: battleRoyale ? 'battle_royale' : 'standard',
          initialLives: derivedRules.initialLives,
          lifeResetThresholds: [...derivedRules.lifeResetThresholds],
          survivorsNeeded: derivedRules.survivorsNeeded,
          handicapEnabled: derivedRules.handicapEnabled,
          allowedHandicapSeconds: [...TA_HANDICAP_SECONDS],
          retryAppliesHandicap: false,
        }
      : standardArchivedTaRules();

  const entries = Array.isArray(rawTa.entries)
    ? rawTa.entries.map((entryValue) => {
        const entry = asRecord(entryValue);
        return {
          ...entry,
          taHandicapSeconds: isV2 ? normalizeTaHandicapSeconds(entry.taHandicapSeconds) : 0,
        };
      })
    : [];
  const phaseRounds = Array.isArray(rawTa.phaseRounds)
    ? rawTa.phaseRounds.map((roundValue) => {
        const round = asRecord(roundValue);
        return {
          ...round,
          results: normalizeTaRoundResults(round.results),
          eliminatedIds: Array.isArray(round.eliminatedIds) ? round.eliminatedIds : [],
        };
      })
    : [];

  const normalized = {
    ...raw,
    schemaVersion: raw.schemaVersion,
    tournament: {
      ...rawTournament,
      taBattleRoyaleMode: battleRoyale,
    },
    modes: {
      ...rawModes,
      ta: {
        ...rawTa,
        entries,
        phaseRounds,
        rules,
      },
    },
  };

  return normalized as unknown as TournamentArchiveBundle;
}

function isTournamentArchiveIndexItem(value: unknown): value is TournamentArchiveIndexItem {
  return Boolean(
    value &&
    typeof value === 'object' &&
    typeof (value as { id?: unknown }).id === 'string' &&
    typeof (value as { name?: unknown }).name === 'string' &&
    typeof (value as { date?: unknown }).date === 'string' &&
    (value as { status?: unknown }).status === 'completed' &&
    typeof (value as { archivedAt?: unknown }).archivedAt === 'string',
  );
}

async function readJsonFromR2<T>(key: string): Promise<T | null> {
  const bucket = getArchiveBucket();
  if (!bucket) return null;
  const object = await bucket.get(key);
  if (!object) return null;
  return object.json<T>();
}

async function putJsonToR2(key: string, value: unknown): Promise<void> {
  const bucket = getArchiveBucket();
  if (!bucket) {
    throw new Error('ARCHIVE_BUCKET binding is not configured');
  }
  await bucket.put(key, JSON.stringify(value), {
    httpMetadata: { contentType: 'application/json; charset=utf-8' },
  });
}

export async function readTournamentArchive(identifier: string): Promise<TournamentArchiveBundle | null> {
  for (const key of archiveLookupKeys(identifier)) {
    const bundle = normalizeTournamentArchiveBundle(await readJsonFromR2<unknown>(key));
    if (bundle) return bundle;
  }
  return null;
}

function uniquePlayersFromArchive(bundle: Pick<TournamentArchiveBundle, 'modes'>): ArchivePlayer[] {
  const byId = new Map<string, ArchivePlayer>();
  const remember = (player: ArchivePlayer) => {
    if (player.id) byId.set(player.id, player);
  };

  for (const entry of bundle.modes.ta.entries ?? []) {
    remember(entry.player);
  }
  for (const mode of [bundle.modes.bm, bundle.modes.mr, bundle.modes.gp]) {
    for (const qualification of mode.qualifications ?? []) {
      remember(qualification.player);
    }
    for (const match of mode.matches ?? []) {
      remember(match.player1);
      remember(match.player2);
    }
  }
  return [...byId.values()];
}

export function getArchivedModePayload(bundle: TournamentArchiveBundle, mode: 'ta' | 'bm' | 'mr' | 'gp') {
  if (mode === 'ta') {
    return {
      ...bundle.modes.ta,
      allPlayers: bundle.allPlayers,
      archived: true,
    };
  }
  return {
    qualifications: bundle.modes[mode].qualifications ?? [],
    matches: (bundle.modes[mode].matches ?? []).filter((match) => match.stage === 'qualification'),
    allPlayers: bundle.allPlayers,
    qualificationConfirmed: bundle.modes[mode].qualificationConfirmed ?? true,
    archived: true,
  };
}

export function getArchivedFinalsPayload(
  bundle: TournamentArchiveBundle,
  mode: 'bm' | 'mr' | 'gp',
  style: 'grouped' | 'simple' | 'paginated',
) {
  const allMatches = bundle.modes[mode].matches ?? [];
  const matches = allMatches.filter((match) => match.stage === 'finals');
  const playoffMatches = allMatches.filter((match) => match.stage === 'playoff');
  const bracketSize = matches.length > 20 ? 16 : 8;
  const bracketStructure = matches.length > 0 ? generateBracketStructure(bracketSize) : [];
  const playoffStructure = playoffMatches.length > 0 ? generatePlayoffStructure(12) : [];
  const playoffComplete = playoffMatches
    .filter((match) => match.round === 'playoff_r2')
    .every((match) => match.completed === true);
  const phase = matches.length > 0 ? 'finals' : playoffMatches.length > 0 ? 'playoff' : 'finals';
  const qualificationConfirmed = bundle.modes[mode].qualificationConfirmed ?? true;
  const common = {
    bracketStructure,
    bracketSize,
    roundNames,
    qualificationConfirmed,
    phase,
    playoffMatches,
    playoffStructure,
    playoffSeededPlayers: [],
    playoffComplete,
    archived: true,
  };

  if (style === 'paginated') {
    return {
      data: matches,
      meta: { page: 1, limit: matches.length, total: matches.length, totalPages: 1 },
      ...common,
    };
  }

  if (style === 'grouped') {
    return {
      matches,
      winnersMatches: matches.filter((match) => ((match.round as string | null) ?? '').startsWith('winners_')),
      losersMatches: matches.filter((match) => ((match.round as string | null) ?? '').startsWith('losers_')),
      grandFinalMatches: matches.filter((match) => ((match.round as string | null) ?? '').startsWith('grand_final')),
      ...common,
    };
  }

  return {
    matches,
    ...common,
  };
}

export function getArchivedTournamentSummary(bundle: TournamentArchiveBundle, isSummary: boolean) {
  const base = {
    ...bundle.tournament,
    archived: true,
  };
  if (isSummary) return base;
  return {
    ...base,
    bmQualifications: bundle.modes.bm.qualifications ?? [],
    bmMatches: bundle.modes.bm.matches ?? [],
  };
}

function archiveIndexItemFromBundle(bundle: TournamentArchiveBundle): TournamentArchiveIndexItem {
  return {
    id: bundle.tournament.id,
    slug: bundle.tournament.slug,
    name: bundle.tournament.name,
    date: bundle.tournament.date,
    status: 'completed',
    publicModes: bundle.tournament.publicModes,
    createdAt: bundle.tournament.createdAt,
    archivedAt: bundle.generatedAt,
    taMode: bundle.modes.ta.rules.mode,
  };
}

function sortTournamentArchiveIndex(index: TournamentArchiveIndexItem[]) {
  return [...index].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

async function readLegacyTournamentArchiveIndex(): Promise<TournamentArchiveIndexItem[]> {
  const index = await readJsonFromR2<unknown>('archives/index.json');
  if (!index || !Array.isArray(index)) return [];
  return sortTournamentArchiveIndex(index as TournamentArchiveIndexItem[]);
}

export async function readTournamentArchiveIndex(): Promise<TournamentArchiveIndexItem[]> {
  const bucket = getArchiveBucket();
  if (!bucket) return [];

  const items = new Map<string, TournamentArchiveIndexItem>();
  const latestKeys: string[] = [];
  let cursor: string | undefined;
  do {
    const listed = await bucket.list({ prefix: 'archives/by-id/', cursor });
    await Promise.all(
      listed.objects.map(async (object) => {
        if (object.key.endsWith('/meta.json')) {
          const item = await readJsonFromR2<unknown>(object.key);
          if (isTournamentArchiveIndexItem(item)) {
            items.set(item.id, item);
          }
          return;
        }
        if (!object.key.endsWith('/latest.json')) return;
        latestKeys.push(object.key);
      }),
    );
    cursor = listed.truncated ? listed.cursor : undefined;
  } while (cursor);

  await Promise.all(
    latestKeys.map(async (key) => {
      const [, id] = key.match(/^archives\/by-id\/(.+)\/latest\.json$/) ?? [];
      if (!id || items.has(id)) return;
      const bundle = normalizeTournamentArchiveBundle(await readJsonFromR2<unknown>(key));
      if (bundle) {
        items.set(bundle.tournament.id, archiveIndexItemFromBundle(bundle));
      }
    }),
  );

  const listedIndex = sortTournamentArchiveIndex([...items.values()]);
  if (listedIndex.length > 0) return listedIndex;
  return readLegacyTournamentArchiveIndex();
}

export async function buildTournamentArchiveBundle(tournamentId: string): Promise<TournamentArchiveBundle> {
  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    select: {
      id: true,
      slug: true,
      name: true,
      date: true,
      status: true,
      publicModes: true,
      frozenStages: true,
      taPlayerSelfEdit: true,
      taBattleRoyaleMode: true,
      bmQualificationConfirmed: true,
      mrQualificationConfirmed: true,
      gpQualificationConfirmed: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  if (!tournament) {
    throw new Error(`Tournament not found: ${tournamentId}`);
  }

  const rawResults = await Promise.all([
    prisma.tTEntry.findMany({
      where: { tournamentId },
      include: { player: { select: PLAYER_PUBLIC_SELECT } },
      orderBy: [{ stage: 'asc' }, { rank: 'asc' }, { totalTime: 'asc' }],
    }),
    prisma.tTPhaseRound.findMany({
      where: { tournamentId },
      orderBy: [{ phase: 'asc' }, { roundNumber: 'asc' }],
    }),
    prisma.bMQualification.findMany({
      where: { tournamentId },
      include: { player: { select: PLAYER_PUBLIC_SELECT } },
      orderBy: [...twoPlayerQualificationOrder()],
    }),
    prisma.mRQualification.findMany({
      where: { tournamentId },
      include: { player: { select: PLAYER_PUBLIC_SELECT } },
      orderBy: [...twoPlayerQualificationOrder()],
    }),
    prisma.gPQualification.findMany({
      where: { tournamentId },
      include: { player: { select: PLAYER_PUBLIC_SELECT } },
      orderBy: [...twoPlayerQualificationOrder()],
    }),
    prisma.bMMatch.findMany({
      where: { tournamentId },
      include: { player1: { select: PLAYER_PUBLIC_SELECT }, player2: { select: PLAYER_PUBLIC_SELECT } },
      orderBy: { matchNumber: 'asc' },
    }),
    prisma.mRMatch.findMany({
      where: { tournamentId },
      include: { player1: { select: PLAYER_PUBLIC_SELECT }, player2: { select: PLAYER_PUBLIC_SELECT } },
      orderBy: { matchNumber: 'asc' },
    }),
    prisma.gPMatch.findMany({
      where: { tournamentId },
      include: { player1: { select: PLAYER_PUBLIC_SELECT }, player2: { select: PLAYER_PUBLIC_SELECT } },
      orderBy: { matchNumber: 'asc' },
    }),
    getOverallRankings(prisma, tournamentId),
  ]);

  // Cast from any[] results from the stub Prisma client to the expected types.
  const [
    ttEntries,
    ttPhaseRounds,
    bmQualifications,
    mrQualifications,
    gpQualifications,
    bmMatches,
    mrMatches,
    gpMatches,
    overallRankings,
  ] = rawResults as [
    TTEntryArchiveRow[],
    TTPhaseRoundArchiveRow[],
    QualWithPlayer[],
    QualWithPlayer[],
    QualWithPlayer[],
    MatchWithPlayers[],
    MatchWithPlayers[],
    MatchWithPlayers[],
    PlayerTournamentScore[],
  ];

  const modes = {
    ta: {
      entries: ttEntries,
      phaseRounds: ttPhaseRounds,
      courses: COURSES,
      qualificationRegistrationLocked: true,
      qualificationEditingLockedForPlayers: true,
      frozenStages: tournament.frozenStages,
      taPlayerSelfEdit: tournament.taPlayerSelfEdit,
      rules: (() => {
        const rules = getTaPhase3Rules(tournament.taBattleRoyaleMode);
        return {
          mode: (tournament.taBattleRoyaleMode ? 'battle_royale' : 'standard') as ArchivedTaRules['mode'],
          initialLives: rules.initialLives,
          lifeResetThresholds: [...rules.lifeResetThresholds],
          survivorsNeeded: rules.survivorsNeeded,
          handicapEnabled: rules.handicapEnabled,
          allowedHandicapSeconds: [...TA_HANDICAP_SECONDS],
          retryAppliesHandicap: false as const,
        };
      })(),
    },
    bm: {
      qualifications: computeQualificationRanks(
        bmQualifications,
        [...twoPlayerQualificationOrder()],
        bmMatches.filter((match) => match.stage === 'qualification'),
        { matchScoreFields: { p1: 'score1', p2: 'score2' } },
      ),
      matches: bmMatches,
      qualificationConfirmed: tournament.bmQualificationConfirmed,
    },
    mr: {
      qualifications: computeQualificationRanks(
        mrQualifications,
        [...twoPlayerQualificationOrder()],
        mrMatches.filter((match) => match.stage === 'qualification'),
        { matchScoreFields: { p1: 'score1', p2: 'score2' } },
      ),
      matches: mrMatches,
      qualificationConfirmed: tournament.mrQualificationConfirmed,
    },
    gp: {
      qualifications: computeQualificationRanks(
        gpQualifications,
        [...twoPlayerQualificationOrder()],
        gpMatches.filter((match) => match.stage === 'qualification'),
        { matchScoreFields: GP_MATCH_SCORE_FIELDS },
      ),
      matches: gpMatches,
      qualificationConfirmed: tournament.gpQualificationConfirmed,
    },
  };

  const bundle: TournamentArchiveBundle = {
    schemaVersion: TOURNAMENT_ARCHIVE_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    tournament,
    allPlayers: [],
    modes,
    overallRanking: {
      tournamentId,
      tournamentName: tournament.name,
      lastUpdated:
        overallRankings.length > 0
          ? new Date(
              Math.max(
                ...overallRankings.map((ranking) =>
                  new Date(
                    ((ranking as { updatedAt?: unknown }).updatedAt as string | Date | undefined) ?? new Date(),
                  ).getTime(),
                ),
              ),
            ).toISOString()
          : new Date().toISOString(),
      rankings: overallRankings,
    },
    archived: true,
  };
  bundle.allPlayers = uniquePlayersFromArchive(bundle);
  return bundle;
}

export async function persistTournamentArchive(tournamentId: string): Promise<TournamentArchiveBundle> {
  const bundle = await buildTournamentArchiveBundle(tournamentId);
  await Promise.all([
    ...getTournamentArchiveKeys(bundle.tournament).map((key) => putJsonToR2(key, bundle)),
    putJsonToR2(getTournamentArchiveMetaKey(bundle.tournament), archiveIndexItemFromBundle(bundle)),
  ]);
  return bundle;
}
