/**
 * @jest-environment jsdom
 */
import { act, renderHook } from '@testing-library/react';
import { useQualificationSetup } from '@/lib/hooks/useQualificationSetup';
import type { SetupPlayer } from '@/lib/group-utils';

const mockLogger = {
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
};

jest.mock('@/lib/client-logger', () => ({
  createLogger: jest.fn(() => mockLogger),
}));

jest.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

const tournamentId = 'tournament-abc';
const players: SetupPlayer[] = [{ playerId: 'p1', group: 'A', seeding: 1 }];

function makeHook(refetch = jest.fn()) {
  return renderHook(() => useQualificationSetup({ tournamentId, mode: 'bm', refetch }));
}

beforeEach(() => {
  jest.clearAllMocks();
  global.fetch = jest.fn();
});

describe('useQualificationSetup', () => {
  it('posts a stable player snapshot and refreshes after success', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true, status: 200 } as Response);
    const refetch = jest.fn();
    const { result } = makeHook(refetch);

    let outcome;
    await act(async () => {
      outcome = await result.current.submitSetup(players);
    });

    expect(global.fetch).toHaveBeenCalledWith(`/api/tournaments/${tournamentId}/bm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ players }),
    });
    expect(refetch).toHaveBeenCalledTimes(1);
    expect(outcome).toEqual({ ok: true });
    expect(result.current.setupError).toBeNull();
    expect(result.current.setupSaving).toBe(false);
  });

  it('keeps a 4xx response as a validation error without refreshing', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: 'Invalid seeding', code: 'INVALID_SEEDING' }),
    } as unknown as Response);
    const refetch = jest.fn();
    const { result } = makeHook(refetch);

    let outcome;
    await act(async () => {
      outcome = await result.current.submitSetup(players);
    });

    expect(outcome).toEqual({
      ok: false,
      error: {
        kind: 'validation',
        status: 400,
        code: 'INVALID_SEEDING',
        message: 'Invalid seeding',
      },
    });
    expect(result.current.setupError).toEqual(expect.objectContaining({ kind: 'validation' }));
    expect(refetch).not.toHaveBeenCalled();
    expect(mockLogger.warn).toHaveBeenCalledWith(
      'Qualification setup rejected',
      expect.objectContaining({ status: 400, code: 'INVALID_SEEDING' }),
    );
  });

  it('uses a localized server fallback for a non-JSON 5xx response', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => {
        throw new Error('not json');
      },
    } as unknown as Response);
    const { result } = makeHook();

    await act(async () => {
      await result.current.submitSetup(players);
    });

    expect(result.current.setupError).toEqual({
      kind: 'server',
      status: 503,
      code: undefined,
      message: 'setupServerError',
    });
  });

  it('reports a network failure without closing or clearing caller-owned state', async () => {
    (global.fetch as jest.Mock).mockRejectedValue(new Error('offline'));
    const { result } = makeHook();

    let outcome;
    await act(async () => {
      outcome = await result.current.submitSetup(players);
    });

    expect(outcome).toEqual({
      ok: false,
      error: { kind: 'network', message: 'networkError' },
    });
    expect(result.current.setupError).toEqual({ kind: 'network', message: 'networkError' });
    expect(mockLogger.error).toHaveBeenCalledWith(
      'Qualification setup request failed',
      expect.objectContaining({ tournamentId, mode: 'bm' }),
    );
  });

  it('rejects an empty selection without making a request', async () => {
    const { result } = makeHook();

    await act(async () => {
      await result.current.submitSetup([]);
    });

    expect(global.fetch).not.toHaveBeenCalled();
    expect(result.current.setupError).toEqual({
      kind: 'validation',
      message: 'selectAtLeastOnePlayer',
    });
  });

  it('blocks a concurrent non-idempotent submission', async () => {
    let resolveRequest!: (response: Response) => void;
    const pendingRequest = new Promise<Response>((resolve) => {
      resolveRequest = resolve;
    });
    (global.fetch as jest.Mock).mockReturnValue(pendingRequest);
    const { result } = makeHook();

    let firstRequest!: Promise<unknown>;
    act(() => {
      firstRequest = result.current.submitSetup(players);
    });

    let duplicateOutcome;
    await act(async () => {
      duplicateOutcome = await result.current.submitSetup(players);
    });

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(duplicateOutcome).toEqual({
      ok: false,
      error: { kind: 'validation', message: 'operationInProgress' },
    });

    await act(async () => {
      resolveRequest({ ok: true, status: 200 } as Response);
      await firstRequest;
    });
  });

  it('allows an explicit retry after failure', async () => {
    (global.fetch as jest.Mock)
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ ok: true, status: 200 } as Response);
    const refetch = jest.fn();
    const { result } = makeHook(refetch);

    await act(async () => {
      await result.current.submitSetup(players);
    });
    expect(result.current.setupError).toEqual({ kind: 'network', message: 'networkError' });

    let retryOutcome;
    await act(async () => {
      retryOutcome = await result.current.submitSetup(players);
    });

    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(retryOutcome).toEqual({ ok: true });
    expect(result.current.setupError).toBeNull();
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('treats refresh failure after a successful POST as success', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true, status: 200 } as Response);
    const refetch = jest.fn().mockRejectedValue(new Error('refresh failed'));
    const { result } = makeHook(refetch);

    let outcome;
    await act(async () => {
      outcome = await result.current.submitSetup(players);
    });

    expect(outcome).toEqual({ ok: true });
    expect(result.current.setupError).toBeNull();
    expect(mockLogger.warn).toHaveBeenCalledWith(
      'Qualification setup refresh failed after successful submit',
      expect.objectContaining({ tournamentId, mode: 'bm' }),
    );
  });

  it('clears a displayed error without changing form ownership', async () => {
    (global.fetch as jest.Mock).mockRejectedValue(new Error('offline'));
    const { result } = makeHook();

    await act(async () => {
      await result.current.submitSetup(players);
    });
    act(() => result.current.clearSetupError());

    expect(result.current.setupError).toBeNull();
  });
});
