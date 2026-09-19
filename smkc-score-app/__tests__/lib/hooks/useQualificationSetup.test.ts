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

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
};

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

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

    expect(global.fetch).toHaveBeenCalledWith(
      `/api/tournaments/${tournamentId}/bm`,
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ players }),
        signal: expect.any(AbortSignal),
      }),
    );
    expect(refetch).toHaveBeenCalledTimes(1);
    expect(outcome).toEqual({ ok: true });
    expect(result.current.setupError).toBeNull();
    expect(result.current.setupSaving).toBe(false);
  });

  it('uses a localized validation fallback for 4xx while preserving the machine-readable code', async () => {
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
        message: 'setupValidationError',
      },
    });
    expect(result.current.setupError).toEqual(expect.objectContaining({ kind: 'validation' }));
    expect(result.current.setupError?.message).not.toBe('Invalid seeding');
    expect(refetch).not.toHaveBeenCalled();
    expect(mockLogger.warn).toHaveBeenCalledWith(
      'Qualification setup rejected',
      expect.objectContaining({ status: 400, code: 'INVALID_SEEDING' }),
    );
  });

  it('uses a localized server fallback for a JSON 5xx response without exposing raw detail', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: 'Database connection failed', code: 'INTERNAL_ERROR' }),
    } as unknown as Response);
    const { result } = makeHook();

    await act(async () => {
      await result.current.submitSetup(players);
    });

    expect(result.current.setupError).toEqual({
      kind: 'server',
      status: 500,
      code: 'INTERNAL_ERROR',
      message: 'setupServerError',
    });
    expect(result.current.setupError?.message).not.toBe('Database connection failed');
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

  it('allows a new tournament to submit and ignores an old late success', async () => {
    const requestA = deferred<Response>();
    const requestB = deferred<Response>();
    const refetchA = jest.fn();
    const refetchB = jest.fn();
    (global.fetch as jest.Mock).mockReturnValueOnce(requestA.promise).mockReturnValueOnce(requestB.promise);

    const { result, rerender } = renderHook(
      ({ currentTournamentId, refetch }) =>
        useQualificationSetup({ tournamentId: currentTournamentId, mode: 'bm', refetch }),
      { initialProps: { currentTournamentId: 'A', refetch: refetchA } },
    );

    let outcomeA!: Promise<unknown>;
    act(() => {
      outcomeA = result.current.submitSetup(players);
    });
    expect(result.current.setupSaving).toBe(true);
    const signalA = (global.fetch as jest.Mock).mock.calls[0][1].signal as AbortSignal;
    expect(signalA.aborted).toBe(false);

    rerender({ currentTournamentId: 'B', refetch: refetchB });
    expect(signalA.aborted).toBe(true);
    expect(result.current.setupSaving).toBe(false);
    expect(result.current.setupError).toBeNull();

    let outcomeB!: Promise<unknown>;
    act(() => {
      outcomeB = result.current.submitSetup(players);
    });
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(result.current.setupSaving).toBe(true);

    let staleResult;
    await act(async () => {
      requestA.resolve({ ok: true, status: 200 } as Response);
      staleResult = await outcomeA;
    });

    expect(staleResult).toEqual({ ok: false });
    expect(refetchA).not.toHaveBeenCalled();
    expect(result.current.setupSaving).toBe(true);
    expect(result.current.setupError).toBeNull();

    let currentResult;
    await act(async () => {
      requestB.resolve({ ok: true, status: 200 } as Response);
      currentResult = await outcomeB;
    });

    expect(currentResult).toEqual({ ok: true });
    expect(refetchB).toHaveBeenCalledTimes(1);
    expect(result.current.setupSaving).toBe(false);
  });

  it('ignores an old-context transport failure after tournament navigation', async () => {
    const requestA = deferred<Response>();
    const refetchA = jest.fn();
    const refetchB = jest.fn();
    (global.fetch as jest.Mock).mockReturnValue(requestA.promise);

    const { result, rerender } = renderHook(
      ({ currentTournamentId, refetch }) =>
        useQualificationSetup({ tournamentId: currentTournamentId, mode: 'bm', refetch }),
      { initialProps: { currentTournamentId: 'A', refetch: refetchA } },
    );

    let outcomeA!: Promise<unknown>;
    act(() => {
      outcomeA = result.current.submitSetup(players);
    });

    rerender({ currentTournamentId: 'B', refetch: refetchB });

    let staleResult;
    await act(async () => {
      requestA.reject(new Error('old transport detail'));
      staleResult = await outcomeA;
    });

    expect(staleResult).toEqual({ ok: false });
    expect(result.current.setupError).toBeNull();
    expect(result.current.setupSaving).toBe(false);
    expect(refetchA).not.toHaveBeenCalled();
    expect(mockLogger.error).not.toHaveBeenCalledWith(
      'Qualification setup request failed',
      expect.objectContaining({ tournamentId: 'A' }),
    );
  });
});
