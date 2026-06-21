/**
 * TC-2490: MR debug-fill route delegates to handleDebugFillRequest with mode='mr'.
 */
jest.mock('@/lib/debug/debug-fill', () => ({
  handleDebugFillRequest: jest.fn(),
}));

import type { NextRequest } from 'next/server';
import { handleDebugFillRequest } from '@/lib/debug/debug-fill';
import { POST } from '@/app/api/tournaments/[id]/mr/debug-fill/route';

const mockHandleDebugFillRequest = jest.mocked(handleDebugFillRequest);

describe('POST /api/tournaments/[id]/mr/debug-fill (TC-2490)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('delegates to handleDebugFillRequest with mode "mr" and id from params', async () => {
    const mockResponse = { status: 200 };
    mockHandleDebugFillRequest.mockResolvedValue(mockResponse as any);

    const request = {} as unknown as NextRequest;
    const result = await POST(request, { params: Promise.resolve({ id: 'mr-tournament' }) });

    expect(mockHandleDebugFillRequest).toHaveBeenCalledWith('mr-tournament', 'mr', request);
    expect(result).toBe(mockResponse);
  });

  it('passes a different tournament id correctly', async () => {
    mockHandleDebugFillRequest.mockResolvedValue({ status: 403 } as any);

    const request = {} as unknown as NextRequest;
    await POST(request, { params: Promise.resolve({ id: 'other-id' }) });

    expect(mockHandleDebugFillRequest).toHaveBeenCalledWith('other-id', 'mr', request);
  });
});
