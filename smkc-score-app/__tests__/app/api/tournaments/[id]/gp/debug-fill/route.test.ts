/**
 * TC-2491: GP debug-fill route delegates to handleDebugFillRequest with mode='gp'.
 */
jest.mock('@/lib/debug/debug-fill', () => ({
  handleDebugFillRequest: jest.fn(),
}));

import type { NextRequest } from 'next/server';
import { handleDebugFillRequest } from '@/lib/debug/debug-fill';
import { POST } from '@/app/api/tournaments/[id]/gp/debug-fill/route';

const mockHandleDebugFillRequest = jest.mocked(handleDebugFillRequest);

describe('POST /api/tournaments/[id]/gp/debug-fill (TC-2491)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('delegates to handleDebugFillRequest with mode "gp" and id from params', async () => {
    const mockResponse = { status: 200 };
    mockHandleDebugFillRequest.mockResolvedValue(mockResponse as any);

    const request = {} as unknown as NextRequest;
    const result = await POST(request, { params: Promise.resolve({ id: 'gp-tournament' }) });

    expect(mockHandleDebugFillRequest).toHaveBeenCalledWith('gp-tournament', 'gp', request);
    expect(result).toBe(mockResponse);
  });

  it('passes a different tournament id correctly', async () => {
    mockHandleDebugFillRequest.mockResolvedValue({ status: 403 } as any);

    const request = {} as unknown as NextRequest;
    await POST(request, { params: Promise.resolve({ id: 'other-id' }) });

    expect(mockHandleDebugFillRequest).toHaveBeenCalledWith('other-id', 'gp', request);
  });
});
