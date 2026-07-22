import prisma from '@/lib/prisma';
import { PLAYER_PUBLIC_SELECT } from '@/lib/prisma-selects';
import { generateBracketStructure, generatePlayoffStructure } from '@/lib/double-elimination';

export type FinalsSeedMode = 'bm' | 'mr' | 'gp';
export type FinalsSeedSnapshotField = 'bmFinalsSeedSnapshot' | 'mrFinalsSeedSnapshot' | 'gpFinalsSeedSnapshot';

export type FinalsSeedSnapshotEntry = {
  seed: number;
  originalSeed: number;
  playerId: string;
  player: { id: string; name?: string | null; nickname?: string | null; country?: string | null; noCamera?: boolean };
  qualificationRankLabel?: string;
};

export type FinalsSeedSnapshotResolution =
  | { status: 'complete'; snapshot: FinalsSeedSnapshotEntry[] }
  | { status: 'absent'; snapshot: [] }
  | {
      status: 'unsafe';
      snapshot: [];
      reason: 'manual_slot_override' | 'incomplete_top24' | 'incomplete_opening_round' | 'lookup_failed';
    };

type SeedMatch = {
  matchNumber: number;
  stage: string;
  round: string | null;
  player1Id: string;
  player2Id: string;
  player1: FinalsSeedSnapshotEntry['player'];
  player2: FinalsSeedSnapshotEntry['player'];
  slotOverrideAt?: Date | string | null;
};

const modelByMode = { bm: 'bMMatch', mr: 'mRMatch', gp: 'gPMatch' } as const;
const qualificationModelByMode = { bm: 'bMQualification', mr: 'mRQualification', gp: 'gPQualification' } as const;

export function getFinalsSeedSnapshotField(mode: FinalsSeedMode): FinalsSeedSnapshotField {
  return `${mode}FinalsSeedSnapshot` as FinalsSeedSnapshotField;
}

export function parseFinalsSeedSnapshot(value: unknown): FinalsSeedSnapshotEntry[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return [];
    const candidate = entry as Partial<FinalsSeedSnapshotEntry>;
    if (
      typeof candidate.seed !== 'number' ||
      typeof candidate.originalSeed !== 'number' ||
      typeof candidate.playerId !== 'string' ||
      !candidate.player ||
      typeof candidate.player.id !== 'string'
    ) {
      return [];
    }
    return [candidate as FinalsSeedSnapshotEntry];
  });
}

/** A snapshot is authoritative only when it contains every entrant exactly
 * once. In particular, 12 rows are never a valid Top-24 contract: they are
 * a legacy Phase-1-only artifact lacking the direct qualifiers. */
export function isCompleteFinalsSeedSnapshot(value: unknown): value is FinalsSeedSnapshotEntry[] {
  const entries = parseFinalsSeedSnapshot(value);
  const entrantCount = entries.length;
  if (entrantCount !== 8 && entrantCount !== 16 && entrantCount !== 24) return false;

  const playerIds = new Set(entries.map((entry) => entry.playerId));
  const originalSeeds = new Set(entries.map((entry) => entry.originalSeed));
  return (
    playerIds.size === entrantCount &&
    originalSeeds.size === entrantCount &&
    Array.from({ length: entrantCount }, (_, index) => originalSeeds.has(index + 1)).every(Boolean)
  );
}

/**
 * Backfill a pre-migration bracket from its persisted opening-round rows.
 * This deliberately never regenerates matches and is independent of current
 * qualification standings, so a later rank correction cannot relabel it.
 */
export async function ensureFinalsSeedSnapshot(
  tournamentId: string,
  mode: FinalsSeedMode,
): Promise<FinalsSeedSnapshotEntry[]> {
  const resolution = await resolveFinalsSeedSnapshot(tournamentId, mode);
  return resolution.status === 'complete' ? resolution.snapshot : [];
}

/**
 * Resolve a KO seed snapshot without ever making a best-effort guess look
 * authoritative. Consumers that publish official output must reject `unsafe`.
 */
export async function resolveFinalsSeedSnapshot(
  tournamentId: string,
  mode: FinalsSeedMode,
): Promise<FinalsSeedSnapshotResolution> {
  try {
    return await resolveFinalsSeedSnapshotInner(tournamentId, mode);
  } catch {
    return { status: 'unsafe', snapshot: [], reason: 'lookup_failed' };
  }
}

async function resolveFinalsSeedSnapshotInner(
  tournamentId: string,
  mode: FinalsSeedMode,
): Promise<FinalsSeedSnapshotResolution> {
  const field = getFinalsSeedSnapshotField(mode);
  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    select: {
      bmFinalsSeedSnapshot: true,
      mrFinalsSeedSnapshot: true,
      gpFinalsSeedSnapshot: true,
    },
  });
  const existing = parseFinalsSeedSnapshot(tournament?.[field]);
  /* A 12-row snapshot is an old, partial Top-24 Phase-1 artifact. It is not
   * a complete seed contract and must not suppress a later full snapshot. */
  if (isCompleteFinalsSeedSnapshot(existing)) return { status: 'complete', snapshot: existing };

  const model = prisma[modelByMode[mode]] as unknown as {
    findMany: (args: unknown) => Promise<SeedMatch[]>;
  };
  const qualificationModel = prisma[qualificationModelByMode[mode]] as unknown as {
    findMany: (args: unknown) => Promise<Array<{ group: string | null }>>;
  };
  const matches = await model.findMany({
    where: { tournamentId, stage: { in: ['playoff', 'finals'] } },
    include: { player1: { select: PLAYER_PUBLIC_SELECT }, player2: { select: PLAYER_PUBLIC_SELECT } },
    orderBy: { matchNumber: 'asc' },
  });
  if (matches.length === 0) return { status: 'absent', snapshot: [] };

  /* A legacy manual slot adjustment destroys the only reliable structural
   * evidence of the original label. Do not fossilize the adjusted slot as a
   * new seed; a director must supply the explicit correction instead. */
  if (matches.some((match) => match.slotOverrideAt)) {
    return { status: 'unsafe', snapshot: [], reason: 'manual_slot_override' };
  }

  const entries = new Map<string, FinalsSeedSnapshotEntry>();
  const add = (seed: number | undefined, playerId: string, player: SeedMatch['player1']) => {
    if (seed == null || entries.has(playerId)) return;
    entries.set(playerId, { seed, originalSeed: seed, playerId, player });
  };
  const playoffMatches = matches.filter((match) => match.stage === 'playoff');
  if (playoffMatches.length > 0) {
    const qualifications = await qualificationModel.findMany({ where: { tournamentId }, select: { group: true } });
    const groupCount: 2 | 3 = new Set(qualifications.map((row) => row.group).filter(Boolean)).size === 2 ? 2 : 3;
    const playoffStructure = generatePlayoffStructure(12, groupCount);
    for (const structure of playoffStructure) {
      const match = playoffMatches.find((row) => row.matchNumber === structure.matchNumber);
      if (!match) continue;
      add(structure.player1Seed, match.player1Id, match.player1);
      if (structure.round === 'playoff_r1') add(structure.player2Seed, match.player2Id, match.player2);
    }
    const finalsR1 = matches.filter((match) => match.stage === 'finals' && match.round === 'winners_r1');
    const finalsStructure = generateBracketStructure(16, groupCount).filter((match) => match.round === 'winners_r1');
    for (const structure of finalsStructure) {
      const match = finalsR1.find((row) => row.matchNumber === structure.matchNumber);
      if (!match) continue;
      if ((structure.player1Seed ?? 0) <= 12) add(structure.player1Seed, match.player1Id, match.player1);
      if ((structure.player2Seed ?? 0) <= 12) add(structure.player2Seed, match.player2Id, match.player2);
    }
  } else {
    const finals = matches.filter((match) => match.stage === 'finals');
    const bracketSize = finals.length > 20 ? 16 : 8;
    const openingRound = bracketSize === 16 ? 'winners_r1' : 'winners_qf';
    const openingStructure = generateBracketStructure(bracketSize).filter((match) => match.round === openingRound);
    for (const structure of openingStructure) {
      const match = finals.find((row) => row.matchNumber === structure.matchNumber);
      if (!match) continue;
      add(structure.player1Seed, match.player1Id, match.player1);
      add(structure.player2Seed, match.player2Id, match.player2);
    }
  }
  const snapshot = [...entries.values()].sort((a, b) => a.originalSeed - b.originalSeed);
  const expectedEntrantCount =
    playoffMatches.length > 0 ? 24 : matches.filter((match) => match.stage === 'finals').length > 20 ? 16 : 8;
  if (snapshot.length === expectedEntrantCount) {
    await (prisma.tournament as unknown as { update: (args: unknown) => Promise<unknown> }).update({
      where: { id: tournamentId },
      data: { [field]: snapshot },
    });
    return { status: 'complete', snapshot };
  }
  return {
    status: 'unsafe',
    snapshot: [],
    reason: playoffMatches.length > 0 ? 'incomplete_top24' : 'incomplete_opening_round',
  };
}
