/**
 * TA (Time Attack) Player Promotion Module
 *
 * Handles the promotion of players between tournament stages in the
 * Time Attack competition mode. The promotion flow follows SMK rules:
 *
 * Qualification -> Revival 1:   Players ranked 17-24 (8 players)
 * Qualification -> Revival 2:   Players ranked 13-16 + Revival 1 survivors (top 4)
 *
 * Note: The legacy "Qualification -> Finals" (promoteToFinals) pathway was removed
 * as it was superseded by the Phase 1/2/3 system in /api/tournaments/[id]/ta/phases.
 *
 * Key behaviors:
 * - Players without valid total times are skipped (not promoted)
 * - Duplicate promotions are prevented via unique constraint check
 * - Revival round entries carry forward their qualification times
 * - All promotions are audit-logged for accountability
 *
 * Note: Logger is created inside functions (not at module level) to ensure
 * proper test mocking per the project's mock architecture pattern.
 */

import { createAuditLog, AUDIT_ACTIONS } from "@/lib/audit-log";
import { TTEntry, PrismaClient, Prisma } from "@prisma/client";
import { createLogger } from "@/lib/logger"

/**
 * Result of a promotion operation containing the created entries
 * and a list of player nicknames that were skipped.
 */
export interface PromotionResult {
  /** Newly created TTEntry records for promoted players */
  entries: TTEntry[];
  /** Nicknames of players skipped (e.g., due to incomplete times) */
  skipped: string[];
}

/**
 * Context information required for promotion operations.
 * Includes user identity and request metadata for audit logging.
 */
export interface PromotionContext {
  /** Tournament ID to promote players within */
  tournamentId: string;
  /** ID of the admin user performing the promotion */
  userId: string;
  /** Client IP address for audit trail */
  ipAddress: string;
  /** Client user agent string for audit trail */
  userAgent: string;
}

/**
 * Promote players to Revival Round 1 (Losers Round 1).
 *
 * Takes qualification ranks 17-24 (8 players who just missed the top 16).
 * These players get a second chance through the revival round system.
 *
 * Revival 1 entries carry forward their qualification times and total time,
 * and start with 1 life (sudden death elimination format).
 *
 * @param prisma - Prisma client instance
 * @param context - Promotion context with user and request info
 * @returns Promise with promotion result
 * @throws Error if not enough qualified players for revival round 1
 */
export async function promoteToRevival1(
  prisma: PrismaClient,
  context: PromotionContext
): Promise<PromotionResult> {
  const { tournamentId, userId, ipAddress, userAgent } = context;

  // Fetch players ranked 17-24 by skipping top 16 and taking next 8
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
    // Skip players without completed times
    if (qual.totalTime === null) {
      skippedEntries.push(qual.player.nickname);
      continue;
    }

    // Check for existing entry to prevent duplicates
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
      // Create revival_1 entry carrying forward qualification data
      // Lives set to 1 for sudden death elimination format
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

      // Audit log for accountability (non-critical)
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
         // Logger created inside catch block for proper test mocking
         const log = createLogger('promotion')
         log.error("Failed to create audit log", logError instanceof Error ? { message: logError.message, stack: logError.stack } : { error: logError });
       }
     }
   }

  return {
    entries: createdEntries,
    skipped: skippedEntries,
  };
}

/**
 * Promote players to Revival Round 2 (Losers Round 2).
 *
 * Combines two groups of players:
 * 1. Qualification ranks 13-16 (4 players who just missed top 12)
 * 2. Revival Round 1 survivors (top 4 non-eliminated players)
 *
 * This creates an 8-player field for the second revival round.
 * Entries carry forward their source stage times and start with 1 life.
 *
 * @param prisma - Prisma client instance
 * @param context - Promotion context with user and request info
 * @returns Promise with promotion result
 * @throws Error if no players available for revival round 2
 */
export async function promoteToRevival2(
  prisma: PrismaClient,
  context: PromotionContext
): Promise<PromotionResult> {
  const { tournamentId, userId, ipAddress, userAgent } = context;

  // Group 1: Qualification ranks 13-16 (skip top 12, take next 4)
  const qualifiers13to16 = await prisma.tTEntry.findMany({
    where: { tournamentId, stage: "qualification" },
    include: { player: true },
    orderBy: [{ rank: "asc" }, { totalTime: "asc" }],
    skip: 12,
    take: 4,
  });

  // Group 2: Revival Round 1 survivors (non-eliminated, top 4 by rank)
  const revival1Entries = await prisma.tTEntry.findMany({
    where: { tournamentId, stage: "revival_1", eliminated: false },
    include: { player: true },
    orderBy: { rank: "asc" },
    take: 4,
  });

  // Merge both groups into the candidate pool
  const allQualifiers = [...qualifiers13to16, ...revival1Entries];

  if (allQualifiers.length === 0) {
    throw new Error("No players available for revival round 2");
  }

  const createdEntries = [];
  const skippedEntries = [];

  for (const source of allQualifiers) {
    // Skip players without completed times
    if (source.totalTime === null) {
      skippedEntries.push(source.player.nickname);
      continue;
    }

    // Check for existing entry to prevent duplicates
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
      // Create revival_2 entry carrying forward source stage data
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

      // Audit log for accountability (non-critical)
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
         // Logger created inside catch block for proper test mocking
         const log = createLogger('promotion')
         log.error("Failed to create audit log", logError instanceof Error ? { message: logError.message, stack: logError.stack } : { error: logError });
       }
     }
   }

  return {
    entries: createdEntries,
    skipped: skippedEntries,
  };
}
