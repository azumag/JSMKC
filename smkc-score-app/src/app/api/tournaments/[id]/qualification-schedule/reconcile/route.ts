import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { resolveAuditUserId } from '@/lib/audit-log';
import { checkRateLimit } from '@/lib/rate-limit';
import { getClientIdentifier, getUserAgent } from '@/lib/request-utils';
import { sanitizeInput } from '@/lib/sanitize';
import { createLogger } from '@/lib/logger';
import { resolveTournamentId } from '@/lib/tournament-identifier';
import {
  createErrorResponse,
  createSuccessResponse,
  handleAuthzError,
  handleRateLimitError,
  handleValidationError,
} from '@/lib/error-handling';
import { CdmQualificationReconciliationError } from '@/lib/cdm-qualification-reconciliation';
import {
  applyCdmQualificationReconciliation,
  previewCdmQualificationReconciliation,
  publicCdmReconciliationPreview,
} from '@/lib/cdm-qualification-reconciliation-service';

const DIGEST_RE = /^[a-f0-9]{64}$/;

function statusForReconciliationError(code: string): number {
  if (code === 'TOURNAMENT_NOT_FOUND') return 404;
  if (
    code === 'JSMKC_TOURNAMENT_EXCLUDED' ||
    code === 'TOURNAMENT_NOT_COMPLETED' ||
    code === 'QUALIFICATION_NOT_CONFIRMED' ||
    code === 'RECONCILIATION_STALE_PREVIEW'
  ) {
    return 409;
  }
  return 422;
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const logger = createLogger('cdm-qualification-reconciliation-api');
  const session = await auth();
  if (!session?.user || session.user.role !== 'admin') {
    return handleAuthzError();
  }

  const clientIp = getClientIdentifier(request);
  const rateResult = await checkRateLimit('general', clientIp);
  if (!rateResult.success) {
    return handleRateLimitError(rateResult.retryAfter);
  }

  const { id } = await params;
  try {
    const tournamentId = await resolveTournamentId(id);
    const body = sanitizeInput(await request.json());
    const action = body.action;

    if (action !== 'preview' && action !== 'apply') {
      return handleValidationError('action must be "preview" or "apply"', 'action');
    }

    if (action === 'preview') {
      const preview = await previewCdmQualificationReconciliation(tournamentId);
      return createSuccessResponse(publicCdmReconciliationPreview(preview));
    }

    const digest = body.digest;
    if (typeof digest !== 'string' || !DIGEST_RE.test(digest)) {
      return handleValidationError('A valid preview digest is required', 'digest');
    }

    const result = await applyCdmQualificationReconciliation({
      tournamentId,
      expectedDigest: digest,
      audit: {
        userId: resolveAuditUserId(session),
        ipAddress: clientIp,
        userAgent: getUserAgent(request),
      },
    });
    return createSuccessResponse(result, 'CDM qualification schedule reconciled and archive regenerated');
  } catch (error) {
    if (error instanceof CdmQualificationReconciliationError) {
      return createErrorResponse(error.message, statusForReconciliationError(error.code), error.code, error.details);
    }
    logger.error('Failed to reconcile CDM qualification schedule', {
      error,
      tournamentIdentifier: id,
    });
    return createErrorResponse('Failed to reconcile CDM qualification schedule', 500, 'INTERNAL_ERROR');
  }
}
