import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { createAuditLog, AUDIT_ACTIONS, resolveAuditUserId } from '@/lib/audit-log';
import { createErrorResponse, createSuccessResponse, handleAuthzError } from '@/lib/error-handling';
import { createLogger } from '@/lib/logger';
import { getServerSideIdentifier } from '@/lib/rate-limit';
import { readTournamentArchive } from '@/lib/tournament-archive';
import { restoreTournamentArchiveForReopen } from '@/lib/tournament-archive-restore';
import { isPrismaErrorCode } from '@/lib/prisma-error';

function restoreStageFromError(error: unknown): string | null {
  if (!error || typeof error !== 'object' || !('restoreStage' in error)) return null;
  return typeof error.restoreStage === 'string' && error.restoreStage.trim() ? error.restoreStage : null;
}

function restoreDiagnosticFromError(error: unknown): string | null {
  if (!error || typeof error !== 'object') return null;

  const wrapped = error as {
    cause?: unknown;
    message?: unknown;
  };
  const cause = wrapped.cause && typeof wrapped.cause === 'object' ? wrapped.cause : error;
  const candidate = cause as { code?: unknown; message?: unknown };
  const code = typeof candidate.code === 'string' ? candidate.code.trim() : '';
  const message =
    cause instanceof Error
      ? cause.message
      : typeof candidate.message === 'string'
        ? candidate.message
        : typeof wrapped.message === 'string'
          ? wrapped.message
          : '';
  const diagnostic = [code, message].filter(Boolean).join(': ').replace(/\s+/g, ' ').trim();
  return diagnostic ? diagnostic.slice(0, 240) : null;
}

/**
 * POST /api/tournaments/:id/restore
 *
 * Recreates an archived-only tournament in D1 and returns it in the active,
 * unpublished state. This is used when the normal completed -> active PUT
 * discovers that the live row was previously deleted after archiving.
 */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const logger = createLogger('tournament-archive-restore-api');
  const session = await auth();
  if (!session?.user || session.user.role !== 'admin') return handleAuthzError();

  const { id } = await params;
  const archive = await readTournamentArchive(id);
  if (!archive) {
    return createErrorResponse('Tournament archive not found', 404, 'NOT_FOUND');
  }
  if (archive.tournament.status !== 'completed') {
    return createErrorResponse('Only completed tournament archives can be reopened', 409, 'CONFLICT');
  }

  try {
    const restored = await restoreTournamentArchiveForReopen(archive);
    if (!restored.tournament) {
      return createErrorResponse('Failed to restore tournament', 500, 'INTERNAL_ERROR');
    }

    logger.info('Restored archived tournament for reopen', {
      tournamentId: restored.tournament.id,
      restoredPlayerCount: restored.restoredPlayerCount,
      reusedPlayerCount: restored.reusedPlayerCount,
    });

    // Issue #2901: restoring a tournament recreates Tournament + possibly
    // Player rows, so record it like the other admin lifecycle operations.
    try {
      const ip = await getServerSideIdentifier();
      const userAgent = _request.headers.get('user-agent') || 'unknown';
      createAuditLog({
        userId: resolveAuditUserId(session),
        ipAddress: ip,
        userAgent,
        action: AUDIT_ACTIONS.CREATE_TOURNAMENT,
        targetId: restored.tournament.id,
        targetType: 'Tournament',
        details: {
          tournamentId: restored.tournament.id,
          restoredPlayerCount: restored.restoredPlayerCount,
          reusedPlayerCount: restored.reusedPlayerCount,
          source: 'archive_reopen',
        },
      }).catch((err) =>
        logger.warn('Failed to create audit log', {
          error: err,
          tournamentId: restored.tournament.id,
        }),
      );
    } catch (auditError) {
      logger.warn('Failed to create audit log', {
        error: auditError,
        tournamentId: restored.tournament.id,
      });
    }

    return createSuccessResponse(restored.tournament);
  } catch (error) {
    logger.error('Failed to restore archived tournament', {
      error,
      identifier: id,
    });
    if (isPrismaErrorCode(error, 'P2002')) {
      return createErrorResponse('Tournament or player data conflicts with an existing record', 409, 'CONFLICT');
    }

    const stage = restoreStageFromError(error);
    const diagnostic = restoreDiagnosticFromError(error);
    const summary = stage ? `Failed to restore tournament archive (${stage})` : 'Failed to restore tournament archive';
    return createErrorResponse(diagnostic ? `${summary}: ${diagnostic}` : summary, 500, 'INTERNAL_ERROR');
  }
}
