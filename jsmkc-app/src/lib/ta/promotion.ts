import { createAuditLog, AUDIT_ACTIONS } from "@/lib/audit-log";
import { TTEntry, PrismaClient, Prisma } from "@prisma/client";

export interface PromotionResult {
  entries: TTEntry[];
  skipped: string[];
}

export interface PromotionContext {
  tournamentId: string;
  userId: string;
  ipAddress: string;
  userAgent: string;
}

/**
 * Promote players to finals
 * @param prisma - Prisma client instance
 * @param context - Promotion context with user and request info
 * @param topN - Number of top players to promote (optional)
 * @param players - Specific players to promote (optional)
 * @returns Promise with promotion result
 */
export async function promoteToFinals(
  prisma: PrismaClient,
  context: PromotionContext,
  topN?: number,
  players?: string[]
): Promise<PromotionResult> {
  const { tournamentId, userId, ipAddress, userAgent } = context;

  let qualifiers;
  if (topN) {
    qualifiers = await prisma.tTEntry.findMany({
      where: { tournamentId, stage: "qualification" },
      include: { player: true },
      orderBy: [{ rank: "asc" }, { totalTime: "asc" }],
      take: topN,
    });
  } else if (players && players.length > 0) {
    qualifiers = await prisma.tTEntry.findMany({
      where: { tournamentId, stage: "qualification", playerId: { in: players } },
      include: { player: true },
    });
  } else {
    throw new Error("Invalid parameters: either topN or players array required");
  }

  if (qualifiers.length === 0) {
    throw new Error("No qualifying players found");
  }

  const createdEntries = [];
  const skippedEntries = [];

  for (const qual of qualifiers) {
    if (qual.totalTime === null) {
      skippedEntries.push(qual.player.nickname);
      continue;
    }

    const existingFinals = await prisma.tTEntry.findUnique({
      where: {
        tournamentId_playerId_stage: {
          tournamentId,
          playerId: qual.playerId,
          stage: "finals",
        },
      },
    });

    if (!existingFinals) {
      const entry = await prisma.tTEntry.create({
        data: {
          tournamentId,
          playerId: qual.playerId,
          stage: "finals",
          lives: 3,
          eliminated: false,
          times: {},
        },
        include: { player: true },
      });
      createdEntries.push(entry);

      try {
        await createAuditLog({
          userId,
          ipAddress,
          userAgent,
          action: AUDIT_ACTIONS.CREATE_TA_ENTRY,
          targetId: entry.id,
          targetType: "TTEntry",
          details: {
            tournamentId,
            playerId: qual.playerId,
            playerNickname: entry.player.nickname,
            qualRank: qual.rank,
            promotedTo: "finals",
          },
        });
      } catch (logError) {
        console.error("Failed to create audit log:", logError);
      }
    }
  }

  return {
    entries: createdEntries,
    skipped: skippedEntries,
  };
}

/**
 * Promote players to revival round 1 (players 17-24 from qualification)
 * @param prisma - Prisma client instance
 * @param context - Promotion context with user and request info
 * @returns Promise with promotion result
 */
export async function promoteToRevival1(
  prisma: PrismaClient,
  context: PromotionContext
): Promise<PromotionResult> {
  const { tournamentId, userId, ipAddress, userAgent } = context;

  const qualifiers = await prisma.tTEntry.findMany({
    where: { tournamentId, stage: "qualification" },
    include: { player: true },
    orderBy: [{ rank: "asc" }, { totalTime: "asc" }],
    skip: 16,
    take: 8,
  });

  if (qualifiers.length === 0) {
    throw new Error("Not enough qualified players for revival round 1");
  }

  const createdEntries = [];
  const skippedEntries = [];

  for (const qual of qualifiers) {
    if (qual.totalTime === null) {
      skippedEntries.push(qual.player.nickname);
      continue;
    }

    const existingRevival = await prisma.tTEntry.findUnique({
      where: {
        tournamentId_playerId_stage: {
          tournamentId,
          playerId: qual.playerId,
          stage: "revival_1",
        },
      },
    });

    if (!existingRevival) {
      const entry = await prisma.tTEntry.create({
        data: {
          tournamentId,
          playerId: qual.playerId,
          stage: "revival_1",
          lives: 1,
          eliminated: false,
          times: qual.times as Prisma.InputJsonValue,
          totalTime: qual.totalTime,
          rank: qual.rank,
        },
        include: { player: true },
      });
      createdEntries.push(entry);

      try {
        await createAuditLog({
          userId,
          ipAddress,
          userAgent,
          action: AUDIT_ACTIONS.CREATE_TA_ENTRY,
          targetId: entry.id,
          targetType: "TTEntry",
          details: {
            tournamentId,
            playerId: qual.playerId,
            playerNickname: entry.player.nickname,
            qualRank: qual.rank,
            promotedTo: "revival_1",
          },
        });
      } catch (logError) {
        console.error("Failed to create audit log:", logError);
      }
    }
  }

  return {
    entries: createdEntries,
    skipped: skippedEntries,
  };
}

/**
 * Promote players to revival round 2 (players 13-16 from qualification + survivors from revival 1)
 * @param prisma - Prisma client instance
 * @param context - Promotion context with user and request info
 * @returns Promise with promotion result
 */
export async function promoteToRevival2(
  prisma: PrismaClient,
  context: PromotionContext
): Promise<PromotionResult> {
  const { tournamentId, userId, ipAddress, userAgent } = context;

  const qualifiers13to16 = await prisma.tTEntry.findMany({
    where: { tournamentId, stage: "qualification" },
    include: { player: true },
    orderBy: [{ rank: "asc" }, { totalTime: "asc" }],
    skip: 12,
    take: 4,
  });

  const revival1Entries = await prisma.tTEntry.findMany({
    where: { tournamentId, stage: "revival_1", eliminated: false },
    include: { player: true },
    orderBy: { rank: "asc" },
    take: 4,
  });

  const allQualifiers = [...qualifiers13to16, ...revival1Entries];

  if (allQualifiers.length === 0) {
    throw new Error("No players available for revival round 2");
  }

  const createdEntries = [];
  const skippedEntries = [];

  for (const source of allQualifiers) {
    if (source.totalTime === null) {
      skippedEntries.push(source.player.nickname);
      continue;
    }

    const existingRevival = await prisma.tTEntry.findUnique({
      where: {
        tournamentId_playerId_stage: {
          tournamentId,
          playerId: source.playerId,
          stage: "revival_2",
        },
      },
    });

    if (!existingRevival) {
      const entry = await prisma.tTEntry.create({
        data: {
          tournamentId,
          playerId: source.playerId,
          stage: "revival_2",
          lives: 1,
          eliminated: false,
          times: source.times as Prisma.InputJsonValue,
          totalTime: source.totalTime,
          rank: source.rank,
        },
        include: { player: true },
      });
      createdEntries.push(entry);

      try {
        await createAuditLog({
          userId,
          ipAddress,
          userAgent,
          action: AUDIT_ACTIONS.CREATE_TA_ENTRY,
          targetId: entry.id,
          targetType: "TTEntry",
          details: {
            tournamentId,
            playerId: source.playerId,
            playerNickname: entry.player.nickname,
            sourceStage: source.stage,
            promotedTo: "revival_2",
          },
        });
      } catch (logError) {
        console.error("Failed to create audit log:", logError);
      }
    }
  }

  return {
    entries: createdEntries,
    skipped: skippedEntries,
  };
}
