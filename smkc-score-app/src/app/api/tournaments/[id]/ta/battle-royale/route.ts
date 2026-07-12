import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { requireAdminSession } from '@/lib/api-auth';
import { sanitizeInput } from '@/lib/sanitize';
import { createErrorResponse } from '@/lib/error-handling';
import { resolveTournament } from '@/lib/tournament-identifier';
import { getTaPhase3Rules, normalizeTaHandicapSeconds } from '@/lib/ta/battle-royale';
import { PLAYER_PUBLIC_SELECT } from '@/lib/prisma-selects';
import { createAuditLogs, AUDIT_ACTIONS, resolveAuditUserId } from '@/lib/audit-log';
import { getClientIdentifier, getUserAgent } from '@/lib/request-utils';
import { createLogger } from '@/lib/logger';

const HandicapValueSchema = z.union([z.literal(0), z.literal(-1), z.literal(-3), z.literal(-5)]);

export const TA_BATTLE_ROYALE_MAX_PLAYERS = 100;
export const TA_BATTLE_ROYALE_ENTRY_CHUNK = 14;

const StartBattleRoyaleSchema = z.object({
  players: z
    .array(
      z.object({
        playerId: z.string().cuid(),
        taHandicapSeconds: HandicapValueSchema,
      }),
    )
    .min(2)
    .max(TA_BATTLE_ROYALE_MAX_PLAYERS),
});

/**
 * POST /api/tournaments/[id]/ta/battle-royale
 *
 * Starts a TA battle royale without a qualification stage. The selected roster
 * is written directly to Phase 3 with the battle-royale initial life count and
 * per-tournament handicap snapshots.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const logger = createLogger('ta-battle-royale-api');
  const authResult = await requireAdminSession();
  if (authResult.error) return authResult.error;

  const { id } = await params;

  try {
    const tournament = await resolveTournament(id, {
      id: true,
      status: true,
      taBattleRoyaleMode: true,
    });
    if (!tournament) {
      return createErrorResponse('Tournament not found', 404, 'NOT_FOUND');
    }
    if (!tournament.taBattleRoyaleMode) {
      return createErrorResponse('Tournament is not configured for TA battle royale', 400, 'INVALID_TA_MODE');
    }
    if (tournament.status !== 'draft') {
      return createErrorResponse('Tournament must be in draft status', 409, 'TOURNAMENT_NOT_DRAFT');
    }

    const parsed = StartBattleRoyaleSchema.safeParse(sanitizeInput(await request.json()));
    if (!parsed.success) {
      return createErrorResponse(
        parsed.error.issues[0]?.message || 'At least two players are required',
        400,
        'VALIDATION_ERROR',
      );
    }

    const playerIds = parsed.data.players.map((player) => player.playerId);
    if (new Set(playerIds).size !== playerIds.length) {
      return createErrorResponse('Duplicate players are not allowed', 400, 'VALIDATION_ERROR');
    }

    const existingPhase3Count = await prisma.tTEntry.count({
      where: { tournamentId: tournament.id, stage: 'phase3' },
    });
    const phaseRoundCount = await prisma.tTPhaseRound.count({
      where: { tournamentId: tournament.id, phase: 'phase3' },
    });
    const players = await prisma.player.findMany({
      where: { id: { in: playerIds }, deletedAt: null },
      select: { id: true },
    });

    if (existingPhase3Count > 0 || phaseRoundCount > 0) {
      return createErrorResponse('TA battle royale has already started', 409, 'BATTLE_ROYALE_ALREADY_STARTED');
    }
    if (players.length !== playerIds.length) {
      return createErrorResponse('One or more players were not found', 400, 'PLAYER_NOT_FOUND');
    }

    const rules = getTaPhase3Rules(true);
    const handicapByPlayerId = new Map(
      parsed.data.players.map((player) => [player.playerId, normalizeTaHandicapSeconds(player.taHandicapSeconds)]),
    );
    const entryData = playerIds.map((playerId) => ({
      tournamentId: tournament.id,
      playerId,
      stage: 'phase3',
      lives: rules.initialLives,
      eliminated: false,
      times: {},
      taHandicapSeconds: handicapByPlayerId.get(playerId) ?? 0,
    }));

    // D1 allows roughly 100 bound parameters per statement. Each TTEntry row
    // binds 7 values, so 14 rows (98 parameters) is the largest safe chunk.
    for (let i = 0; i < entryData.length; i += TA_BATTLE_ROYALE_ENTRY_CHUNK) {
      await prisma.tTEntry.createMany({
        data: entryData.slice(i, i + TA_BATTLE_ROYALE_ENTRY_CHUNK),
      });
    }

    const createdEntries = await prisma.tTEntry.findMany({
      where: {
        tournamentId: tournament.id,
        stage: 'phase3',
        playerId: { in: playerIds },
      },
      include: { player: { select: PLAYER_PUBLIC_SELECT } },
      orderBy: { createdAt: 'asc' },
    });

    const ipAddress = getClientIdentifier(request);
    const userAgent = getUserAgent(request);
    await createAuditLogs(
      createdEntries.map((entry) => ({
        userId: resolveAuditUserId(authResult.session),
        ipAddress,
        userAgent,
        action: AUDIT_ACTIONS.CREATE_TA_ENTRY,
        targetId: entry.id,
        targetType: 'TTEntry',
        details: {
          tournamentId: tournament.id,
          playerId: entry.playerId,
          playerNickname: entry.player.nickname,
          initializedAt: 'phase3',
          initialLives: rules.initialLives,
          taHandicapSeconds: normalizeTaHandicapSeconds(entry.taHandicapSeconds),
        },
      })),
    );

    return NextResponse.json(
      {
        success: true,
        data: {
          entries: createdEntries,
          phase: 'phase3',
          initialLives: rules.initialLives,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    logger.error('Failed to start TA battle royale', {
      error,
      tournamentId: id,
    });
    return createErrorResponse('Failed to start TA battle royale', 500, 'INTERNAL_ERROR');
  }
}
