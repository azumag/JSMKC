/**
 * Player QR Login Token API Route (issue #3055)
 *
 * GET    /api/players/:id/qr-login-token - Check whether a QR login token is active
 * POST   /api/players/:id/qr-login-token - Issue (or reissue) a QR login token
 * DELETE /api/players/:id/qr-login-token - Revoke the active QR login token
 *
 * Authorization: the player themself (session.user.playerId === id) OR an
 * admin. This mirrors the design decision on issue #3055 that both the
 * player and tournament admins may manage QR login codes.
 *
 * Only a SHA-256 hash of the token is ever persisted (see
 * src/lib/qr-login-token.ts for why bcrypt is not used here). The raw
 * token is returned once, in the POST response, and cannot be retrieved
 * again — reissuing invalidates the previous QR code immediately since
 * only one token hash is stored per player.
 */
import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { generateQrLoginToken, hashQrLoginToken } from '@/lib/qr-login-token';
import { createAuditLog, AUDIT_ACTIONS, resolveAuditUserId } from '@/lib/audit-log';
import { getServerSideIdentifier } from '@/lib/rate-limit';
import { createLogger } from '@/lib/logger';
import { createErrorResponse, createSuccessResponse, handleAuthzError } from '@/lib/error-handling';
import { isPrismaErrorCode } from '@/lib/prisma-error';

/**
 * Verifies the caller is either the player themself or an admin.
 * Returns the session on success, or null if unauthorized.
 */
async function authorizeForPlayer(playerId: string) {
  const session = await auth();
  if (!session?.user) return null;

  const isAdmin = session.user.role === 'admin';
  const isSelf = session.user.userType === 'player' && session.user.playerId === playerId;
  return isAdmin || isSelf ? session : null;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const logger = createLogger('players-qr-login-token-api');
  const { id } = await params;

  try {
    const session = await authorizeForPlayer(id);
    if (!session) return handleAuthzError();

    const player = await prisma.player.findUnique({
      where: { id },
      select: { qrLoginTokenHash: true, qrLoginTokenIssuedAt: true },
    });
    if (!player) return createErrorResponse('Player not found', 404);

    return createSuccessResponse({
      active: player.qrLoginTokenHash !== null,
      issuedAt: player.qrLoginTokenIssuedAt,
    });
  } catch (error) {
    logger.error('Failed to read QR login token status', { error, playerId: id });
    return createErrorResponse('Failed to read QR login token status', 500);
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const logger = createLogger('players-qr-login-token-api');
  const { id } = await params;

  try {
    const session = await authorizeForPlayer(id);
    if (!session) return handleAuthzError();

    const player = await prisma.player.findUnique({
      where: { id },
      select: { nickname: true, qrLoginTokenHash: true },
    });
    if (!player) return createErrorResponse('Player not found', 404);

    const wasActive = player.qrLoginTokenHash !== null;
    const rawToken = generateQrLoginToken();
    const tokenHash = await hashQrLoginToken(rawToken);
    const issuedAt = new Date();

    await prisma.player.update({
      where: { id },
      data: { qrLoginTokenHash: tokenHash, qrLoginTokenIssuedAt: issuedAt },
    });

    try {
      const ip = await getServerSideIdentifier();
      const userAgent = request.headers.get('user-agent') || 'unknown';
      createAuditLog({
        userId: resolveAuditUserId(session),
        ipAddress: ip,
        userAgent,
        action: AUDIT_ACTIONS.ISSUE_PLAYER_QR_TOKEN,
        targetId: id,
        targetType: 'Player',
        details: { playerNickname: player.nickname, reissued: wasActive },
      }).catch((err) =>
        logger.warn('Failed to create audit log', {
          error: err,
          playerId: id,
          action: 'issue_player_qr_token',
        }),
      );
    } catch (logError) {
      logger.warn('Failed to create audit log', {
        error: logError,
        playerId: id,
        action: 'issue_player_qr_token',
      });
    }

    return createSuccessResponse({ token: rawToken, issuedAt: issuedAt.toISOString() });
  } catch (error: unknown) {
    logger.error('Failed to issue QR login token', { error, playerId: id });

    if (isPrismaErrorCode(error, 'P2025')) {
      return createErrorResponse('Player not found', 404);
    }

    return createErrorResponse('Failed to issue QR login token', 500);
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const logger = createLogger('players-qr-login-token-api');
  const { id } = await params;

  try {
    const session = await authorizeForPlayer(id);
    if (!session) return handleAuthzError();

    const player = await prisma.player.findUnique({
      where: { id },
      select: { nickname: true },
    });
    if (!player) return createErrorResponse('Player not found', 404);

    await prisma.player.update({
      where: { id },
      data: { qrLoginTokenHash: null, qrLoginTokenIssuedAt: null },
    });

    try {
      const ip = await getServerSideIdentifier();
      const userAgent = request.headers.get('user-agent') || 'unknown';
      createAuditLog({
        userId: resolveAuditUserId(session),
        ipAddress: ip,
        userAgent,
        action: AUDIT_ACTIONS.REVOKE_PLAYER_QR_TOKEN,
        targetId: id,
        targetType: 'Player',
        details: { playerNickname: player.nickname },
      }).catch((err) =>
        logger.warn('Failed to create audit log', {
          error: err,
          playerId: id,
          action: 'revoke_player_qr_token',
        }),
      );
    } catch (logError) {
      logger.warn('Failed to create audit log', {
        error: logError,
        playerId: id,
        action: 'revoke_player_qr_token',
      });
    }

    return createSuccessResponse({ active: false });
  } catch (error: unknown) {
    logger.error('Failed to revoke QR login token', { error, playerId: id });

    if (isPrismaErrorCode(error, 'P2025')) {
      return createErrorResponse('Player not found', 404);
    }

    return createErrorResponse('Failed to revoke QR login token', 500);
  }
}
