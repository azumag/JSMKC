import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { R2Bucket } from "@cloudflare/workers-types";
import type { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { PLAYER_PUBLIC_SELECT } from "@/lib/prisma-selects";
import { computeQualificationRanks, type RankedQualification } from "@/lib/server-ranking";
import { getOverallRankings, type PlayerTournamentScore } from "@/lib/points/overall-ranking";
import { COURSES } from "@/lib/constants";
import { generateBracketStructure, generatePlayoffStructure, roundNames } from "@/lib/double-elimination";

export const TOURNAMENT_ARCHIVE_SCHEMA_VERSION = 1;
const twoPlayerQualificationOrder = () => [{ group: "asc" }, { score: "desc" }, { points: "desc" }] as const;
const GP_MATCH_SCORE_FIELDS = { p1: "points1", p2: "points2" };

type ArchivePlayer = Prisma.PlayerGetPayload<{ select: typeof PLAYER_PUBLIC_SELECT }>;
type BMQualificationArchiveRow = RankedQualification<Prisma.BMQualificationGetPayload<{
  include: { player: { select: typeof PLAYER_PUBLIC_SELECT } };
}>>;
type MRQualificationArchiveRow = RankedQualification<Prisma.MRQualificationGetPayload<{
  include: { player: { select: typeof PLAYER_PUBLIC_SELECT } };
}>>;
type GPQualificationArchiveRow = RankedQualification<Prisma.GPQualificationGetPayload<{
  include: { player: { select: typeof PLAYER_PUBLIC_SELECT } };
}>>;
type BMMatchArchiveRow = Prisma.BMMatchGetPayload<{
  include: {
    player1: { select: typeof PLAYER_PUBLIC_SELECT };
    player2: { select: typeof PLAYER_PUBLIC_SELECT };
  };
}>;
type MRMatchArchiveRow = Prisma.MRMatchGetPayload<{
  include: {
    player1: { select: typeof PLAYER_PUBLIC_SELECT };
    player2: { select: typeof PLAYER_PUBLIC_SELECT };
  };
}>;
type GPMatchArchiveRow = Prisma.GPMatchGetPayload<{
  include: {
    player1: { select: typeof PLAYER_PUBLIC_SELECT };
    player2: { select: typeof PLAYER_PUBLIC_SELECT };
  };
}>;
type TTEntryArchiveRow = Prisma.TTEntryGetPayload<{
  include: { player: { select: typeof PLAYER_PUBLIC_SELECT } };
}>;
type TTPhaseRoundArchiveRow = Prisma.TTPhaseRoundGetPayload<Record<string, never>>;

export type TournamentArchiveModePayload<TQualification = unknown, TMatch = unknown> = {
  qualifications?: TQualification[];
  matches?: TMatch[];
  qualificationConfirmed?: boolean;
};

export type TournamentArchiveTaPayload = {
  entries?: TTEntryArchiveRow[];
  phaseRounds?: TTPhaseRoundArchiveRow[];
};

export type TournamentArchiveBundle = {
  schemaVersion: 1;
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
  status: "completed";
  publicModes: unknown;
  createdAt: string | Date;
  archivedAt: string;
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
  return [
    `archives/by-id/${identifier}/latest.json`,
    `archives/by-slug/${identifier}/latest.json`,
  ];
}

function isArchiveBundle(value: unknown): value is TournamentArchiveBundle {
  return Boolean(
    value &&
    typeof value === "object" &&
    (value as { schemaVersion?: unknown }).schemaVersion === TOURNAMENT_ARCHIVE_SCHEMA_VERSION &&
    (value as { tournament?: unknown }).tournament &&
    (value as { modes?: unknown }).modes,
  );
}

function isTournamentArchiveIndexItem(value: unknown): value is TournamentArchiveIndexItem {
  return Boolean(
    value &&
    typeof value === "object" &&
    typeof (value as { id?: unknown }).id === "string" &&
    typeof (value as { name?: unknown }).name === "string" &&
    (value as { status?: unknown }).status === "completed" &&
    typeof (value as { archivedAt?: unknown }).archivedAt === "string",
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
    throw new Error("ARCHIVE_BUCKET binding is not configured");
  }
  await bucket.put(key, JSON.stringify(value), {
    httpMetadata: { contentType: "application/json; charset=utf-8" },
  });
}

export async function readTournamentArchive(identifier: string): Promise<TournamentArchiveBundle | null> {
  for (const key of archiveLookupKeys(identifier)) {
    const bundle = await readJsonFromR2<unknown>(key);
    if (isArchiveBundle(bundle)) return bundle;
  }
  return null;
}

function uniquePlayersFromArchive(bundle: Pick<TournamentArchiveBundle, "modes">): ArchivePlayer[] {
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

export function getArchivedModePayload(
  bundle: TournamentArchiveBundle,
  mode: "ta" | "bm" | "mr" | "gp",
) {
  if (mode === "ta") {
    return {
      ...bundle.modes.ta,
      allPlayers: bundle.allPlayers,
      archived: true,
    };
  }
  return {
    qualifications: bundle.modes[mode].qualifications ?? [],
    matches: (bundle.modes[mode].matches ?? []).filter((match) => match.stage === "qualification"),
    allPlayers: bundle.allPlayers,
    qualificationConfirmed: bundle.modes[mode].qualificationConfirmed ?? true,
    archived: true,
  };
}

export function getArchivedFinalsPayload(
  bundle: TournamentArchiveBundle,
  mode: "bm" | "mr" | "gp",
  style: "grouped" | "simple" | "paginated",
) {
  const allMatches = bundle.modes[mode].matches ?? [];
  const matches = allMatches.filter((match) => match.stage === "finals");
  const playoffMatches = allMatches.filter((match) => match.stage === "playoff");
  const bracketSize = matches.length > 20 ? 16 : 8;
  const bracketStructure = matches.length > 0 ? generateBracketStructure(bracketSize) : [];
  const playoffStructure = playoffMatches.length > 0 ? generatePlayoffStructure(12) : [];
  const playoffComplete = playoffMatches
    .filter((match) => match.round === "playoff_r2")
    .every((match) => match.completed === true);
  const phase = matches.length > 0 ? "finals" : playoffMatches.length > 0 ? "playoff" : "finals";
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

  if (style === "paginated") {
    return {
      data: matches,
      meta: { page: 1, limit: matches.length, total: matches.length, totalPages: 1 },
      ...common,
    };
  }

  if (style === "grouped") {
    return {
      matches,
      winnersMatches: matches.filter((match) => (match.round ?? "").startsWith("winners_")),
      losersMatches: matches.filter((match) => (match.round ?? "").startsWith("losers_")),
      grandFinalMatches: matches.filter((match) => (match.round ?? "").startsWith("grand_final")),
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
    status: "completed",
    publicModes: bundle.tournament.publicModes,
    createdAt: bundle.tournament.createdAt,
    archivedAt: bundle.generatedAt,
  };
}

function sortTournamentArchiveIndex(index: TournamentArchiveIndexItem[]) {
  return [...index].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

async function readLegacyTournamentArchiveIndex(): Promise<TournamentArchiveIndexItem[]> {
  const index = await readJsonFromR2<unknown>("archives/index.json");
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
    const listed = await bucket.list({ prefix: "archives/by-id/", cursor });
    await Promise.all(listed.objects.map(async (object) => {
      if (object.key.endsWith("/meta.json")) {
        const item = await readJsonFromR2<unknown>(object.key);
        if (isTournamentArchiveIndexItem(item)) {
          items.set(item.id, item);
        }
        return;
      }
      if (!object.key.endsWith("/latest.json")) return;
      latestKeys.push(object.key);
    }));
    cursor = listed.truncated ? listed.cursor : undefined;
  } while (cursor);

  await Promise.all(latestKeys.map(async (key) => {
    const [, id] = key.match(/^archives\/by-id\/(.+)\/latest\.json$/) ?? [];
    if (!id || items.has(id)) return;
    const bundle = await readJsonFromR2<unknown>(key);
    if (isArchiveBundle(bundle)) {
      items.set(bundle.tournament.id, archiveIndexItemFromBundle(bundle));
    }
  }));

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
  ] = await Promise.all([
    prisma.tTEntry.findMany({
      where: { tournamentId },
      include: { player: { select: PLAYER_PUBLIC_SELECT } },
      orderBy: [{ stage: "asc" }, { rank: "asc" }, { totalTime: "asc" }],
    }),
    prisma.tTPhaseRound.findMany({
      where: { tournamentId },
      orderBy: [{ phase: "asc" }, { roundNumber: "asc" }],
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
      orderBy: { matchNumber: "asc" },
    }),
    prisma.mRMatch.findMany({
      where: { tournamentId },
      include: { player1: { select: PLAYER_PUBLIC_SELECT }, player2: { select: PLAYER_PUBLIC_SELECT } },
      orderBy: { matchNumber: "asc" },
    }),
    prisma.gPMatch.findMany({
      where: { tournamentId },
      include: { player1: { select: PLAYER_PUBLIC_SELECT }, player2: { select: PLAYER_PUBLIC_SELECT } },
      orderBy: { matchNumber: "asc" },
    }),
    getOverallRankings(prisma, tournamentId),
  ]);

  const modes = {
    ta: {
      entries: ttEntries,
      phaseRounds: ttPhaseRounds,
      courses: COURSES,
      qualificationRegistrationLocked: true,
      qualificationEditingLockedForPlayers: true,
      frozenStages: tournament.frozenStages,
      taPlayerSelfEdit: tournament.taPlayerSelfEdit,
    },
    bm: {
      qualifications: computeQualificationRanks(
        bmQualifications,
        [...twoPlayerQualificationOrder()],
        bmMatches.filter((match) => match.stage === "qualification"),
        { matchScoreFields: { p1: "score1", p2: "score2" } },
      ),
      matches: bmMatches,
      qualificationConfirmed: tournament.bmQualificationConfirmed,
    },
    mr: {
      qualifications: computeQualificationRanks(
        mrQualifications,
        [...twoPlayerQualificationOrder()],
        mrMatches.filter((match) => match.stage === "qualification"),
        { matchScoreFields: { p1: "score1", p2: "score2" } },
      ),
      matches: mrMatches,
      qualificationConfirmed: tournament.mrQualificationConfirmed,
    },
    gp: {
      qualifications: computeQualificationRanks(
        gpQualifications,
        [...twoPlayerQualificationOrder()],
        gpMatches.filter((match) => match.stage === "qualification"),
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
      lastUpdated: overallRankings.length > 0
        ? new Date(Math.max(...overallRankings.map((ranking) =>
            new Date((ranking as { updatedAt?: unknown }).updatedAt as string | Date | undefined ?? new Date()).getTime()
          ))).toISOString()
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
