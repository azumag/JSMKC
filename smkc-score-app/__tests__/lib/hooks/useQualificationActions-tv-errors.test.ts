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

function makeHook() {
  return renderHook(() =>
    useQualificationActions({ tournamentId: TOURNAMENT_ID, mode: 'bm', refetch: jest.fn() }),
  );
}

describe('useQualificationActions TV assignment feedback', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('keeps successful assignment silent', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true } as Response);
    const { result } = makeHook();

    act(() => {
      result.current.handleTvAssign('match-1', 2);
    });

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('shows the concrete API error for a non-ok response', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'TV slot is unavailable' }),
    } as unknown as Response);
    const { result } = makeHook();

    act(() => {
      result.current.handleTvAssign('match-1', 2);
    });

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('TV slot is unavailable'));
  });

  it('uses common.networkError when a non-ok response has no API error', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      json: async () => ({}),
    } as unknown as Response);
    const { result } = makeHook();

    act(() => {
      result.current.handleTvAssign('match-1', null);
    });

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('networkError'));
  });

  it('uses common.networkError when the request rejects', async () => {
    (global.fetch as jest.Mock).mockRejectedValue(new Error('offline'));
    const { result } = makeHook();

    act(() => {
      result.current.handleTvAssign('match-1', 3);
    });

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('networkError'));
  });
});
