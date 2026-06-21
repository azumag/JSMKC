/**
 * TC-2492: TA debug-fill route delegates to handleDebugFillRequest with mode='ta'.
 */
jest.mock('@/lib/debug/debug-fill', () => ({
  handleDebugFillRequest: jest.fn(),
}));

import type { NextRequest } from 'next/server';
import { handleDebugFillRequest } from '@/lib/debug/debug-fill';
import { POST } from '@/app/api/tournaments/[id]/ta/debug-fill/route';

const mockHandleDebugFillRequest = jest.mocked(handleDebugFillRequest);

describe('POST /api/tournaments/[id]/ta/debug-fill (TC-2492)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('delegates to handleDebugFillRequest with mode "ta" and id from params', async () => {
    const mockResponse = { status: 200 };
    mockHandleDebugFillRequest.mockResolvedValue(mockResponse as any);

    const request = {} as unknown as NextRequest;
    const result = await POST(request, { params: Promise.resolve({ id: 'ta-tournament' }) });

    expect(mockHandleDebugFillRequest).toHaveBeenCalledWith('ta-tournament', 'ta', request);
    expect(result).toBe(mockResponse);
  });

  it('passes a different tournament id correctly', async () => {
    mockHandleDebugFillRequest.mockResolvedValue({ status: 403 } as any);

    const request = {} as unknown as NextRequest;
    await POST(request, { params: Promise.resolve({ id: 'other-id' }) });

    expect(mockHandleDebugFillRequest).toHaveBeenCalledWith('other-id', 'ta', request);
  });
});
