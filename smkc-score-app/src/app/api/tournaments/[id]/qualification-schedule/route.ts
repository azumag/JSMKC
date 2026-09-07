import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { createErrorResponse, createSuccessResponse, handleAuthzError } from '@/lib/error-handling';
import { createLogger } from '@/lib/logger';
import prisma from '@/lib/prisma';
import { buildQualificationScheduleDiagnostics } from '@/lib/qualification-schedule-diagnostics';
import type { QualificationScheduleMethod } from '@/lib/round-robin';
import { resolveTournament } from '@/lib/tournament-identifier';

/**
 * Read-only diagnostics for the effective qualification schedule policy.
 *
 * This endpoint deliberately does not mutate tournament configuration. It is
 * intended to make Issue #3054's current 13 -> 14 policy boundary observable
 * to operators while the tournament-rules decision remains pending.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const logger = createLogger('qualification-schedule-diagnostics-api');
  const session = await auth();
  if (!session?.user || session.user.role !== 'admin') {
    return handleAuthzError();
  }

  const { id } = await params;

  try {
    const tournament = await resolveTournament(id, {
      id: true,
      qualificationScheduleMethod: true,
    });
    if (!tournament) {
      return createErrorResponse('Tournament not found', 404, 'NOT_FOUND');
    }

    const configuredMethod: QualificationScheduleMethod =
      tournament.qualificationScheduleMethod === 'cdm' ? 'cdm' : 'circle';

    const [bm, mr, gp] = await Promise.all([
      prisma.bMQualification.findMany({ where: { tournamentId: tournament.id }, select: { group: true } }),
      prisma.mRQualification.findMany({ where: { tournamentId: tournament.id }, select: { group: true } }),
      prisma.gPQualification.findMany({ where: { tournamentId: tournament.id }, select: { group: true } }),
    ]);

    return createSuccessResponse({
      tournamentId: tournament.id,
      configuredMethod,
      modes: buildQualificationScheduleDiagnostics(configuredMethod, { bm, mr, gp }),
    });
  } catch (error) {
    logger.error('Failed to fetch qualification schedule diagnostics', {
      error,
      tournamentIdentifier: id,
    });
    return createErrorResponse('Failed to fetch qualification schedule diagnostics', 500, 'INTERNAL_ERROR');
  }
}
