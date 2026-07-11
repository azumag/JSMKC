import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { createErrorResponse, createSuccessResponse, handleAuthzError } from '@/lib/error-handling';
import { createLogger } from '@/lib/logger';
import { readTournamentArchive } from '@/lib/tournament-archive';
import { restoreTournamentArchiveForReopen } from '@/lib/tournament-archive-restore';

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
    return createSuccessResponse(restored.tournament);
  } catch (error) {
    logger.error('Failed to restore archived tournament', { error, identifier: id });
    if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') {
      return createErrorResponse('Tournament or player data conflicts with an existing record', 409, 'CONFLICT');
    }
    return createErrorResponse('Failed to restore tournament archive', 500, 'INTERNAL_ERROR');
  }
}
