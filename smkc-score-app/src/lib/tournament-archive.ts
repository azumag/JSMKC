import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { R2Bucket } from "@cloudflare/workers-types";
import prisma from "@/lib/prisma";
import { PLAYER_PUBLIC_SELECT } from "@/lib/prisma-selects";
import { computeQualificationRanks } from "@/lib/server-ranking";
import { getOverallRankings } from "@/lib/points/overall-ranking";
import { COURSES } from "@/lib/constants";
import { generateBracketStructure, generatePlayoffStructure, roundNames } from "@/lib/double-elimination";

export const TOURNAMENT_ARCHIVE_SCHEMA_VERSION = 1;
const twoPlayerQualificationOrder = () => [{ group: "asc" }, { score: "desc" }, { points: "desc" }] as const;
const GP_MATCH_SCORE_FIELDS = { p1: "points1", p2: "points2" };

export type TournamentArchiveModePayload = {
  qualifications?: unknown[];
  matches?: unknown[];
  entries?: unknown[];
  phaseRounds?: unknown[];
  qualificationConfirmed?: boolean;
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
  allPlayers: unknown[];
  modes: {
    ta: TournamentArchiveModePayload & {
      courses: typeof COURSES;
      qualificationRegistrationLocked: boolean;
      qualificationEditingLockedForPlayers: boolean;
      frozenStages: unknown;
      taPlayerSelfEdit: boolean;
    };
    bm: TournamentArchiveModePayload;
    mr: TournamentArchiveModePayload;
    gp: TournamentArchiveModePayload;
  };
  overallRanking: {
    tournamentId: string;
    tournamentName: string;
    lastUpdated: string;
    rankings: unknown[];
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

function uniquePlayersFromArchive(bundle: Pick<TournamentArchiveBundle, "modes">): unknown[] {
  const byId = new Map<string, unknown>();
  const remember = (player: unknown) => {
    const id = player && typeof player === "object" ? (player as { id?: unknown }).id : null;
    if (typeof id === "string") byId.set(id, player);
  };

  for (const entry of bundle.modes.ta.entries ?? []) {
    remember((entry as { player?: unknown }).player);
  }
  for (const mode of [bundle.modes.bm, bundle.modes.mr, bundle.modes.gp]) {
    for (const qualification of mode.qualifications ?? []) {
      remember((qualification as { player?: unknown }).player);
    }
    for (const match of mode.matches ?? []) {
      remember((match as { player1?: unknown; player2?: unknown }).player1);
      remember((match as { player1?: unknown; player2?: unknown }).player2);
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
    matches: (bundle.modes[mode].matches ?? []).filter((match) =>
      (match as { stage?: unknown }).stage === "qualification"
    ),
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
  const matches = allMatches.filter((match) => (match as { stage?: unknown }).stage === "finals");
  const playoffMatches = allMatches.filter((match) => (match as { stage?: unknown }).stage === "playoff");
  const bracketSize = matches.length > 20 ? 16 : 8;
  const bracketStructure = matches.length > 0 ? generateBracketStructure(bracketSize) : [];
  const playoffStructure = playoffMatches.length > 0 ? generatePlayoffStructure(12) : [];
  const playoffComplete = playoffMatches
    .filter((match) => (match as { round?: unknown }).round === "playoff_r2")
    .every((match) => (match as { completed?: unknown }).completed === true);
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
      winnersMatches: matches.filter((match) =>
        ((match as { round?: string | null }).round ?? "").startsWith("winners_")
      ),
      losersMatches: matches.filter((match) =>
        ((match as { round?: string | null }).round ?? "").startsWith("losers_")
      ),
      grandFinalMatches: matches.filter((match) =>
        ((match as { round?: string | null }).round ?? "").startsWith("grand_final")
      ),
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

export async function readTournamentArchiveIndex(): Promise<TournamentArchiveIndexItem[]> {
  const index = await readJsonFromR2<unknown>("archives/index.json");
  if (!index || !Array.isArray(index)) return [];
  return index as TournamentArchiveIndexItem[];
}

async function updateTournamentArchiveIndex(bundle: TournamentArchiveBundle) {
  const existing = await readTournamentArchiveIndex();
  const item: TournamentArchiveIndexItem = {
    id: bundle.tournament.id,
    slug: bundle.tournament.slug,
    name: bundle.tournament.name,
    date: bundle.tournament.date,
    status: "completed",
    publicModes: bundle.tournament.publicModes,
    createdAt: bundle.tournament.createdAt,
    archivedAt: bundle.generatedAt,
  };
  const next = [
    item,
    ...existing.filter((entry) => entry.id !== item.id && entry.slug !== item.slug),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  await putJsonToR2("archives/index.json", next);
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
  await Promise.all(getTournamentArchiveKeys(bundle.tournament).map((key) => putJsonToR2(key, bundle)));
  await updateTournamentArchiveIndex(bundle);
  return bundle;
}
