/**
 * TC-2489: BM debug-fill route delegates to handleDebugFillRequest with mode='bm'.
 *
 * The route is a thin wrapper; these tests pin the delegation contract so that
 * a future refactor cannot silently pass the wrong mode string.
 */
jest.mock('@/lib/debug/debug-fill', () => ({
  handleDebugFillRequest: jest.fn(),
}));

import type { NextRequest } from 'next/server';
import { handleDebugFillRequest } from '@/lib/debug/debug-fill';
import { POST } from '@/app/api/tournaments/[id]/bm/debug-fill/route';

const mockHandleDebugFillRequest = jest.mocked(handleDebugFillRequest);

describe('POST /api/tournaments/[id]/bm/debug-fill (TC-2489)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('delegates to handleDebugFillRequest with mode "bm" and id from params', async () => {
    const mockResponse = { status: 200 };
    mockHandleDebugFillRequest.mockResolvedValue(mockResponse as unknown as ReturnType<typeof handleDebugFillRequest> extends Promise<infer R> ? R : never);

    const request = {} as unknown as NextRequest;
    const result = await POST(request, { params: Promise.resolve({ id: 't-abc' }) });

    expect(mockHandleDebugFillRequest).toHaveBeenCalledWith('t-abc', 'bm', request);
    expect(result).toBe(mockResponse);
  });

  it('passes a different tournament id correctly', async () => {
    const mockResponse = { status: 403 };
    mockHandleDebugFillRequest.mockResolvedValue(mockResponse as any);

    const request = {} as unknown as NextRequest;
    await POST(request, { params: Promise.resolve({ id: 'other-tournament' }) });

    expect(mockHandleDebugFillRequest).toHaveBeenCalledWith('other-tournament', 'bm', request);
  });
});
