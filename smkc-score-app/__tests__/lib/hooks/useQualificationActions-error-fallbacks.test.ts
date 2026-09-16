/**
 * @jest-environment jsdom
 */

import { act, renderHook } from '@testing-library/react';
import { useQualificationActions } from '@/lib/hooks/useQualificationActions';

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

const TOURNAMENT_ID = 'tournament-error-fallback';
const MODE = 'bm' as const;

function makeHook(refetch = jest.fn()) {
  return renderHook(() => useQualificationActions({ tournamentId: TOURNAMENT_ID, mode: MODE, refetch }));
}

describe('useQualificationActions rank mutation error fallbacks', () => {
  let alertSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
    alertSpy = jest.spyOn(window, 'alert').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('uses common.networkError when a single rank override response has no API error', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      json: async () => ({}),
    } as unknown as Response);
    const refetch = jest.fn();
    const { result } = makeHook(refetch);

    await act(async () => {
      await result.current.handleRankOverrideSave('qual-1', 1);
    });

    expect(alertSpy).toHaveBeenCalledWith('networkError');
    expect(refetch).not.toHaveBeenCalled();
  });

  it('keeps a concrete API error ahead of the localized fallback for bulk rank overrides', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'Rank is locked' }),
    } as unknown as Response);
    const { result } = makeHook();

    let returnValue: boolean | undefined;
    await act(async () => {
      returnValue = await result.current.handleBulkRankOverrideSave([{ qualificationId: 'qual-1', rankOverride: 1 }]);
    });

    expect(alertSpy).toHaveBeenCalledWith('Rank is locked');
    expect(returnValue).toBe(false);
  });

  it('shows common.networkError when a combined-rank request rejects', async () => {
    (global.fetch as jest.Mock).mockRejectedValue(new Error('offline'));
    const refetch = jest.fn();
    const { result } = makeHook(refetch);

    await act(async () => {
      await result.current.handleCombinedRankOverrideSave('qual-1', 2);
    });

    expect(alertSpy).toHaveBeenCalledWith('networkError');
    expect(refetch).not.toHaveBeenCalled();
  });

  it('shows common.networkError and returns false when a bulk combined-rank request rejects', async () => {
    (global.fetch as jest.Mock).mockRejectedValue(new Error('offline'));
    const refetch = jest.fn();
    const { result } = makeHook(refetch);

    let returnValue: boolean | undefined;
    await act(async () => {
      returnValue = await result.current.handleBulkCombinedRankOverrideSave([
        { qualificationId: 'qual-1', combinedRankOverride: 1 },
      ]);
    });

    expect(alertSpy).toHaveBeenCalledWith('networkError');
    expect(refetch).not.toHaveBeenCalled();
    expect(returnValue).toBe(false);
  });
});
