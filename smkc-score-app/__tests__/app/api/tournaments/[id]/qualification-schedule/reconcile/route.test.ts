jest.mock('next/server', () => ({
  NextResponse: {
    json: jest.fn((data: unknown, options?: { status?: number }) => ({ data, status: options?.status ?? 200 })),
  },
  NextRequest: jest.fn(),
}));

jest.mock('@/lib/auth', () => ({ auth: jest.fn() }));
jest.mock('@/lib/audit-log', () => ({ resolveAuditUserId: jest.fn(() => 'admin') }));
jest.mock('@/lib/rate-limit', () => ({ checkRateLimit: jest.fn() }));
jest.mock('@/lib/request-utils', () => ({
  getClientIdentifier: jest.fn(() => '127.0.0.1'),
  getUserAgent: jest.fn(() => 'jest'),
}));
jest.mock('@/lib/sanitize', () => ({ sanitizeInput: jest.fn((value) => value) }));
jest.mock('@/lib/logger', () => ({
  createLogger: jest.fn(() => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() })),
}));
jest.mock('@/lib/tournament-identifier', () => ({ resolveTournamentId: jest.fn(async (id) => id) }));
jest.mock('@/lib/cdm-qualification-reconciliation-service', () => ({
  applyCdmQualificationReconciliation: jest.fn(),
  previewCdmQualificationReconciliation: jest.fn(),
  publicCdmReconciliationPreview: jest.fn((value) => value),
}));

import { NextResponse, type NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { checkRateLimit } from '@/lib/rate-limit';
import { CdmQualificationReconciliationError } from '@/lib/cdm-qualification-reconciliation';
import { applyCdmQualificationReconciliation } from '@/lib/cdm-qualification-reconciliation-service';
import { POST } from '@/app/api/tournaments/[id]/qualification-schedule/reconcile/route';

function request(body: unknown): NextRequest {
  return {
    json: async () => body,
    headers: { get: () => 'jest' },
  } as unknown as NextRequest;
}

const params = { params: Promise.resolve({ id: 'cdm-archive' }) };

describe('POST qualification schedule reconciliation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (auth as jest.Mock).mockResolvedValue({ user: { id: 'admin', role: 'admin' } });
    (checkRateLimit as jest.Mock).mockResolvedValue({ success: true });
  });

  it('returns 409 when the in-batch state guard reports a stale preview', async () => {
    (applyCdmQualificationReconciliation as jest.Mock).mockRejectedValue(
      new CdmQualificationReconciliationError(
        'Tournament data changed after the preview. Generate a new preview before applying.',
        'RECONCILIATION_STALE_PREVIEW',
      ),
    );

    await POST(request({ action: 'apply', digest: 'a'.repeat(64) }), params);

    expect(NextResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, code: 'RECONCILIATION_STALE_PREVIEW' }),
      { status: 409 },
    );
  });

  it('returns 503 with applied-state details when only archive regeneration remains pending', async () => {
    (applyCdmQualificationReconciliation as jest.Mock).mockRejectedValue(
      new CdmQualificationReconciliationError(
        'The schedule correction was saved, but archive regeneration failed.',
        'ARCHIVE_REGENERATION_PENDING',
        { scheduleApplied: true, archivePending: true, retryable: true },
      ),
    );

    await POST(request({ action: 'apply', digest: 'b'.repeat(64) }), params);

    expect(NextResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        code: 'ARCHIVE_REGENERATION_PENDING',
        details: { scheduleApplied: true, archivePending: true, retryable: true },
      }),
      { status: 503 },
    );
  });
});
