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

const TOURNAMENT_ID = 'tournament-rank-result';
const MODE = 'bm' as const;

function makeHook(refetch = jest.fn()) {
  return renderHook(() => useQualificationActions({ tournamentId: TOURNAMENT_ID, mode: MODE, refetch }));
}

describe('useQualificationActions single-rank result contract', () => {
  let alertSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
    alertSpy = jest.spyOn(window, 'alert').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns true after a successful rank override save', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true } as Response);
    const refetch = jest.fn();
    const { result } = makeHook(refetch);
    let saved: boolean | undefined;

    await act(async () => {
      saved = await result.current.handleRankOverrideSave('qual-1', 2);
    });

    expect(saved).toBe(true);
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('returns false after a non-ok rank override save', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'Rank is locked' }),
    } as unknown as Response);
    const refetch = jest.fn();
    const { result } = makeHook(refetch);
    let saved: boolean | undefined;

    await act(async () => {
      saved = await result.current.handleRankOverrideSave('qual-1', 2);
    });

    expect(saved).toBe(false);
    expect(alertSpy).toHaveBeenCalledWith('Rank is locked');
    expect(refetch).not.toHaveBeenCalled();
  });

  it('returns false after a rejected rank override request', async () => {
    (global.fetch as jest.Mock).mockRejectedValue(new Error('offline'));
    const { result } = makeHook();
    let saved: boolean | undefined;

    await act(async () => {
      saved = await result.current.handleRankOverrideSave('qual-1', 2);
    });

    expect(saved).toBe(false);
    expect(alertSpy).toHaveBeenCalledWith('networkError');
  });

  it('returns true after a successful combined rank override save', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true } as Response);
    const refetch = jest.fn();
    const { result } = makeHook(refetch);
    let saved: boolean | undefined;

    await act(async () => {
      saved = await result.current.handleCombinedRankOverrideSave('qual-1', 1);
    });

    expect(saved).toBe(true);
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('returns false after a rejected combined rank override request', async () => {
    (global.fetch as jest.Mock).mockRejectedValue(new Error('offline'));
    const { result } = makeHook();
    let saved: boolean | undefined;

    await act(async () => {
      saved = await result.current.handleCombinedRankOverrideSave('qual-1', null);
    });

    expect(saved).toBe(false);
    expect(alertSpy).toHaveBeenCalledWith('networkError');
  });
});
