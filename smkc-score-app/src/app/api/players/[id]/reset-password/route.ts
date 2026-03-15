/**
 * Player Password Reset API Route
 *
 * POST /api/players/:id/reset-password
 *
 * Generates a new random password for an existing player. Admin only.
 * The new plaintext password is returned once and cannot be retrieved again.
 *
 * Response (200):
 *   { temporaryPassword: "..." }
 *
 * Error responses:
 *   403 - Not admin
 *   404 - Player not found
 *   500 - Server error
 */
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { generateSecurePassword, hashPassword } from '@/lib/password-utils';
import { createAuditLog, AUDIT_ACTIONS } from '@/lib/audit-log';
import { getServerSideIdentifier } from '@/lib/rate-limit';
import { createLogger } from '@/lib/logger';
import { createErrorResponse, handleAuthzError } from '@/lib/error-handling';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const logger = createLogger('players-reset-password-api');
  const { id } = await params;

  try {
    const session = await auth();
    if (!session?.user || session.user.role !== 'admin') {
      return handleAuthzError();
    }

    // Verify the player exists before generating a new password
    const player = await prisma.player.findUnique({ where: { id } });
    if (!player) {
      return createErrorResponse('Player not found', 404);
    }

    const plainPassword = generateSecurePassword(12);
    const hashedPassword = await hashPassword(plainPassword);

    await prisma.player.update({
      where: { id },
      data: { password: hashedPassword },
    });

    // Audit log — non-critical, wrapped in try/catch
    try {
      const ip = await getServerSideIdentifier();
      const userAgent = request.headers.get('user-agent') || 'unknown';
      await createAuditLog({
        userId: session.user.id,
        ipAddress: ip,
        userAgent,
        action: AUDIT_ACTIONS.RESET_PLAYER_PASSWORD,
        targetId: id,
        targetType: 'Player',
        details: { playerNickname: player.nickname, passwordRegenerated: true },
      });
    } catch (logError) {
      logger.warn('Failed to create audit log', {
        error: logError,
        playerId: id,
        action: 'reset_player_password',
      });
    }

    return NextResponse.json({ temporaryPassword: plainPassword });
  } catch (error: unknown) {
    logger.error('Failed to reset player password', { error, playerId: id });

    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      error.code === 'P2025'
    ) {
      return createErrorResponse('Player not found', 404);
    }

    return createErrorResponse('Failed to reset password', 500);
  }
}
