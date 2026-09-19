/**
 * @jest-environment jsdom
 */

import { act, renderHook, waitFor } from '@testing-library/react';
import { useQualificationActions } from '@/lib/hooks/useQualificationActions';
import { toast } from 'sonner';

jest.mock('@/lib/client-logger', () => ({
  createLogger: jest.fn(() => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn() })),
}));

jest.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

jest.mock('sonner', () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
  },
}));

const TOURNAMENT_ID = 'tournament-tv-errors';

function makeHook(refetch = jest.fn()) {
  return renderHook(() => useQualificationActions({ tournamentId: TOURNAMENT_ID, mode: 'bm', refetch }));
}

describe('useQualificationActions TV assignment feedback', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('keeps successful assignment silent without an extra refetch', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true } as Response);
    const refetch = jest.fn();
    const { result } = makeHook(refetch);

    act(() => {
      result.current.handleTvAssign('match-1', 2);
    });

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
    expect(toast.error).not.toHaveBeenCalled();
    expect(refetch).not.toHaveBeenCalled();
  });

  it('uses common.networkError without exposing API detail after a non-ok response', async () => {
    const json = jest.fn(async () => ({ error: 'TV slot is unavailable' }));
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 409,
      json,
    } as unknown as Response);
    const refetch = jest.fn();
    const { result } = makeHook(refetch);

    act(() => {
      result.current.handleTvAssign('match-1', 2);
    });

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('networkError'));
    expect(toast.error).not.toHaveBeenCalledWith('TV slot is unavailable');
    expect(json).not.toHaveBeenCalled();
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('uses common.networkError and refetches when the request rejects', async () => {
    (global.fetch as jest.Mock).mockRejectedValue(new Error('offline'));
    const refetch = jest.fn();
    const { result } = makeHook(refetch);

    act(() => {
      result.current.handleTvAssign('match-1', 3);
    });

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('networkError'));
    expect(refetch).toHaveBeenCalledTimes(1);
  });
});
